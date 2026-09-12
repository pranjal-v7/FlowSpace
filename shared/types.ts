import { z } from "zod";
import {
  MAX_USERS_PER_ROOM,
  MAX_OBJECTS_PER_ROOM,
  MAX_POINTS_PER_STROKE_MSG,
  MAX_TEXT_LENGTH,
  MAX_UNDO_HISTORY,
  COLLABORATOR_COLORS,
  ALLOWED_EMOJIS,
  FONTS,
  ParticipantSchema,
  RemoteCursorSnapshotSchema,
  StrokeObjectSchema,
  ShapeObjectSchema,
  TextObjectSchema,
  CanvasObjectSchema,
  ClientJoinSchema,
  ClientResumeSchema,
  ClientCursorSchema,
  ClientStrokeSchema,
  ClientStrokeEndSchema,
  ClientShapeCreateSchema,
  ClientTextCreateSchema,
  ClientEraseSchema,
  ClientClearCanvasSchema,
  ClientReactionSchema,
  ClientLeaveSchema,
  ClientPingSchema,
  ClientMessageSchema,
  ServerWelcomeSchema,
  ServerRoomSnapshotSchema,
  ServerPresenceJoinSchema,
  ServerPresenceLeaveSchema,
  ServerLeaveAckSchema,
  ServerCursorSchema,
  ServerStrokeSchema,
  ServerStrokeEndSchema,
  ServerShapeCreateSchema,
  ServerTextCreateSchema,
  ServerEraseSchema,
  ServerClearCanvasSchema,
  ServerReactionSchema,
  ServerRoomFullSchema,
  ServerErrorSchema,
  ServerPongSchema,
  ServerMessageSchema,
} from "./schemas.js";

// Explicit value exports
export {
  MAX_USERS_PER_ROOM,
  MAX_OBJECTS_PER_ROOM,
  MAX_POINTS_PER_STROKE_MSG,
  MAX_TEXT_LENGTH,
  MAX_UNDO_HISTORY,
  COLLABORATOR_COLORS,
  ALLOWED_EMOJIS,
  FONTS,
  ParticipantSchema,
  RemoteCursorSnapshotSchema,
  StrokeObjectSchema,
  ShapeObjectSchema,
  TextObjectSchema,
  CanvasObjectSchema,
  ClientJoinSchema,
  ClientResumeSchema,
  ClientCursorSchema,
  ClientStrokeSchema,
  ClientStrokeEndSchema,
  ClientShapeCreateSchema,
  ClientTextCreateSchema,
  ClientEraseSchema,
  ClientClearCanvasSchema,
  ClientReactionSchema,
  ClientLeaveSchema,
  ClientPingSchema,
  ClientMessageSchema,
  ServerWelcomeSchema,
  ServerRoomSnapshotSchema,
  ServerPresenceJoinSchema,
  ServerPresenceLeaveSchema,
  ServerLeaveAckSchema,
  ServerCursorSchema,
  ServerStrokeSchema,
  ServerStrokeEndSchema,
  ServerShapeCreateSchema,
  ServerTextCreateSchema,
  ServerEraseSchema,
  ServerClearCanvasSchema,
  ServerReactionSchema,
  ServerRoomFullSchema,
  ServerErrorSchema,
  ServerPongSchema,
  ServerMessageSchema,
};

// Models
export type Participant = z.infer<typeof ParticipantSchema>;
export type RemoteCursorSnapshot = z.infer<typeof RemoteCursorSnapshotSchema>;

// Canvas Objects
export type CanvasStrokeObject = z.infer<typeof StrokeObjectSchema>;
export type CanvasShapeObject = z.infer<typeof ShapeObjectSchema>;
export type CanvasTextObject = z.infer<typeof TextObjectSchema>;
export type CanvasObject = z.infer<typeof CanvasObjectSchema>;

// Client Messages
export type ClientJoinMessage = z.infer<typeof ClientJoinSchema>;
export type ClientResumeMessage = z.infer<typeof ClientResumeSchema>;
export type ClientCursorMessage = z.infer<typeof ClientCursorSchema>;
export type ClientStrokeMessage = z.infer<typeof ClientStrokeSchema>;
export type ClientStrokeEndMessage = z.infer<typeof ClientStrokeEndSchema>;
export type ClientShapeCreateMessage = z.infer<typeof ClientShapeCreateSchema>;
export type ClientTextCreateMessage = z.infer<typeof ClientTextCreateSchema>;
export type ClientEraseMessage = z.infer<typeof ClientEraseSchema>;
export type ClientClearCanvasMessage = z.infer<typeof ClientClearCanvasSchema>;
export type ClientReactionMessage = z.infer<typeof ClientReactionSchema>;
export type ClientLeaveMessage = z.infer<typeof ClientLeaveSchema>;
export type ClientPingMessage = z.infer<typeof ClientPingSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server Messages
export type ServerWelcomeMessage = z.infer<typeof ServerWelcomeSchema>;
export type ServerRoomSnapshotMessage = z.infer<typeof ServerRoomSnapshotSchema>;
export type ServerPresenceJoinMessage = z.infer<typeof ServerPresenceJoinSchema>;
export type ServerPresenceLeaveMessage = z.infer<typeof ServerPresenceLeaveSchema>;
export type ServerLeaveAckMessage = z.infer<typeof ServerLeaveAckSchema>;
export type ServerCursorMessage = z.infer<typeof ServerCursorSchema>;
export type ServerStrokeMessage = z.infer<typeof ServerStrokeSchema>;
export type ServerStrokeEndMessage = z.infer<typeof ServerStrokeEndSchema>;
export type ServerShapeCreateMessage = z.infer<typeof ServerShapeCreateSchema>;
export type ServerTextCreateMessage = z.infer<typeof ServerTextCreateSchema>;
export type ServerEraseMessage = z.infer<typeof ServerEraseSchema>;
export type ServerClearCanvasMessage = z.infer<typeof ServerClearCanvasSchema>;
export type ServerReactionMessage = z.infer<typeof ServerReactionSchema>;
export type ServerRoomFullMessage = z.infer<typeof ServerRoomFullSchema>;
export type ServerErrorMessage = z.infer<typeof ServerErrorSchema>;
export type ServerPongMessage = z.infer<typeof ServerPongSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// Client Connection State
export type ConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "JOINING"
  | "CONNECTED"
  | "RECONNECTING"
  | "LEAVING"
  | "LEFT"
  | "ROOM_FULL"
  | "ERROR";

// Canvas Active Tool
export type CanvasTool =
  | "select"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "rectangle"
  | "circle"
  | "line"
  | "arrow";

// Telemetry state
export type ClientTelemetry = {
  rtt: number;
  fps: number;
  outgoingRate: number;
  incomingRate: number;
  bufferedBytes: number;
  staleDrops: number;
  reconnectCount: number;
};
