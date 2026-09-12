import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { MessageDispatcher } from "../src/dispatcher.js";
import { RoomManager } from "../src/room.js";
import { UserSession } from "../src/session.js";

describe("FlowSpace E2E Realtime Synchronization & Capacity Tests", () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let roomManager: RoomManager;
  let dispatcher: MessageDispatcher;
  const TEST_PORT = 4099;
  const WS_URL = `ws://127.0.0.1:${TEST_PORT}`;

  beforeAll(async () => {
    roomManager = new RoomManager();
    dispatcher = new MessageDispatcher(roomManager);

    server = http.createServer();
    wss = new WebSocketServer({ server });

    wss.on("connection", (ws: WebSocket) => {
      let session: UserSession | null = null;
      ws.on("message", (data) => {
        dispatcher.dispatch(ws, data as string | Buffer, session, (newSession) => {
          session = newSession;
        });
      });
      ws.on("close", () => {
        if (session) {
          if (session.state === "left") return;
          session.markReconnecting();
          session.lastSeenAt = Date.now();
          session.lastCursor = null;
          const room = roomManager.getRoom(session.roomId);
          if (room) {
            room.broadcastExcept(session.userId, {
              type: "presence_leave",
              userId: session.userId,
            });
          }
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(TEST_PORT, "127.0.0.1", resolve));
  });

  afterAll(async () => {
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  class TestClient {
    public ws: WebSocket;
    public messages: any[] = [];
    private listeners: ((msg: any) => void)[] = [];

    constructor(ws: WebSocket) {
      this.ws = ws;
      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        this.messages.push(msg);
        for (const listener of this.listeners) {
          listener(msg);
        }
      });
    }

    send(data: any): void {
      this.ws.send(JSON.stringify(data));
    }

    async waitForMessage(type: string, timeoutMs = 3000): Promise<any> {
      // Check if already in queue
      const existing = this.messages.find((m) => m.type === type);
      if (existing) {
        return existing;
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.listeners = this.listeners.filter((l) => l !== handler);
          reject(new Error(`Timeout waiting for message: ${type}`));
        }, timeoutMs);

        const handler = (msg: any) => {
          if (msg.type === type) {
            clearTimeout(timer);
            this.listeners = this.listeners.filter((l) => l !== handler);
            resolve(msg);
          }
        };

        this.listeners.push(handler);
      });
    }

    close(): void {
      this.ws.close();
    }
  }

  const createClient = (): Promise<TestClient> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      ws.on("open", () => resolve(new TestClient(ws)));
      ws.on("error", reject);
    });
  };

  it("should allow a client to join and receive welcome and room_snapshot", async () => {
    const client = await createClient();

    client.send({
      type: "join",
      roomId: "test-room-1",
      displayName: "Alice",
    });

    const welcomeMsg = await client.waitForMessage("welcome");
    expect(welcomeMsg.displayName).toBe("Alice");
    expect(welcomeMsg.userId).toBeDefined();
    expect(welcomeMsg.resumeToken).toBeDefined();

    const snapshotMsg = await client.waitForMessage("room_snapshot");
    expect(snapshotMsg.roomId).toBe("test-room-1");
    expect(snapshotMsg.users.length).toBe(1);

    client.close();
  });

  it("should enforce the hard limit of 8 users and reject the 9th user with room_full", async () => {
    const clients: TestClient[] = [];
    const testRoom = "capacity-room";

    // 1. Join 8 clients
    for (let i = 1; i <= 8; i++) {
      const client = await createClient();
      clients.push(client);
      client.send({
        type: "join",
        roomId: testRoom,
        displayName: `User_${i}`,
      });
      await client.waitForMessage("welcome");
    }

    const room = roomManager.getRoom(testRoom);
    expect(room?.activeMemberCount).toBe(8);
    expect(room?.isFull()).toBe(true);

    // 2. Try to join 9th client
    const ninthClient = await createClient();
    ninthClient.send({
      type: "join",
      roomId: testRoom,
      displayName: "User_9",
    });

    const roomFullMsg = await ninthClient.waitForMessage("room_full");
    expect(roomFullMsg.type).toBe("room_full");
    expect(roomFullMsg.capacity).toBe(8);

    // Clean up
    for (const c of clients) c.close();
    ninthClient.close();
  });

  it("should resume session with resumeToken without creating duplicate participant and notify other participants", async () => {
    const resumeRoom = "resume-room";
    const client1 = await createClient();
    const clientWatcher = await createClient();

    // 1. Client 1 (Bob) joins
    client1.send({
      type: "join",
      roomId: resumeRoom,
      displayName: "Bob",
    });

    const welcome1 = await client1.waitForMessage("welcome");
    const resumeToken = welcome1.resumeToken;
    const originalUserId = welcome1.userId;

    // 2. Client Watcher (Alice) joins
    clientWatcher.send({
      type: "join",
      roomId: resumeRoom,
      displayName: "Alice",
    });
    await clientWatcher.waitForMessage("welcome");

    // 3. Simulate Client 1 unexpected disconnect
    client1.close();

    // Watcher receives presence_leave
    const presenceLeave = await clientWatcher.waitForMessage("presence_leave");
    expect(presenceLeave.userId).toBe(originalUserId);

    // 4. Client 1 reconnects with resumeToken
    const client2 = await createClient();
    client2.send({
      type: "resume",
      roomId: resumeRoom,
      resumeToken,
      sessionVersion: 1,
    });

    // Reconnecting client receives welcome & snapshot with identical userId
    const welcome2 = await client2.waitForMessage("welcome");
    expect(welcome2.userId).toBe(originalUserId);
    expect(welcome2.sessionVersion).toBe(2);

    // Watcher receives presence_join
    const presenceJoin = await clientWatcher.waitForMessage("presence_join");
    expect(presenceJoin.user.userId).toBe(originalUserId);
    expect(presenceJoin.user.displayName).toBe("Bob");

    const room = roomManager.getRoom(resumeRoom);
    expect(room?.activeMemberCount).toBe(2);

    client2.close();
    clientWatcher.close();
  });

  it("should handle explicit leave, send leave_ack, broadcast presence_leave, and retain canvas objects on rejoin with fresh identity", async () => {
    const testRoom = "leave-lifecycle-room";
    const clientA = await createClient();

    // 1. Client A joins and creates a shape
    clientA.send({
      type: "join",
      roomId: testRoom,
      displayName: "Alice",
    });
    const welcomeA = await clientA.waitForMessage("welcome");
    const userAId = welcomeA.userId;

    clientA.send({
      type: "shape_create",
      shapeId: "shape_alice_1",
      shapeType: "rectangle",
      color: "#6366F1",
      size: 4,
      opacity: 1,
      startX: 0.1,
      startY: 0.1,
      endX: 0.5,
      endY: 0.5,
      fill: false,
    });

    // 2. Client B joins
    const clientB = await createClient();
    clientB.send({
      type: "join",
      roomId: testRoom,
      displayName: "Bob",
    });
    await clientB.waitForMessage("welcome");
    const snapshotB = await clientB.waitForMessage("room_snapshot");
    expect(snapshotB.objects.some((o: any) => o.objectId === "shape_alice_1")).toBe(true);

    // 3. Client A explicitly leaves
    clientA.send({
      type: "leave",
    });

    const leaveAck = await clientA.waitForMessage("leave_ack");
    expect(leaveAck.type).toBe("leave_ack");
    expect(leaveAck.reason).toBe("user_requested");

    // Client B receives presence_leave
    const presenceLeave = await clientB.waitForMessage("presence_leave");
    expect(presenceLeave.userId).toBe(userAId);

    // Verify room objects still contain Alice's shape
    const room = roomManager.getRoom(testRoom);
    expect(room?.objects.has("shape_alice_1")).toBe(true);
    expect(room?.activeMemberCount).toBe(1); // Only Bob

    // 4. Bob tries to erase Alice's shape -> must be rejected
    clientB.send({
      type: "erase",
      objectId: "shape_alice_1",
    });
    const eraseError = await clientB.waitForMessage("error");
    expect(eraseError.code).toBe("UNAUTHORIZED_ERASE");
    expect(room?.objects.has("shape_alice_1")).toBe(true);

    // 5. Alice rejoins room -> must receive a NEW participant identity
    const clientA2 = await createClient();
    clientA2.send({
      type: "join",
      roomId: testRoom,
      displayName: "Alice",
    });
    const welcomeA2 = await clientA2.waitForMessage("welcome");
    expect(welcomeA2.userId).not.toBe(userAId); // Fresh userId

    const snapshotA2 = await clientA2.waitForMessage("room_snapshot");
    expect(snapshotA2.objects.some((o: any) => o.objectId === "shape_alice_1")).toBe(true);

    // Clean up
    clientB.close();
    clientA2.close();
  });
});

