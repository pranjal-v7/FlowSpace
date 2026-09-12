# FlowSpace Architecture & Protocol Deep-Dive

This document details the architectural design decisions, synchronization protocols, failure handling, interpolation mechanics, and scaling characteristics of **FlowSpace**.

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
 │  2D HTML5 Renderer   │          │ Interpolator Engine  │
 │  Strokes, Shapes     │          │ Bounded buffer (2-3) │
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
                 │ Room & Session Map   │
                 │ Heartbeat & Cleanup  │
                 └──────────────────────┘
```

1. **Transport Layer (`wsClient.ts`)**: Manages native browser WebSocket lifecycle (`CONNECTING`, `OPEN`, `RECONNECTING`, `CLOSED`), exponential reconnect backoff, and socket buffer observation (`socket.bufferedAmount`).
2. **Protocol & Dispatch Layer (`dispatcher.ts`, `schemas.ts`)**: Inbound payloads are strictly validated using Zod schemas before reaching any state-mutating logic.
3. **Cursor Engine & Interpolator (`cursorEngine.ts`, `interpolator.ts`)**: Throttles local sampling to 25–30Hz and runs an independent `requestAnimationFrame` interpolation loop, directly updating DOM transforms with GPU acceleration.
4. **Canvas Engine (`canvasRenderer.ts`, `undoManager.ts`)**: Manages DPR-aware 2D canvas drawing, batch streaming, and scoped undo/redo.
5. **UI Layer (`App.tsx`, components)**: Driven by React state; isolated from high-frequency cursor packets.

---

## 2. State Ownership & Invariants

| State | Authority | Notes |
|---|---|---|
| User Identity (`userId`, `color`, `resumeToken`) | **Server** | Clients cannot impersonate or choose identities. |
| Room Membership & Capacity | **Server** | Synchronously checked; hard cap of 8 users per room. |
| Cursor Positions | **Client (Ephemeral)** | Latest-value oriented; intermediate frames droppable. |
| Monotonic Sequence | **Client / Server** | Per-user sequence number; stale sequences dropped. |
| Canvas Objects | **Server (Authoritative)** | Validated and stored in memory (capped at 750). |
| Erase Authorization | **Server** | Owner-only policy: `requestingUserId === obj.creatorId`. |
| Undo / Redo | **Client (Scoped)** | 20 actions max; only affects local user's own objects. |

---

## 3. Protocol Specification

All messages are JSON objects validated at runtime against Zod schemas.

### 3.1 Client -> Server Messages
- `join`: `{ type: "join", roomId: string, displayName: string, preferredColor?: string, resumeToken?: string }`
- `resume`: `{ type: "resume", roomId: string, resumeToken: string, sessionVersion: number }`
- `cursor`: `{ type: "cursor", seq: number, x: number, y: number, timestamp: number }`
- `stroke`: `{ type: "stroke", strokeId: string, color: string, size: number, opacity: number, isHighlighter?: boolean, points: [number, number][] }`
- `stroke_end`: `{ type: "stroke_end", strokeId: string }`
- `shape_create`: `{ type: "shape_create", shapeId: string, shapeType: string, color: string, size: number, opacity: number, startX: number, startY: number, endX: number, endY: number, fill?: boolean }`
- `text_create`: `{ type: "text_create", textId: string, x: number, y: number, content: string, color: string, font: string, fontSize: number }`
- `erase`: `{ type: "erase", objectId: string }`
- `reaction`: `{ type: "reaction", id: string, emoji: string, x: number, y: number }`
- `leave`: `{ type: "leave" }`
- `app_ping`: `{ type: "app_ping", timestamp: number }`

### 3.2 Server -> Client Messages
- `welcome`: `{ type: "welcome", userId: string, resumeToken: string, sessionVersion: number, color: string, displayName: string, roomId: string }`
- `room_snapshot`: `{ type: "room_snapshot", roomId: string, capacity: number, users: Participant[], cursors: RemoteCursorSnapshot[], objects: CanvasObject[] }`
- `presence_join`: `{ type: "presence_join", user: Participant }`
- `presence_leave`: `{ type: "presence_leave", userId: string }`
- `cursor`: `{ type: "cursor", userId: string, seq: number, x: number, y: number, timestamp: number }`
- `stroke`: `{ type: "stroke", creatorId: string, strokeId: string, color: string, size: number, opacity: number, isHighlighter?: boolean, points: [number, number][] }`
- `stroke_end`: `{ type: "stroke_end", creatorId: string, strokeId: string }`
- `shape_create`: `{ type: "shape_create", object: CanvasShapeObject }`
- `text_create`: `{ type: "text_create", object: CanvasTextObject }`
- `erase`: `{ type: "erase", objectId: string, eraserId: string }`
- `reaction`: `{ type: "reaction", userId: string, id: string, emoji: string, x: number, y: number }`
- `room_full`: `{ type: "room_full", roomId: string, capacity: number }`
- `error`: `{ type: "error", code: string, message: string }`
- `app_pong`: `{ type: "app_pong", clientTimestamp: number, serverTimestamp: number }`

---

## 4. Cursor Interpolation Algorithm & Delay Tradeoffs

### Algorithm
Remote cursors store the 2–3 most recent positional samples:
$S = \{(x_0, y_0, t_0), (x_1, y_1, t_1), (x_2, y_2, t_2)\}$

In each frame of the `requestAnimationFrame` loop, target rendering time is computed as:
$$t_{\text{render}} = t_{\text{current}} - \Delta_{\text{interpolation}}$$

Between two bounding samples $(p_0, p_1)$ where $p_0.t \le t_{\text{render}} \le p_1.t$:
$$t_{\text{norm}} = \frac{t_{\text{render}} - p_0.t}{p_1.t - p_0.t}$$
$$x_{\text{render}} = p_0.x + (p_1.x - p_0.x) \cdot t_{\text{norm}}$$
$$y_{\text{render}} = p_0.y + (p_1.y - p_0.y) \cdot t_{\text{norm}}$$

### Delay Tuning & Tradeoffs
- **Lower Delay (20–40ms)**: Minimal perceived latency, but sensitive to network jitter; may cause cursor stalling or micro-snapping when packets arrive late.
- **Optimal Default (50–70ms)**: Excellent balance; smoothly absorbs typical internet jitter (10–30ms) while feeling instantaneous to human perception.
- **Higher Delay (100–150ms)**: Extremely smooth gliding even under severe network jitter, but cursors appear visibly delayed relative to spoken conversations.

---

## 5. Failure Handling & Resilience Matrix

| Failure Mode | System Response |
|---|---|
| **Network Loss / Disconnect** | Client enters `RECONNECTING` state; initiates exponential backoff with random jitter (1s, 2s, 4s, 8s, 10s max). |
| **Reconnect Race / Session Replacement** | Client sends `resume` with `resumeToken`. Server replaces old socket, increments `sessionVersion`, invalidates stale socket, and delivers fresh `room_snapshot`. |
| **Stale Packets from Old Socket** | Packets arriving with superseded `sessionVersion` or lower cursor `seq` are discarded. |
| **Slow Client Backpressure** | Server checks `socket.bufferedAmount`. If congested (>64KB), droppable cursor frames are dropped for that client only. Healthy clients are unaffected. |
| **Malformed Payload / Schema Violation** | Discarded immediately by Zod `safeParse()`; structured `error` returned; connection remains stable. |
| **9th User Joins Full Room** | Synchronous atomic capacity check rejects join with `room_full` and terminates socket without disrupting the 8 active members. |
| **Dead Connection (Unclean Close)** | WebSocket heartbeat pings every 5s. Missed heartbeats terminate session after ~10–12s and broadcast `presence_leave`. |
| **Empty Room** | When `room.members.size === 0`, room is deleted immediately from memory. |

---

## 6. Horizontal Scaling Considerations

The current MVP utilizes an in-memory single-process architecture. For horizontal scaling across multiple node instances:
1. **Sticky Sessions / Hash Ring**: Route room IDs consistently to specific instances.
2. **Pub/Sub Redis Backplane**: Broadcast room messages (strokes, reactions, cursors) across server nodes using Redis Pub/Sub channels keyed by `room:<roomId>`.
3. **Session Store**: Store active `resumeToken` metadata and session mappings in Redis with TTLs matching heartbeat expiration.
