import { WebSocket } from "ws";
import {
  ClientJoinMessage,
  ClientResumeMessage,
  ServerMessage,
} from "../shared/types.js";
import { RoomManager } from "../room.js";
import { createSession, UserSession } from "../session.js";

export function handleJoin(
  socket: WebSocket,
  message: ClientJoinMessage,
  roomManager: RoomManager,
  currentSession: UserSession | null,
  setSession: (session: UserSession) => void
): boolean {
  // Reject duplicate join on an already active connection
  if (currentSession && currentSession.connected) {
    socket.send(
      JSON.stringify({
        type: "error",
        code: "ALREADY_JOINED",
        message: "Connection already has an active room session",
      } satisfies ServerMessage)
    );
    return false;
  }

  const room = roomManager.getOrCreateRoom(message.roomId);
  if (!room) {
    socket.send(
      JSON.stringify({
        type: "error",
        code: "ROOM_LIMIT_REACHED",
        message: "Server active room limit reached. Please join an existing room or try again shortly.",
      } satisfies ServerMessage)
    );
    socket.close(1008, "Server room limit reached");
    return false;
  }

  // Check if resumeToken was supplied in join
  if (message.resumeToken) {
    const existing = roomManager.findSessionByResumeToken(message.resumeToken);
    if (existing && existing.room.roomId === message.roomId) {
      return handleResumeExistingSession(
        socket,
        existing.session,
        roomManager,
        setSession
      );
    }
  }

  // Capacity check (synchronous before insertion)
  if (room.isFull()) {
    socket.send(
      JSON.stringify({
        type: "room_full",
        roomId: room.roomId,
        capacity: room.maxUsers,
      } satisfies ServerMessage)
    );
    socket.close(1008, "Room full");
    return false;
  }

  const color = room.assignColor(message.preferredColor);
  const session = createSession(socket, message.roomId, message.displayName, color);

  // Set room host: if room has no host or message.isCreating is true (and no members yet)
  if (!room.hostId || (message.isCreating && room.members.size === 0)) {
    room.hostId = session.userId;
  }

  room.addMember(session);
  roomManager.registerResumeToken(session.resumeToken, room.roomId, session.userId);
  setSession(session);

  const isHost = session.userId === room.hostId;

  // 1. Send welcome
  socket.send(
    JSON.stringify({
      type: "welcome",
      userId: session.userId,
      resumeToken: session.resumeToken,
      sessionVersion: session.sessionVersion,
      color: session.color,
      displayName: session.displayName,
      roomId: room.roomId,
      isHost,
      hostId: room.hostId || undefined,
    } satisfies ServerMessage)
  );

  // 2. Send room snapshot
  socket.send(
    JSON.stringify({
      type: "room_snapshot",
      roomId: room.roomId,
      capacity: room.maxUsers,
      hostId: room.hostId || undefined,
      users: room.getParticipants(),
      cursors: room.getCursors(),
      objects: room.getObjects(),
    } satisfies ServerMessage)
  );

  // 3. Broadcast presence_join to others
  room.broadcastExcept(session.userId, {
    type: "presence_join",
    user: {
      userId: session.userId,
      displayName: session.displayName,
      color: session.color,
      connected: true,
      isHost,
      joinedAt: session.joinedAt,
    },
  });

  return true;
}

export function handleResume(
  socket: WebSocket,
  message: ClientResumeMessage,
  roomManager: RoomManager,
  setSession: (session: UserSession) => void
): boolean {
  const existing = roomManager.findSessionByResumeToken(message.resumeToken);
  if (!existing || existing.room.roomId !== message.roomId) {
    // Unknown or expired token -> treat as fresh join if capacity permits (PRD Section 21)
    const room = roomManager.getOrCreateRoom(message.roomId);
    if (!room) {
      socket.send(
        JSON.stringify({
          type: "error",
          code: "ROOM_LIMIT_REACHED",
          message: "Server active room limit reached.",
        } satisfies ServerMessage)
      );
      socket.close(1008, "Server room limit reached");
      return false;
    }

    if (room.isFull()) {
      socket.send(
        JSON.stringify({
          type: "room_full",
          roomId: room.roomId,
          capacity: room.maxUsers,
        } satisfies ServerMessage)
      );
      socket.close(1008, "Room full");
      return false;
    }
    // Fallback fresh session
    const color = room.assignColor();
    const session = createSession(
      socket,
      message.roomId,
      `User-${Math.floor(Math.random() * 1000)}`,
      color
    );
    room.addMember(session);
    roomManager.registerResumeToken(session.resumeToken, room.roomId, session.userId);
    setSession(session);

    socket.send(
      JSON.stringify({
        type: "welcome",
        userId: session.userId,
        resumeToken: session.resumeToken,
        sessionVersion: session.sessionVersion,
        color: session.color,
        displayName: session.displayName,
        roomId: room.roomId,
        isHost: session.userId === room.hostId,
        hostId: room.hostId || undefined,
      } satisfies ServerMessage)
    );

    socket.send(
      JSON.stringify({
        type: "room_snapshot",
        roomId: room.roomId,
        capacity: room.maxUsers,
        hostId: room.hostId || undefined,
        users: room.getParticipants(),
        cursors: room.getCursors(),
        objects: room.getObjects(),
      } satisfies ServerMessage)
    );

    room.broadcastExcept(session.userId, {
      type: "presence_join",
      user: {
        userId: session.userId,
        displayName: session.displayName,
        color: session.color,
        connected: true,
        isHost: session.userId === room.hostId,
        joinedAt: session.joinedAt,
      },
    });
    return true;
  }

  return handleResumeExistingSession(socket, existing.session, roomManager, setSession);
}

function handleResumeExistingSession(
  socket: WebSocket,
  session: UserSession,
  roomManager: RoomManager,
  setSession: (session: UserSession) => void
): boolean {
  const room = roomManager.getRoom(session.roomId);
  if (!room) return false;

  // Invalidate old socket if still open
  if (session.socket && session.socket !== socket && session.socket.readyState === WebSocket.OPEN) {
    try {
      session.socket.close(1000, "Superseded by new session connection");
    } catch {
      // ignore
    }
  }

  session.socket = socket;
  session.markActive();
  session.sessionVersion += 1;
  session.lastSeenAt = Date.now();
  session.isAlive = true;
  room.emptySince = null; // Reconnected, cancel empty room cooldown
  setSession(session);

  const isHost = session.userId === room.hostId;

  // 1. Send welcome with updated session version
  socket.send(
    JSON.stringify({
      type: "welcome",
      userId: session.userId,
      resumeToken: session.resumeToken,
      sessionVersion: session.sessionVersion,
      color: session.color,
      displayName: session.displayName,
      roomId: room.roomId,
      isHost,
      hostId: room.hostId || undefined,
    } satisfies ServerMessage)
  );

  // 2. Send fresh room snapshot
  socket.send(
    JSON.stringify({
      type: "room_snapshot",
      roomId: room.roomId,
      capacity: room.maxUsers,
      hostId: room.hostId || undefined,
      users: room.getParticipants(),
      cursors: room.getCursors(),
      objects: room.getObjects(),
    } satisfies ServerMessage)
  );

  // 3. Broadcast presence_join to others so they see the participant re-enter
  room.broadcastExcept(session.userId, {
    type: "presence_join",
    user: {
      userId: session.userId,
      displayName: session.displayName,
      color: session.color,
      connected: true,
      isHost,
      joinedAt: session.joinedAt,
    },
  });

  return true;
}
