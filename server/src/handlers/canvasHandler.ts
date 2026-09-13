import {
  CanvasShapeObject,
  CanvasStrokeObject,
  CanvasTextObject,
  ClientEraseMessage,
  ClientShapeCreateMessage,
  ClientStrokeEndMessage,
  ClientStrokeMessage,
  ClientTextCreateMessage,
  ServerMessage,
} from "../shared/types.js";
import { Room } from "../room.js";
import { UserSession } from "../session.js";

export function handleStroke(
  message: ClientStrokeMessage,
  session: UserSession,
  room: Room
): void {
  if (!session.rateLimiters.actionLimiter.tryConsume()) {
    return;
  }

  let strokeObj = room.objects.get(message.strokeId) as CanvasStrokeObject | undefined;
  if (!strokeObj) {
    // New stroke creation
    strokeObj = {
      objectId: message.strokeId,
      creatorId: session.userId,
      type: "stroke",
      color: message.color,
      size: message.size,
      opacity: message.opacity,
      isHighlighter: !!message.isHighlighter,
      points: message.points,
      createdAt: Date.now(),
    };
    if (!room.addObject(strokeObj)) {
      session.socket.send(
        JSON.stringify({
          type: "error",
          code: "OBJECT_LIMIT_REACHED",
          message: "Room has reached the maximum persistent object limit (750)",
        } satisfies ServerMessage)
      );
      return;
    }
  } else {
    // Append points if owned by sender
    if (strokeObj.creatorId === session.userId) {
      strokeObj.points.push(...message.points);
      // Bound total points in stroke
      if (strokeObj.points.length > 1000) {
        strokeObj.points = strokeObj.points.slice(0, 1000);
      }
    }
  }

  // Broadcast to other clients (server-authoritative creatorId)
  room.broadcastExcept(session.userId, {
    type: "stroke",
    creatorId: session.userId,
    strokeId: message.strokeId,
    color: message.color,
    size: message.size,
    opacity: message.opacity,
    isHighlighter: !!message.isHighlighter,
    points: message.points,
  } satisfies ServerMessage);
}

export function handleStrokeEnd(
  message: ClientStrokeEndMessage,
  session: UserSession,
  room: Room
): void {
  room.broadcastExcept(session.userId, {
    type: "stroke_end",
    creatorId: session.userId,
    strokeId: message.strokeId,
  } satisfies ServerMessage);
}

export function handleShapeCreate(
  message: ClientShapeCreateMessage,
  session: UserSession,
  room: Room
): void {
  if (!session.rateLimiters.actionLimiter.tryConsume()) {
    return;
  }

  const shapeObj: CanvasShapeObject = {
    objectId: message.shapeId,
    creatorId: session.userId,
    type: "shape",
    shapeType: message.shapeType,
    color: message.color,
    size: message.size,
    opacity: message.opacity,
    startX: message.startX,
    startY: message.startY,
    endX: message.endX,
    endY: message.endY,
    fill: message.fill ?? false,
    createdAt: Date.now(),
  };

  if (!room.addObject(shapeObj)) {
    session.socket.send(
      JSON.stringify({
        type: "error",
        code: "OBJECT_LIMIT_REACHED",
        message: "Room has reached the maximum persistent object limit (750)",
      } satisfies ServerMessage)
    );
    return;
  }

  room.broadcastExcept(session.userId, {
    type: "shape_create",
    object: shapeObj,
  } satisfies ServerMessage);
}

export function handleTextCreate(
  message: ClientTextCreateMessage,
  session: UserSession,
  room: Room
): void {
  if (!session.rateLimiters.actionLimiter.tryConsume()) {
    return;
  }

  const textObj: CanvasTextObject = {
    objectId: message.textId,
    creatorId: session.userId,
    type: "text",
    x: message.x,
    y: message.y,
    content: message.content,
    color: message.color,
    font: message.font,
    fontSize: message.fontSize,
    createdAt: Date.now(),
  };

  if (!room.addObject(textObj)) {
    session.socket.send(
      JSON.stringify({
        type: "error",
        code: "OBJECT_LIMIT_REACHED",
        message: "Room has reached the maximum persistent object limit (750)",
      } satisfies ServerMessage)
    );
    return;
  }

  room.broadcastExcept(session.userId, {
    type: "text_create",
    object: textObj,
  } satisfies ServerMessage);
}

export function handleErase(
  message: ClientEraseMessage,
  session: UserSession,
  room: Room
): void {
  if (!session.rateLimiters.actionLimiter.tryConsume()) {
    return;
  }

  const success = room.removeObject(message.objectId, session.userId);
  if (!success) {
    session.socket.send(
      JSON.stringify({
        type: "error",
        code: "UNAUTHORIZED_ERASE",
        message: "Cannot erase: object does not exist or was created by another user",
      } satisfies ServerMessage)
    );
    return;
  }

  // Broadcast erase to all other members (or all members)
  room.broadcastExcept(session.userId, {
    type: "erase",
    objectId: message.objectId,
    eraserId: session.userId,
  } satisfies ServerMessage);
}

export function handleClearCanvas(
  session: UserSession,
  room: Room
): void {
  // Only the room creator / host can clear the canvas
  if (session.userId !== room.hostId) {
    session.socket.send(
      JSON.stringify({
        type: "error",
        code: "UNAUTHORIZED_CLEAR",
        message: "Only the room creator can clear the canvas",
      } satisfies ServerMessage)
    );
    return;
  }

  const success = room.clearAllObjects(session.userId);
  if (!success) return;

  // Broadcast clear_canvas to all members in the room
  room.broadcastAll({
    type: "clear_canvas",
    clearedBy: session.userId,
  } satisfies ServerMessage);
}

