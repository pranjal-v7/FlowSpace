import { ClientReactionMessage, ServerMessage } from "../../../shared/types.js";
import { Room } from "../room.js";
import { UserSession } from "../session.js";

export function handleReaction(
  message: ClientReactionMessage,
  session: UserSession,
  room: Room
): void {
  // Rate limit: max 5 reactions/sec per client
  if (!session.rateLimiters.reactionLimiter.tryConsume()) {
    return;
  }

  // Broadcast to all participants in the room (including sender if desired)
  room.broadcastAll({
    type: "reaction",
    userId: session.userId,
    id: message.id,
    emoji: message.emoji,
    x: message.x,
    y: message.y,
  } satisfies ServerMessage);
}
