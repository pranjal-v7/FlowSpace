import { ClientCursorSchema } from "../../../shared/schemas.js";
import { ClientCursorMessage, ServerMessage } from "../../../shared/types.js";
import { Room } from "../room.js";
import { UserSession } from "../session.js";

export function handleCursor(
  message: ClientCursorMessage,
  session: UserSession,
  room: Room
): void {
  // 1. Rate limit check (25-35 cursor packets/sec)
  if (!session.rateLimiters.cursorLimiter.tryConsume()) {
    return;
  }

  // 2. Monotonic sequence check (INV-04 / PRD Section 28)
  if (session.lastCursor && message.seq <= session.lastCursor.seq) {
    // Drop out-of-order or duplicate sequence
    return;
  }

  const cursorSnapshot = {
    userId: session.userId,
    seq: message.seq,
    x: message.x,
    y: message.y,
    timestamp: message.timestamp,
  };

  session.lastCursor = cursorSnapshot;
  session.lastSeenAt = Date.now();

  // 3. Broadcast to all other room members using droppable backpressure isolation
  room.broadcastExcept(
    session.userId,
    {
      type: "cursor",
      userId: session.userId,
      seq: message.seq,
      x: message.x,
      y: message.y,
      timestamp: message.timestamp,
    } satisfies ServerMessage,
    true
  );
}
