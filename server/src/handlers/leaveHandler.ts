import { WebSocket } from "ws";
import { ServerLeaveAckMessage, ServerPresenceLeaveMessage } from "../shared/types.js";
import { Room, RoomManager } from "../room.js";
import { UserSession } from "../session.js";

export function handleLeave(
  room: Room,
  session: UserSession,
  roomManager: RoomManager,
  setSession: (session: UserSession | null) => void
): void {
  // Edge Case: User sends Leave multiple times -> ignore gracefully
  if (session.state === "left") {
    return;
  }

  const userId = session.userId;

  // 1. Remove member from room presence immediately (canvas objects remain untouched!)
  // If last member, room.removeMember() automatically initiates the 60-second empty cooldown
  room.removeMember(userId);
  roomManager.unregisterResumeToken(session.resumeToken);

  // 2. Broadcast presence_leave to other participants
  room.broadcastExcept(userId, {
    type: "presence_leave",
    userId,
  } satisfies ServerPresenceLeaveMessage);

  // 3. Send leave_ack to the departing client
  if (session.socket.readyState === WebSocket.OPEN) {
    try {
      session.socket.send(
        JSON.stringify({
          type: "leave_ack",
          reason: "user_requested",
        } satisfies ServerLeaveAckMessage)
      );
    } catch {
      // ignore
    }
  }

  // 4. Mark session state as left
  session.markLeft();
  setSession(null);

  // 5. Close socket intentionally
  try {
    if (session.socket.readyState === WebSocket.OPEN || session.socket.readyState === WebSocket.CONNECTING) {
      session.socket.close(1000, "User left room");
    }
  } catch {
    // ignore
  }
}
