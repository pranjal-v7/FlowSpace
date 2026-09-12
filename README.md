# FlowSpace — Real-Time Collaborative Canvas

**FlowSpace** is a high-performance, lightweight real-time multiplayer canvas built from first principles using **raw WebSockets**, **TypeScript**, **Node.js**, and **React**.

FlowSpace is engineered specifically to demonstrate clean real-time state synchronization, 25–30Hz throttled cursor sampling, monotonic sequence numbers, bounded client-side linear interpolation (`requestAnimationFrame`), robust reconnect session continuity, per-client backpressure isolation, server-authoritative room capacity (strict 8-user limit), runtime Zod schema validation, and scoped collaborative drawing tools.

---

## 1. Key Features & Invariants

- **Raw WebSocket Transport**: No Socket.IO, Firebase, Yjs, Liveblocks, or external sync services. Pure custom protocol with Zod runtime validation on every inbound message.
- **Strict Capacity Enforcement**: Hard room limit of 8 concurrent users. Synchronous atomic checks prevent 9th-user race conditions and return `room_full`.
- **Server Identity Authority**: Server assigns logical `userId`, collaborator color, `resumeToken`, and `sessionVersion`. Client-supplied identities are never trusted.
- **Leave vs. Reconnect Lifecycle**:
  - **Temporary Disconnect** (Network loss, Wi-Fi drop, quick refresh): Server retains session for a 30s grace period (`state: "reconnecting"`), immediately hiding remote cursor to prevent ghosts. On reconnect with `resumeToken`, client resumes the exact same `userId`, color, and presence slot, receiving a fresh `room_snapshot` and broadcasting `presence_join` to others.
  - **Explicit Leave** (User clicks "Leave" and confirms): Client immediately halts updates, dispatches `{ type: "leave" }`, server broadcasts `presence_leave`, responds with `leave_ack`, purges `resumeToken`, marks session `"left"`, and closes socket with code 1000.
  - **Canvas Object Permanence**: Pen strokes, shapes, and text created by departing users remain visible in the room under their original `creatorId`.
  - **Rejoining with Fresh Identity**: Explicitly leaving clears credentials. If the user rejoins the room later, they enter as a brand new participant with a new `userId`, distinct color, and fresh session.
- **High-Frequency Cursors with Linear Interpolation**:
  - Outgoing pointer positions normalized to `[0, 1]` and throttled to 25–30Hz.
  - Monotonic sequence numbers protect against out-of-order and stale packets.
  - Bounded 2–3 sample remote buffer with linear lerp rendered via dedicated `requestAnimationFrame` loop.
  - Direct DOM `transform: translate3d(...)` updates bypass React render cycles for steady 60 FPS performance.
- **Collaborative Canvas Tools**:
  - Freehand Pen with batched point streaming (up to 50 pts/message)
  - Semi-transparent Highlighter
  - Geometric Shapes (Rectangle, Circle, Line, Arrow) with live dragging previews
  - Inline Text editing with font and size selection
  - Owner-only Eraser (server validates creator before deletion; Room Creator has master erase authority)
  - 20-action bounded Undo / Redo stack scoped per user
- **Live Diagnostics & RTT Measurement**:
  - Real-time smoothed RTT (`app_ping`/`app_pong` with EMA), render FPS counter, message rates, socket buffer sizes.

---

## 2. Architecture & Tech Stack

```
FlowSpace/
├── package.json                    # Workspace orchestration scripts
├── shared/                         # Shared schemas & types
│   ├── schemas.ts                  # Zod validation schemas
│   └── types.ts                    # Inferred TypeScript types & constants
├── server/                         # Backend (Node.js + ws + TypeScript)
│   ├── src/
│   │   ├── index.ts                # HTTP + WebSocket server setup & heartbeat
│   │   ├── config.ts               # Configuration constants
│   │   ├── room.ts                 # RoomManager & Room models (capacity, broadcast)
│   │   ├── session.ts              # UserSession and token generators
│   │   ├── rateLimiter.ts          # Token-bucket rate limiters
│   │   ├── dispatcher.ts           # Protocol dispatcher & Zod validator
│   │   └── handlers/               # Modular action handlers
│   └── test/
│       ├── protocol.test.ts        # Unit tests for schemas, limits, erase auth
│       └── e2e.test.ts             # E2E multi-client sync & capacity tests
└── client/                         # Frontend (React 19 + Vite + TypeScript)
    └── src/
        ├── realtime/               # wsClient, cursorEngine, interpolator, telemetry
        ├── canvas/                 # canvasRenderer, undoManager
        └── components/             # React UI components (Header, Canvas, Toolbars, Presence)
```

---

## 3. Quick Start & Setup Instructions

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Install Dependencies
```bash
npm install
npm --prefix server install
npm --prefix client install
```

### 2. Run Both Server & Client Concurrently
```bash
npm run dev
```
- **Backend WebSocket Server**: `http://localhost:4000` (WS: `ws://localhost:4000`)
- **Frontend Client UI**: `http://localhost:3000`

### 3. Run Automated Tests
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
```

---

## 4. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `4000` | Port for the backend HTTP & WebSocket server |
| `VITE_WS_URL` | `ws://localhost:4000` | WebSocket endpoint URL for client connection |

---

## 5. WebSocket Architecture & Protocol Message Types

Communication uses JSON over raw WebSocket connections (`ws`). Every incoming payload is strictly validated using Zod schemas in `shared/schemas.ts`.

### Client-to-Server Messages
- `join`: Request to enter a room (`roomId`, `displayName`, `preferredColor`, optional `resumeToken`).
- `resume`: Request to restore a disconnected session (`roomId`, `resumeToken`, `sessionVersion`).
- `cursor`: High-frequency normalized cursor position (`seq`, `x`, `y`, `timestamp`).
- `stroke`: Streaming stroke points (`strokeId`, `color`, `size`, `opacity`, `points`).
- `stroke_end`: Finalizes a freehand stroke (`strokeId`).
- `shape_create`: Commits a geometric shape (`shapeId`, `shapeType`, `startX`, `startY`, `endX`, `endY`, `fill`).
- `text_create`: Commits text (`textId`, `x`, `y`, `content`, `color`, `font`, `fontSize`).
- `erase`: Deletes a canvas object (`objectId`).
- `clear_canvas`: Creator-only master wipe of all room objects.
- `reaction`: Sends an ephemeral emoji reaction (`id`, `emoji`, `x`, `y`).
- `leave`: Explicit departure from the room.
- `app_ping`: Application-level latency probe with timestamp.

### Server-to-Client Messages
- `welcome`: Confirms session creation with assigned `userId`, `resumeToken`, and `isHost`.
- `room_snapshot`: Full baseline state sent to new joiners (`users`, `cursors`, `objects`).
- `presence_join`: Broadcast when a user joins or resumes.
- `presence_leave`: Broadcast when a user disconnects or leaves.
- `leave_ack`: Sent to client confirming voluntary departure.
- `cursor`: Broadcast remote cursor snapshot with monotonic sequence.
- `stroke`: Broadcasts new or streaming stroke points.
- `stroke_end`: Signals stroke completion.
- `shape_create` / `text_create`: Broadcasts newly created objects.
- `erase`: Broadcasts object removal.
- `clear_canvas`: Broadcasts full canvas wipe.
- `reaction`: Broadcasts ephemeral emoji reaction bursts.
- `room_full`: Error sent when room capacity (8 users) is reached.
- `app_pong`: Echoes ping timestamp for RTT calculation.
- `error`: Structured error code and message.

---

## 6. Strategies & Engineering Decisions

### Throttling Strategy
- **Cursor Emissions**: Pointer events are sampled and throttled to 25–30Hz (35ms interval) in `LocalCursorEngine`. If movement is below `0.0008` normalized distance, updates are skipped to eliminate redundant network traffic.
- **Server Rate Limiting**: Token-bucket limiters guard each session: 35 cursor pkts/sec, 5 reactions/sec, 50 drawing actions/sec.

### Batching Strategy
- **Stroke Streaming**: Pointer events collected during drawing are accumulated into batches up to 50 points (`MAX_POINTS_PER_STROKE_MSG = 50`) before dispatching a `stroke` frame.
- When the pointer is released, remaining points are flushed followed by a `stroke_end` frame.

### Interpolation Strategy & Latency vs. Smoothness Tradeoff
- **Implementation**: `RemoteCursorInterpolator` maintains a rolling buffer of 2–3 recent samples per remote user. Inside `requestAnimationFrame`, positions are interpolated between the two most recent samples using linear interpolation (`lerp`).
- **Tradeoff**:
  - Shorter delay (20–40ms): Lower latency, but potential jitter/snapping if packets arrive irregularly over degraded networks.
  - Longer delay (80–120ms): Extra smoothness against jitter and packet loss, but slight visual lag behind real-world cursor movements.
  - **Selected Default**: **60ms** provides the optimal balance between real-time responsiveness and silky 60 FPS motion without visible teleporting.
- **Direct DOM Manipulation**: Transforms (`translate3d`) are written directly to DOM element styles, completely bypassing React's virtual DOM reconciliation.

### Backpressure & Lane Separation
- **Dual Lane Handling**:
  - **Droppable Cursor Lane**: If client socket `bufferedAmount` exceeds 64KB on the server or 32KB on the client, cursor packets are dropped immediately to prevent head-of-line blocking.
  - **Must-Deliver Lane**: State messages (`stroke`, `shape`, `text`, `erase`, `reaction`, `presence`) are never dropped and must be delivered reliably.

### Security & Trust Model
- **No Client Impersonation**: `creatorId`, `userId`, and `color` are derived from the server session, never trusted from client payload.
- **Erase Authority**: Regular participants can only delete objects matching their own `session.userId`. The Room Creator holds master erase privileges.
- **Runtime Validation**: Every incoming frame is parsed against Zod schemas; malformed frames or unknown types are rejected with structured error responses.

---

## 7. Multi-Tab Verification Guide

To test FlowSpace locally with multiple participants:

1. Open `http://localhost:3000` in **Tab 1** and join as **Alice** (select "Create New Room").
2. Copy or note the 6-digit room code displayed in the header.
3. Open `http://localhost:3000` in **Tab 2** (or Incognito) and enter the room code as **Bob** ("Join Existing Room").
4. **Observe**:
   - Both users receive distinct collaborator colors.
   - Remote cursors move smoothly in real time.
   - The presence sidebar reflects both users in the 8-slot roster.
   - Live RTT and render FPS are active in the header.
5. Draw shapes, freehand strokes, and trigger emoji reactions.
6. Verify erase permissions: Bob cannot erase Alice's rectangle; Alice (Creator) can erase any object.
7. Disconnect Tab 2 (refresh or toggle offline in DevTools). Notice Tab 1 sees Tab 2's cursor disappear. Within 20 seconds, reconnect Tab 2: Tab 2 resumes its exact session with same `userId` and color without duplicate presence slots.

---

## 8. Known Limitations

- **In-Memory State**: Room and canvas state are persisted in server memory; restarting the Node.js process resets rooms. (Designed as per assignment scope; production deployment would back rooms with Redis / SQLite WAL).
- **Hard Object Cap**: Whiteboards are bounded to 750 persistent canvas objects (`MAX_OBJECTS_PER_ROOM`) to guarantee fast snapshot delivery and bounded memory.

---

## 9. Time Spent & AI Usage Disclosure

- **Estimated Time Spent**: ~18 hours total (Architecture design, WebSocket protocol implementation, canvas rendering engine, responsive UI animation, and comprehensive failure-handling testing).
- **AI Usage Disclosure**: Google DeepMind Antigravity AI agent was used as an interactive pair programmer for code generation, responsive CSS design, test suite development, and automated browser verification.
