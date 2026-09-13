# FlowSpace Architecture & Protocol Deep-Dive

This document details the architectural design decisions, synchronization protocols, failure handling, interpolation mechanics, memory boundaries, and scaling characteristics of **FlowSpace**.

---

## 1. Architectural Philosophy & Layer Separation

FlowSpace enforces strict modular decoupling between five layers:

```text
┌─────────────────────────────────────────────────────────┐
│                       React UI Layer                    │
│   Room state, Toolbars, Presence list, Telemetry modals │
└────────────────────────────┬────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
 ┌──────────────────────┐          ┌──────────────────────┐
 │ Canvas Object Engine │          │ Realtime Cursor      │
 │  Infinite World 2D   │          │ Interpolator Engine  │
 │  Local Camera        │          │ World-to-Screen LERP │
 │  Owner-Only Erase    │          │ RAF Direct DOM Lerp  │
 └──────────┬───────────┘          └──────────┬───────────┘
            │                                 │
            └────────────────┬────────────────┘
                             ▼
                 ┌──────────────────────┐
                 │ WebSocket Transport  │
                 │ Dual-Lane Queues     │
                 │ Backpressure Guard   │
                 └───────────┬──────────┘
                             │ (Raw WS)
                             ▼
                 ┌──────────────────────┐
                 │ Node.js Server       │
                 │ Dispatcher & Zod     │
                 │ 500 Room / 60s Cool  │
                 │ Heartbeat & Cleanup  │
                 └──────────────────────┘
```

1. **Transport Layer (`wsClient.ts`)**: Manages native browser WebSocket lifecycle (`CONNECTING`, `OPEN`, `RECONNECTING`, `CLOSED`), exponential reconnect backoff, and socket buffer observation (`socket.bufferedAmount`).
2. **Protocol & Dispatch Layer (`dispatcher.ts`, `schemas.ts`)**: Inbound payloads are strictly validated using Zod schemas before reaching any state-mutating logic.
3. **Cursor Engine & Interpolator (`cursorEngine.ts`, `interpolator.ts`)**: Throttles local sampling to 25–30Hz in world units and runs an independent `requestAnimationFrame` interpolation loop, projecting world coordinates to screen space using the local camera.
4. **Canvas Engine (`canvasRenderer.ts`, `coordinates.ts`, `undoManager.ts`)**: Manages DPR-aware 2D canvas drawing, coordinate transforms, camera translation/scaling, batch streaming, and scoped undo/redo.
5. **UI Layer (`App.tsx`, components)**: Driven by React state; isolated from high-frequency cursor packets.

---

## 2. State Ownership & Invariants

| State | Authority | Notes |
|---|---|---|
| User Identity (`userId`, `color`, `resumeToken`) | **Server** | Clients cannot impersonate or choose identities. |
| Room Membership & Capacity | **Server** | Synchronously checked; hard cap of 8 users per room, 500 rooms per server. |
| Camera State (`x`, `y`, `zoom`) | **Client (Local)** | 100% client-side; zero WebSocket traffic; never synchronized between users. |
| Cursor Positions | **Client (Ephemeral)** | Broadcast in world coordinates; latest-value oriented; intermediate frames droppable. |
| Monotonic Sequence | **Client / Server** | Per-user sequence number; stale sequences dropped. |
| Canvas Objects | **Server (Authoritative)** | Stored in world coordinates (capped at 750 objects/room). |
| Erase Authorization | **Server** | Owner-only policy: `requestingUserId === obj.creatorId` (or Room Creator master authority). |
| Empty Room Cooldown | **Server** | 60-second cooldown period before empty room state deletion. |
| Undo / Redo | **Client (Scoped)** | 20 actions max; only affects local user's own objects. |

---

## 3. Infinite Canvas & Camera Mathematics

To ensure responsive consistency across all devices, objects are stored in world units:

### 3.1 Screen $\rightarrow$ World Transformation (Pointer Input)
```typescript
worldX = (screenX - camera.x) / camera.zoom;
worldY = (screenY - camera.y) / camera.zoom;
```

### 3.2 World $\rightarrow$ Screen Transformation (Rendering & DOM Overlays)
```typescript
screenX = worldX * camera.zoom + camera.x;
screenY = worldY * camera.zoom + camera.y;
```

### 3.3 Focused Zoom Mathematics
When zooming at a screen position $(s_x, s_y)$ with new zoom $z_{\text{new}}$:
$$w_x = \frac{s_x - \text{camera.x}}{\text{camera.zoom}}, \quad w_y = \frac{s_y - \text{camera.y}}{\text{camera.zoom}}$$
$$\text{camera.x}_{\text{new}} = s_x - w_x \cdot z_{\text{new}}$$
$$\text{camera.y}_{\text{new}} = s_y - w_y \cdot z_{\text{new}}$$

---

## 4. Protocol Specification

All messages are JSON objects validated at runtime against Zod schemas.

### 4.1 Client $\rightarrow$ Server Messages
- `join`: `{ type: "join", roomId: string, displayName: string, preferredColor?: string, resumeToken?: string, isCreating?: boolean }`
- `resume`: `{ type: "resume", roomId: string, resumeToken: string, sessionVersion: number }`
- `cursor`: `{ type: "cursor", seq: number, x: number, y: number, timestamp: number }` (world coordinates)
- `stroke`: `{ type: "stroke", strokeId: string, color: string, size: number, opacity: number, isHighlighter?: boolean, points: [number, number][] }`
- `stroke_end`: `{ type: "stroke_end", strokeId: string }`
- `shape_create`: `{ type: "shape_create", shapeId: string, shapeType: string, color: string, size: number, opacity: number, startX: number, startY: number, endX: number, endY: number, fill?: boolean }`
- `text_create`: `{ type: "text_create", textId: string, x: number, y: number, content: string, color: string, font: string, fontSize: number }`
- `erase`: `{ type: "erase", objectId: string }`
- `reaction`: `{ type: "reaction", id: string, emoji: string, x: number, y: number }`
- `leave`: `{ type: "leave" }`
- `clear_canvas`: `{ type: "clear_canvas" }` (Room Creator only)
- `app_ping`: `{ type: "app_ping", timestamp: number }`

### 4.2 Server $\rightarrow$ Client Messages
- `welcome`: `{ type: "welcome", userId: string, resumeToken: string, sessionVersion: number, color: string, displayName: string, roomId: string, isHost: boolean }`
- `room_snapshot`: `{ type: "room_snapshot", roomId: string, capacity: number, users: Participant[], cursors: RemoteCursorSnapshot[], objects: CanvasObject[] }`
- `presence_join`: `{ type: "presence_join", user: Participant }`
- `presence_leave`: `{ type: "presence_leave", userId: string }`
- `cursor`: `{ type: "cursor", userId: string, seq: number, x: number, y: number, timestamp: number }`
- `stroke`: `{ type: "stroke", creatorId: string, strokeId: string, color: string, size: number, opacity: number, isHighlighter?: boolean, points: [number, number][] }`
- `stroke_end`: `{ type: "stroke_end", creatorId: string, strokeId: string }`
- `shape_create`: `{ type: "shape_create", object: CanvasShapeObject }`
- `text_create`: `{ type: "text_create", object: CanvasTextObject }`
- `erase`: `{ type: "erase", objectId: string, eraserId: string }`
- `clear_canvas`: `{ type: "clear_canvas", clearedBy: string }`
- `reaction`: `{ type: "reaction", userId: string, id: string, emoji: string, x: number, y: number }`
- `room_full`: `{ type: "room_full", roomId: string, capacity: number }`
- `error`: `{ type: "error", code: string, message: string }`
- `app_pong`: `{ type: "app_pong", clientTimestamp: number, serverTimestamp: number }`

---

## 5. Failure Handling & Resilience Matrix

| Failure Mode | System Response |
|---|---|
| **Network Loss / Disconnect** | Client enters `RECONNECTING` state; initiates exponential backoff with random jitter (1s, 2s, 4s, 8s, 10s max). Session held for 30s grace period. |
| **Reconnect Race / Session Replacement** | Client sends `resume` with `resumeToken`. Server replaces old socket, increments `sessionVersion`, invalidates stale socket, and delivers fresh `room_snapshot`. |
| **Empty Room Disconnect** | When all users leave or drop, the room enters a **60-second cooldown period** (`emptySince`). If any user rejoins within 60s, state is preserved; otherwise deleted. |
| **Room Flood Attack** | Server enforces `MAX_ACTIVE_ROOMS = 500`. Excess room creation attempts are rejected with `ROOM_LIMIT_REACHED` to guarantee operation under Render's 512 MB memory boundary. |
| **Stale Packets from Old Socket** | Packets arriving with superseded `sessionVersion` or lower cursor `seq` are discarded. |
| **Slow Client Backpressure** | Server checks `socket.bufferedAmount`. If congested (>64KB), droppable cursor frames are dropped for that client only. Healthy clients are unaffected. |
| **Malformed Payload / Schema Violation** | Discarded immediately by Zod `safeParse()`; structured `error` returned; connection remains stable. |
| **9th User Joins Full Room** | Synchronous atomic capacity check rejects join with `room_full` and terminates socket without disrupting the 8 active members. |
| **Dead Connection (Unclean Close)** | WebSocket heartbeat pings every 5s. Missed heartbeats terminate session after ~10–12s and broadcast `presence_leave`. |

---

## 6. Render Memory Sizing & Cloud Resource Budget

- **Target Cloud Environment**: Render Standard Web Service (512 MB RAM Free/Starter Tier).
- **Per-Room Memory Footprint**: ~150 KB – 300 KB (8 active sessions, 750 vector objects, participant state).
- **500 Active Rooms Maximum**: $500 \times 300\,\text{KB} \approx 150\,\text{MB}$, leaving over $350\,\text{MB}$ for Node.js V8 heap, Garbage Collector headroom, and WebSocket buffer queues.
