import { z } from "zod";

// ==========================================
// Constants & Limits
// ==========================================
export const MAX_USERS_PER_ROOM = 8;
export const MAX_OBJECTS_PER_ROOM = 750;
export const MAX_POINTS_PER_STROKE_MSG = 50;
export const MAX_TEXT_LENGTH = 500;
export const MAX_UNDO_HISTORY = 20;

export const COLLABORATOR_COLORS = [
  "#6366F1", // Indigo
  "#F43F5E", // Coral / Rose
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#06B6D4", // Cyan / Blue
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#3B82F6", // Blue
] as const;

export const ALLOWED_EMOJIS = [
  "❤️", "👍", "😂", "🎉", "🔥", "👀",
  "✨", "💡", "🚀", "👏", "😍", "🤔",
  "⭐", "💯", "🎈", "⚡"
] as const;

export const FONTS = [
  "Inter, sans-serif",
  "Outfit, sans-serif",
  "Space Grotesk, sans-serif",
  "JetBrains Mono, monospace",
  "Caveat, cursive",
] as const;

// ==========================================
// Participant & Common Models
// ==========================================
export const ParticipantSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(30),
  color: z.string().regex(/^#([0-9a-fA-F]{3}){1,2}$/),
  connected: z.boolean(),
  isHost: z.boolean().default(false),
  joinedAt: z.number().int().positive(),
});

export const RemoteCursorSnapshotSchema = z.object({
  userId: z.string(),
  seq: z.number().int().nonnegative(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  timestamp: z.number().int().positive(),
});

// ==========================================
// Canvas Object Schemas
// ==========================================
export const StrokeObjectSchema = z.object({
  objectId: z.string().min(1),
  creatorId: z.string().min(1),
  type: z.literal("stroke"),
  color: z.string(),
  size: z.number().min(1).max(64),
  opacity: z.number().min(0.01).max(1),
  isHighlighter: z.boolean().default(false),
  points: z.array(z.tuple([z.number(), z.number()])).max(1000),
  createdAt: z.number().int().positive(),
});

export const ShapeObjectSchema = z.object({
  objectId: z.string().min(1),
  creatorId: z.string().min(1),
  type: z.literal("shape"),
  shapeType: z.enum(["rectangle", "circle", "line", "arrow"]),
  color: z.string(),
  size: z.number().min(1).max(32),
  opacity: z.number().min(0.01).max(1).default(1),
  startX: z.number().finite().min(0).max(1),
  startY: z.number().finite().min(0).max(1),
  endX: z.number().finite().min(0).max(1),
  endY: z.number().finite().min(0).max(1),
  fill: z.boolean().default(false),
  createdAt: z.number().int().positive(),
});

export const TextObjectSchema = z.object({
  objectId: z.string().min(1),
  creatorId: z.string().min(1),
  type: z.literal("text"),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  content: z.string().min(1).max(MAX_TEXT_LENGTH),
  color: z.string(),
  font: z.string(),
  fontSize: z.number().min(8).max(96),
  createdAt: z.number().int().positive(),
});

export const CanvasObjectSchema = z.discriminatedUnion("type", [
  StrokeObjectSchema,
  ShapeObjectSchema,
  TextObjectSchema,
]);

// ==========================================
// Client -> Server Message Schemas
// ==========================================
export const ClientJoinSchema = z.object({
  type: z.literal("join"),
  roomId: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().trim().min(1).max(30),
  preferredColor: z.string().regex(/^#([0-9a-fA-F]{3}){1,2}$/).optional(),
  resumeToken: z.string().optional(),
  isCreating: z.boolean().optional(),
});

export const ClientResumeSchema = z.object({
  type: z.literal("resume"),
  roomId: z.string().min(1).max(50),
  resumeToken: z.string().min(1),
  sessionVersion: z.number().int().positive(),
});

export const ClientCursorSchema = z.object({
  type: z.literal("cursor"),
  seq: z.number().int().nonnegative(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  timestamp: z.number().int().positive(),
});

export const ClientStrokeSchema = z.object({
  type: z.literal("stroke"),
  strokeId: z.string().min(1).max(64),
  color: z.string(),
  size: z.number().min(1).max(64),
  opacity: z.number().min(0.01).max(1).default(1),
  isHighlighter: z.boolean().default(false),
  points: z.array(z.tuple([
    z.number().finite().min(0).max(1),
    z.number().finite().min(0).max(1)
  ])).min(1).max(MAX_POINTS_PER_STROKE_MSG),
});

export const ClientStrokeEndSchema = z.object({
  type: z.literal("stroke_end"),
  strokeId: z.string().min(1).max(64),
});

export const ClientShapeCreateSchema = z.object({
  type: z.literal("shape_create"),
  shapeId: z.string().min(1).max(64),
  shapeType: z.enum(["rectangle", "circle", "line", "arrow"]),
  color: z.string(),
  size: z.number().min(1).max(32),
  opacity: z.number().min(0.01).max(1).default(1),
  startX: z.number().finite().min(0).max(1),
  startY: z.number().finite().min(0).max(1),
  endX: z.number().finite().min(0).max(1),
  endY: z.number().finite().min(0).max(1),
  fill: z.boolean().default(false),
});

export const ClientTextCreateSchema = z.object({
  type: z.literal("text_create"),
  textId: z.string().min(1).max(64),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  content: z.string().min(1).max(MAX_TEXT_LENGTH),
  color: z.string(),
  font: z.string(),
  fontSize: z.number().min(8).max(96),
});

export const ClientEraseSchema = z.object({
  type: z.literal("erase"),
  objectId: z.string().min(1).max(64),
});

export const ClientReactionSchema = z.object({
  type: z.literal("reaction"),
  id: z.string().min(1).max(64),
  emoji: z.string().min(1).max(8),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

export const ClientLeaveSchema = z.object({
  type: z.literal("leave"),
});

export const ClientClearCanvasSchema = z.object({
  type: z.literal("clear_canvas"),
});

export const ClientPingSchema = z.object({
  type: z.literal("app_ping"),
  timestamp: z.number().int().positive(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
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
]);

// ==========================================
// Server -> Client Message Schemas
// ==========================================
export const ServerWelcomeSchema = z.object({
  type: z.literal("welcome"),
  userId: z.string(),
  resumeToken: z.string(),
  sessionVersion: z.number().int().positive(),
  color: z.string(),
  displayName: z.string(),
  roomId: z.string(),
  isHost: z.boolean().default(false),
  hostId: z.string().optional(),
});

export const ServerRoomSnapshotSchema = z.object({
  type: z.literal("room_snapshot"),
  roomId: z.string(),
  capacity: z.number().int(),
  hostId: z.string().optional(),
  users: z.array(ParticipantSchema),
  cursors: z.array(RemoteCursorSnapshotSchema),
  objects: z.array(CanvasObjectSchema),
});

export const ServerPresenceJoinSchema = z.object({
  type: z.literal("presence_join"),
  user: ParticipantSchema,
});

export const ServerPresenceLeaveSchema = z.object({
  type: z.literal("presence_leave"),
  userId: z.string(),
});

export const ServerLeaveAckSchema = z.object({
  type: z.literal("leave_ack"),
  reason: z.string().default("user_requested"),
});

export const ServerCursorSchema = z.object({
  type: z.literal("cursor"),
  userId: z.string(),
  seq: z.number().int().nonnegative(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  timestamp: z.number().int().positive(),
});

export const ServerStrokeSchema = z.object({
  type: z.literal("stroke"),
  creatorId: z.string(),
  strokeId: z.string(),
  color: z.string(),
  size: z.number(),
  opacity: z.number(),
  isHighlighter: z.boolean().default(false),
  points: z.array(z.tuple([z.number(), z.number()])),
});

export const ServerStrokeEndSchema = z.object({
  type: z.literal("stroke_end"),
  creatorId: z.string(),
  strokeId: z.string(),
});

export const ServerShapeCreateSchema = z.object({
  type: z.literal("shape_create"),
  object: ShapeObjectSchema,
});

export const ServerTextCreateSchema = z.object({
  type: z.literal("text_create"),
  object: TextObjectSchema,
});

export const ServerEraseSchema = z.object({
  type: z.literal("erase"),
  objectId: z.string(),
  eraserId: z.string(),
});

export const ServerReactionSchema = z.object({
  type: z.literal("reaction"),
  userId: z.string(),
  id: z.string(),
  emoji: z.string(),
  x: z.number(),
  y: z.number(),
  timestamp: z.number().optional(),
});

export const ServerRoomFullSchema = z.object({
  type: z.literal("room_full"),
  roomId: z.string(),
  capacity: z.number().int(),
});

export const ServerErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

export const ServerPongSchema = z.object({
  type: z.literal("app_pong"),
  clientTimestamp: z.number(),
  serverTimestamp: z.number(),
});

export const ServerClearCanvasSchema = z.object({
  type: z.literal("clear_canvas"),
  clearedBy: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
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
]);
