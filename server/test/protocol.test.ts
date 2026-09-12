import { describe, it, expect, beforeEach } from "vitest";
import { RoomManager } from "../src/room.js";
import { MessageDispatcher } from "../src/dispatcher.js";
import { ClientMessageSchema } from "../../shared/schemas.js";

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

  it("should validate cursor coordinates within [0, 1]", () => {
    const validCursor = {
      type: "cursor",
      seq: 1,
      x: 0.5,
      y: 0.25,
      timestamp: Date.now(),
    };
    expect(ClientMessageSchema.safeParse(validCursor).success).toBe(true);

    const outOfBoundsCursor = {
      type: "cursor",
      seq: 1,
      x: 1.5,
      y: -0.1,
      timestamp: Date.now(),
    };
    expect(ClientMessageSchema.safeParse(outOfBoundsCursor).success).toBe(false);
  });

  it("should enforce room capacity of 8 users synchronously", () => {
    const room = roomManager.getOrCreateRoom("test-room");
    expect(room.isFull()).toBe(false);

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
      room.members.set(user.userId, user as any);
    }

    expect(room.activeMemberCount).toBe(8);
    expect(room.isFull()).toBe(true);
  });

  it("should enforce owner-only erase policy for guests, but allow Room Creator to erase all objects", () => {
    const room = roomManager.getOrCreateRoom("test-room-host");
    room.hostId = "user_creator";

    const shapeAlice = {
      objectId: "shape_alice",
      creatorId: "user_alice",
      type: "shape" as const,
      shapeType: "rectangle" as const,
      color: "#6366F1",
      size: 2,
      opacity: 1,
      startX: 0.1,
      startY: 0.1,
      endX: 0.4,
      endY: 0.4,
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
      startX: 0.5,
      startY: 0.5,
      endX: 0.8,
      endY: 0.8,
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

    const room = roomManager.getOrCreateRoom("test-leave");
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

    room.members.set(user.userId, user as any);
    room.addObject({
      objectId: "shape_persisted",
      creatorId: user.userId,
      type: "shape",
      shapeType: "circle",
      color: "#10B981",
      size: 2,
      opacity: 1,
      startX: 0.2,
      startY: 0.2,
      endX: 0.4,
      endY: 0.4,
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
});
