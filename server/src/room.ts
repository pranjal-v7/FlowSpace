import { WebSocket } from "ws";
import {
  CanvasObject,
  COLLABORATOR_COLORS,
  MAX_OBJECTS_PER_ROOM,
  MAX_USERS_PER_ROOM,
  Participant,
  RemoteCursorSnapshot,
  ServerMessage,
} from "../../shared/types.js";
import { MAX_BACKPRESSURE_BYTES } from "./config.js";
import { UserSession } from "./session.js";

export class Room {
  public roomId: string;
  public hostId: string | null = null;
  public maxUsers: number = MAX_USERS_PER_ROOM;
  public members: Map<string, UserSession> = new Map();
  public objects: Map<string, CanvasObject> = new Map();
  public lastActiveAt: number = Date.now();

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  get activeMemberCount(): number {
    return this.members.size;
  }

  isFull(): boolean {
    return this.members.size >= this.maxUsers;
  }

  assignColor(preferredColor?: string): string {
    const usedColors = new Set(Array.from(this.members.values()).map((m) => m.color));
    if (preferredColor && !usedColors.has(preferredColor)) {
      return preferredColor;
    }
    const availableColor = COLLABORATOR_COLORS.find((c) => !usedColors.has(c));
    if (availableColor) {
      return availableColor;
    }
    // Fallback: pick modulo
    return COLLABORATOR_COLORS[this.members.size % COLLABORATOR_COLORS.length];
  }

  removeMember(userId: string): boolean {
    const deleted = this.members.delete(userId);
    if (deleted) {
      this.lastActiveAt = Date.now();
    }
    return deleted;
  }

  getParticipants(): Participant[] {
    return Array.from(this.members.values()).map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      color: m.color,
      connected: m.connected,
      isHost: m.userId === this.hostId,
      joinedAt: m.joinedAt,
    }));
  }

  getCursors(): RemoteCursorSnapshot[] {
    const snapshots: RemoteCursorSnapshot[] = [];
    for (const session of this.members.values()) {
      if (session.lastCursor) {
        snapshots.push(session.lastCursor);
      }
    }
    return snapshots;
  }

  getObjects(): CanvasObject[] {
    return Array.from(this.objects.values());
  }

  addObject(obj: CanvasObject): boolean {
    if (this.objects.size >= MAX_OBJECTS_PER_ROOM) {
      return false;
    }
    this.objects.set(obj.objectId, obj);
    this.lastActiveAt = Date.now();
    return true;
  }

  removeObject(objectId: string, requestingUserId: string): boolean {
    const obj = this.objects.get(objectId);
    if (!obj) {
      return false;
    }
    // Room creator / host can erase ANY object on the whiteboard!
    // Regular participants can only erase objects they personally created.
    if (this.hostId !== requestingUserId && obj.creatorId !== requestingUserId) {
      return false;
    }
    this.objects.delete(objectId);
    this.lastActiveAt = Date.now();
    return true;
  }

  clearAllObjects(requestingUserId: string): boolean {
    // Only the room creator / host can clear the entire canvas
    if (this.hostId !== requestingUserId) {
      return false;
    }
    this.objects.clear();
    this.lastActiveAt = Date.now();
    return true;
  }

  broadcastAll(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const session of this.members.values()) {
      if (session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(payload);
      }
    }
  }

  broadcastExcept(
    excludeUserId: string,
    message: ServerMessage,
    isDroppableCursor = false
  ): void {
    const payload = JSON.stringify(message);
    for (const [userId, session] of this.members.entries()) {
      if (userId === excludeUserId) continue;
      if (session.socket.readyState !== WebSocket.OPEN) continue;

      if (isDroppableCursor && session.socket.bufferedAmount > MAX_BACKPRESSURE_BYTES) {
        // Slow client isolation: drop cursor frame for congested client
        continue;
      }

      session.socket.send(payload);
    }
  }
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  // Map of resumeToken -> { roomId, userId }
  private resumeTokens: Map<string, { roomId: string; userId: string }> = new Map();

  getOrCreateRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(roomId);
      this.rooms.set(roomId, room);
    }
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  findSessionByResumeToken(token: string): { room: Room; session: UserSession } | null {
    const meta = this.resumeTokens.get(token);
    if (!meta) return null;
    const room = this.rooms.get(meta.roomId);
    if (!room) return null;
    const session = room.members.get(meta.userId);
    if (!session || session.resumeToken !== token) return null;
    return { room, session };
  }

  registerResumeToken(token: string, roomId: string, userId: string): void {
    this.resumeTokens.set(token, { roomId, userId });
  }

  unregisterResumeToken(token: string): void {
    this.resumeTokens.delete(token);
  }

  removeMember(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const session = room.members.get(userId);
    if (session) {
      this.resumeTokens.delete(session.resumeToken);
      room.members.delete(userId);
    }

    if (room.members.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  getAllRooms(): Map<string, Room> {
    return this.rooms;
  }

  cleanDeadRooms(): void {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.members.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }
}
