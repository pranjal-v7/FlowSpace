import { describe, it, expect, beforeEach, vi } from "vitest";
import { RoomManager } from "../src/room.js";
import { MessageDispatcher } from "../src/dispatcher.js";
import { ClientMessageSchema } from "../src/shared/schemas.js";

describe("FlowSpace Protocol & Validation Tests", () => {
  let roomManager: RoomManager;
  let dispatcher: MessageDispatcher;

  beforeEach(() => {
    roomManager = new RoomManager();
    dispatcher = new MessageDispatcher(roomManager);
  });

  it("should validate join schema correctly", () => {
    const validJoin = {
      type: "join",
      roomId: "room-123",
      displayName: "Alice",
      preferredColor: "#6366F1",
    };
    const res = ClientMessageSchema.safeParse(validJoin);
    expect(res.success).toBe(true);

    const invalidJoin = {
      type: "join",
      roomId: "invalid room with spaces!@#",
      displayName: "",
    };
    const invalidRes = ClientMessageSchema.safeParse(invalidJoin);
    expect(invalidRes.success).toBe(false);
  });

  it("should validate finite cursor world coordinates", () => {
    const validCursor = {
      type: "cursor",
      seq: 1,
      x: 1250.5,
      y: -420.25,
      timestamp: Date.now(),
    };
    expect(ClientMessageSchema.safeParse(validCursor).success).toBe(true);

    const nonFiniteCursor = {
      type: "cursor",
      seq: 1,
      x: Infinity,
      y: 100,
      timestamp: Date.now(),
    };
    expect(ClientMessageSchema.safeParse(nonFiniteCursor).success).toBe(false);
  });

  it("should validate full-width highlighter stroke up to 128px (including 32px slider * 2.5 = 80px)", () => {
    const highlighterStroke = {
      type: "stroke",
      strokeId: "stroke_highlighter_1",
      color: "#F43F5E",
      size: 80, // 32 * 2.5
      opacity: 0.45,
      isHighlighter: true,
      points: [[100, 150], [105, 155]] as [number, number][],
    };
    const res = ClientMessageSchema.safeParse(highlighterStroke);
    expect(res.success).toBe(true);

    const oversizedStroke = {
      type: "stroke",
      strokeId: "stroke_oversized",
      color: "#F43F5E",
      size: 150, // exceeds 128
      opacity: 0.45,
      isHighlighter: true,
      points: [[100, 150]] as [number, number][],
    };
    expect(ClientMessageSchema.safeParse(oversizedStroke).success).toBe(false);
  });

  it("should handle idempotent erase without throwing UNAUTHORIZED_ERASE for non-existent objects", () => {
    const room = roomManager.getOrCreateRoom("test-erase-room")!;
    const dummySocket = { readyState: 1, send: vi.fn() } as any;
    const user = {
      userId: "u_eraser",
      resumeToken: "tok_eraser",
      sessionVersion: 1,
      displayName: "EraserUser",
      color: "#10B981",
      roomId: "test-erase-room",
      socket: dummySocket,
      connected: true,
      rateLimiters: {
        actionLimiter: { tryConsume: () => true },
      },
    };
    room.addMember(user as any);

    // Erasing an object that does not exist or was already removed
    const eraseMsg = {
      type: "erase" as const,
      objectId: "already_deleted_obj",
    };

    const socketSendSpy = dummySocket.send;
    dispatcher.dispatch(dummySocket, JSON.stringify(eraseMsg), user as any, () => {});
    // Should NOT have sent an error back to the socket
    expect(socketSendSpy).not.toHaveBeenCalled();
  });

  it("should enforce room capacity of 8 users synchronously", () => {
    const room = roomManager.getOrCreateRoom("test-room");
    expect(room).not.toBeNull();
    expect(room!.isFull()).toBe(false);

    // Mock 8 members
    for (let i = 0; i < 8; i++) {
      const dummySocket = { readyState: 1, send: () => {} } as any;
      const user = {
        userId: `u_${i}`,
        resumeToken: `tok_${i}`,
        sessionVersion: 1,
        displayName: `User ${i}`,
        color: "#6366F1",
        roomId: "test-room",
        socket: dummySocket,
        connected: true,
        joinedAt: Date.now(),
        lastSeenAt: Date.now(),
        lastCursor: null,
        rateLimiters: {} as any,
        isAlive: true,
      };
      room!.addMember(user as any);
    }

    expect(room!.activeMemberCount).toBe(8);
    expect(room!.isFull()).toBe(true);
  });

  it("should enforce owner-only erase policy for guests, but allow Room Creator to erase all objects", () => {
    const room = roomManager.getOrCreateRoom("test-room-host")!;
    room.hostId = "user_creator";

    const shapeAlice = {
      objectId: "shape_alice",
      creatorId: "user_alice",
      type: "shape" as const,
      shapeType: "rectangle" as const,
      color: "#6366F1",
      size: 2,
      opacity: 1,
      startX: 100,
      startY: 100,
      endX: 400,
      endY: 400,
      fill: false,
      createdAt: Date.now(),
    };
    const shapeBob = {
      objectId: "shape_bob",
      creatorId: "user_bob",
      type: "shape" as const,
      shapeType: "circle" as const,
      color: "#F43F5E",
      size: 2,
      opacity: 1,
      startX: 500,
      startY: 500,
      endX: 800,
      endY: 800,
      fill: false,
      createdAt: Date.now(),
    };
    room.addObject(shapeAlice);
    room.addObject(shapeBob);

    // Bob (regular participant) tries to erase Alice's shape -> MUST FAIL
    const bobEraseAlice = room.removeObject("shape_alice", "user_bob");
    expect(bobEraseAlice).toBe(false);
    expect(room.objects.has("shape_alice")).toBe(true);

    // Room Creator (Host) erases Bob's shape -> MUST SUCCEED (Master Erase Authority)
    const creatorEraseBob = room.removeObject("shape_bob", "user_creator");
    expect(creatorEraseBob).toBe(true);
    expect(room.objects.has("shape_bob")).toBe(false);

    // Room Creator erases Alice's shape -> MUST SUCCEED
    const creatorEraseAlice = room.removeObject("shape_alice", "user_creator");
    expect(creatorEraseAlice).toBe(true);
    expect(room.objects.has("shape_alice")).toBe(false);

    // Add back an object and test clearAllObjects
    room.addObject(shapeAlice);
    // Non-host cannot clear all
    expect(room.clearAllObjects("user_bob")).toBe(false);
    expect(room.objects.size).toBe(1);
    // Host can clear all
    expect(room.clearAllObjects("user_creator")).toBe(true);
    expect(room.objects.size).toBe(0);
  });

  it("should validate leave schema and retain canvas objects on leave", () => {
    const validLeave = { type: "leave" };
    expect(ClientMessageSchema.safeParse(validLeave).success).toBe(true);

    const room = roomManager.getOrCreateRoom("test-leave")!;
    const dummySocket = { readyState: 1, send: () => {} } as any;
    const user = {
      userId: "u_leaver",
      resumeToken: "tok_leaver",
      sessionVersion: 1,
      displayName: "Leaver",
      color: "#10B981",
      roomId: "test-leave",
      socket: dummySocket,
      connected: true,
      state: "active" as any,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      lastCursor: null,
      rateLimiters: {} as any,
      isAlive: true,
      markActive() { this.state = "active"; this.connected = true; },
      markReconnecting() { this.state = "reconnecting"; this.connected = false; },
      markLeft() { this.state = "left"; this.connected = false; },
      canResume() { return this.state === "reconnecting"; },
    };

    room.addMember(user as any);
    room.addObject({
      objectId: "shape_persisted",
      creatorId: user.userId,
      type: "shape",
      shapeType: "circle",
      color: "#10B981",
      size: 2,
      opacity: 1,
      startX: 200,
      startY: 200,
      endX: 400,
      endY: 400,
      fill: true,
      createdAt: Date.now(),
    });

    expect(room.members.has(user.userId)).toBe(true);
    expect(room.objects.has("shape_persisted")).toBe(true);

    // Remove member (Leave)
    const removed = room.removeMember(user.userId);
    expect(removed).toBe(true);
    expect(room.members.has(user.userId)).toBe(false);

    // Canvas object created by leaver MUST remain!
    expect(room.objects.has("shape_persisted")).toBe(true);
  });

  it("should enforce 60-second empty room cooldown before deletion", () => {
    const room = roomManager.getOrCreateRoom("cooldown-room")!;
    const dummySocket = { readyState: 1, send: () => {} } as any;
    const user = {
      userId: "u_solo",
      resumeToken: "tok_solo",
      sessionVersion: 1,
      displayName: "Solo",
      color: "#6366F1",
      roomId: "cooldown-room",
      socket: dummySocket,
      connected: true,
    };
    room.addMember(user as any);
    expect(room.emptySince).toBeNull();

    // Member leaves -> empty cooldown starts
    room.removeMember(user.userId);
    expect(room.emptySince).not.toBeNull();
    const emptyTime = room.emptySince!;

    // Clean at 30 seconds -> Room MUST NOT be deleted
    roomManager.cleanDeadRooms(60000);
    expect(roomManager.getRoom("cooldown-room")).toBeDefined();

    // If a member rejoins within cooldown -> emptySince is reset
    room.addMember(user as any);
    expect(room.emptySince).toBeNull();

    // Member leaves again and 60 seconds expire -> Room deleted
    room.removeMember(user.userId);
    room.emptySince = Date.now() - 61000;
    roomManager.cleanDeadRooms(60000);
    expect(roomManager.getRoom("cooldown-room")).toBeUndefined();
  });
});
