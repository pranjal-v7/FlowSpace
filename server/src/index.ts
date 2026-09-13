import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import {
  PORT,
  SESSION_RECONNECT_WINDOW_MS,
  WS_HEARTBEAT_INTERVAL_MS,
} from "./config.js";
import { MessageDispatcher } from "./dispatcher.js";
import { RoomManager } from "./room.js";
import { UserSession } from "./session.js";

// Extended WebSocket with liveness flag
interface ExtWebSocket extends WebSocket {
  isAlive?: boolean;
}

// Initialize core server components
const roomManager = new RoomManager();
const dispatcher = new MessageDispatcher(roomManager);

// HTTP Server for health checks and WebSocket upgrade
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "FlowSpace Server",
        timestamp: Date.now(),
      })
    );
    return;
  }

  res.writeHead(404);
  res.end();
});

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: ExtWebSocket) => {
  let session: UserSession | null = null;
  ws.isAlive = true;

  // Handle incoming messages
  ws.on("message", (data) => {
    ws.isAlive = true;
    try {
      dispatcher.dispatch(ws, data as string | Buffer, session, (newSession) => {
        session = newSession;
      });
    } catch (err) {
      console.error("[WS] Unhandled message error:", err);
    }
  });

  // Handle WS-level pong for liveness heartbeat
  ws.on("pong", () => {
    ws.isAlive = true;
    if (session) {
      session.isAlive = true;
      session.lastSeenAt = Date.now();
    }
  });

  // Handle socket close (distinguish intentional leave vs unexpected network disconnect)
  ws.on("close", () => {
    if (session) {
      if (session.state === "left") {
        // User already explicitly left via handleLeave; already cleaned up
        return;
      }

      // Unexpected disconnect (network drop, tab sleep, quick refresh):
      // Retain session in room during grace period so client can resume via resumeToken
      session.markReconnecting();
      session.lastSeenAt = Date.now();
      session.lastCursor = null;

      const room = roomManager.getRoom(session.roomId);
      if (room) {
        // Broadcast presence_leave immediately so remote cursor disappears
        room.broadcastExcept(session.userId, {
          type: "presence_leave",
          userId: session.userId,
        });
      }
    }
  });

  // Handle socket error
  ws.on("error", (err) => {
    console.error("[WS] Socket error:", err);
  });
});

// Heartbeat interval for liveness detection and disconnected session cleanup
const heartbeatInterval = setInterval(() => {
  const now = Date.now();

  // 1. Ping active sockets for liveness
  wss.clients.forEach((client) => {
    const extWs = client as ExtWebSocket;
    if (extWs.isAlive === false) {
      extWs.terminate();
      return;
    }
    extWs.isAlive = false;
    try {
      extWs.ping();
    } catch {
      extWs.terminate();
    }
  });

  // 2. Clean up disconnected sessions that exceeded reconnect grace period (30 seconds)
  for (const [roomId, room] of roomManager.getAllRooms().entries()) {
    for (const [userId, session] of room.members.entries()) {
      if (!session.connected && now - session.lastSeenAt > SESSION_RECONNECT_WINDOW_MS) {
        // Broadcast presence_leave for expired session
        room.broadcastExcept(userId, {
          type: "presence_leave",
          userId: userId,
        });
        roomManager.removeMember(roomId, userId);
      }
    }
  }

  // 3. Clean up empty rooms
  roomManager.cleanDeadRooms();
}, WS_HEARTBEAT_INTERVAL_MS);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 FlowSpace Realtime Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
});

