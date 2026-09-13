import { WebSocket } from "ws";
import { ClientMessageSchema } from "./shared/schemas.js";
import { ServerMessage } from "./shared/types.js";
import {
  handleClearCanvas,
  handleErase,
  handleShapeCreate,
  handleStroke,
  handleStrokeEnd,
  handleTextCreate,
} from "./handlers/canvasHandler.js";
import { handleCursor } from "./handlers/cursorHandler.js";
import { handleJoin, handleResume } from "./handlers/joinHandler.js";
import { handleLeave } from "./handlers/leaveHandler.js";
import { handlePing } from "./handlers/pingHandler.js";
import { handleReaction } from "./handlers/reactionHandler.js";
import { RoomManager } from "./room.js";
import { UserSession } from "./session.js";

export class MessageDispatcher {
  private roomManager: RoomManager;

  constructor(roomManager: RoomManager) {
    this.roomManager = roomManager;
  }

  dispatch(
    socket: WebSocket,
    rawData: string | Buffer,
    currentSession: UserSession | null,
    setSession: (session: UserSession | null) => void
  ): void {
    // 1. JSON parsing
    let parsedJson: unknown;
    try {
      const text = typeof rawData === "string" ? rawData : rawData.toString("utf-8");
      parsedJson = JSON.parse(text);
    } catch {
      this.sendError(socket, "INVALID_JSON", "Malformed JSON payload received");
      return;
    }

    // 2. Runtime Zod Schema Validation
    const validationResult = ClientMessageSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      this.sendError(
        socket,
        "INVALID_SCHEMA",
        `Validation failed: ${validationResult.error.issues.map((i) => i.message).join(", ")}`
      );
      return;
    }

    const message = validationResult.data;

    // 3. Pre-auth / Sessionless messages
    if (message.type === "app_ping") {
      handlePing(socket, message);
      return;
    }

    if (message.type === "join") {
      handleJoin(socket, message, this.roomManager, currentSession, setSession);
      return;
    }

    if (message.type === "resume") {
      handleResume(socket, message, this.roomManager, setSession);
      return;
    }

    // 4. Authenticated session-dependent messages
    if (!currentSession || currentSession.state === "left" || !currentSession.connected) {
      this.sendError(socket, "UNAUTHORIZED", "Must join or resume a room session before sending actions");
      return;
    }

    const room = this.roomManager.getRoom(currentSession.roomId);
    if (!room) {
      this.sendError(socket, "ROOM_NOT_FOUND", "Associated room no longer exists");
      return;
    }

    currentSession.lastSeenAt = Date.now();
    currentSession.isAlive = true;

    // 5. Action routing
    switch (message.type) {
      case "cursor":
        handleCursor(message, currentSession, room);
        break;

      case "stroke":
        handleStroke(message, currentSession, room);
        break;

      case "stroke_end":
        handleStrokeEnd(message, currentSession, room);
        break;

      case "shape_create":
        handleShapeCreate(message, currentSession, room);
        break;

      case "text_create":
        handleTextCreate(message, currentSession, room);
        break;

      case "erase":
        handleErase(message, currentSession, room);
        break;

      case "clear_canvas":
        handleClearCanvas(currentSession, room);
        break;

      case "reaction":
        handleReaction(message, currentSession, room);
        break;

      case "leave":
        handleLeave(room, currentSession, this.roomManager, setSession);
        break;
    }
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "error",
          code,
          message,
        } satisfies ServerMessage)
      );
    }
  }
}
