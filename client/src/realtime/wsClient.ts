import { ServerMessageSchema } from "../shared/schemas.js";
import {
  ClientMessage,
  ConnectionState,
  ServerMessage,
} from "../shared/types.js";

export type MessageHandler = (message: ServerMessage) => void;
export type StateChangeHandler = (state: ConnectionState) => void;

export class RealtimeWebSocketClient {
  private url: string;
  private socket: WebSocket | null = null;
  private state: ConnectionState = "DISCONNECTED";
  private messageHandlers: Set<MessageHandler> = new Set();
  private stateHandlers: Set<StateChangeHandler> = new Set();

  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private isIntentionalClose = false;

  private resumeToken: string | null = null;
  private sessionVersion = 1;
  private activeRoomId: string | null = null;
  private activeDisplayName: string | null = null;

  // Telemetry & metrics
  public outgoingCount = 0;
  public incomingCount = 0;
  public staleDrops = 0;
  public reconnectCount = 0;
  constructor(url: string) {
    this.url = url;
  }

  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getResumeToken(): string | null {
    return this.resumeToken;
  }

  public setResumeToken(token: string, sessionVersion = 1): void {
    this.resumeToken = token;
    this.sessionVersion = sessionVersion;
  }

  public connect(roomId: string, displayName: string, preferredColor?: string, isCreating?: boolean): void {
    this.activeRoomId = roomId;
    this.activeDisplayName = displayName;
    this.isIntentionalClose = false;
    this.setState("CONNECTING");

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
    }

    try {
      this.socket = new WebSocket(this.url);
    } catch (err) {
      console.error("[WS] Connection failed:", err);
      this.handleConnectionFailure();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.resumeToken) {
        // Attempt resume
        this.setState("JOINING");
        this.send({
          type: "resume",
          roomId,
          resumeToken: this.resumeToken,
          sessionVersion: this.sessionVersion,
        });
      } else {
        // Fresh join
        this.setState("JOINING");
        this.send({
          type: "join",
          roomId,
          displayName,
          preferredColor,
          isCreating,
        });
      }
    };

    this.socket.onmessage = (event) => {
      this.incomingCount++;
      this.processIncomingMessage(event.data);
    };

    this.socket.onclose = (event) => {
      if (this.isIntentionalClose || this.state === "LEAVING" || this.state === "LEFT") {
        this.setState("LEFT");
        return;
      }
      if (event.code === 1008 || event.reason === "Room full") {
        this.setState("ROOM_FULL");
        return;
      }
      this.handleConnectionFailure();
    };

    this.socket.onerror = () => {
      // onerror is followed by onclose
    };
  }

  public leaveRoom(): void {
    this.isIntentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.resumeToken = null;
    this.setState("LEAVING");

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ type: "leave" }));
      } catch {
        this.setState("LEFT");
      }
    } else {
      this.setState("LEFT");
    }
  }

  public disconnect(): void {
    this.leaveRoom();
  }

  public clearCanvas(): void {
    this.send({ type: "clear_canvas" });
  }

  public send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = JSON.stringify(message);
    this.outgoingCount++;
    this.socket.send(payload);
  }

  // Droppable cursor send with backpressure isolation
  public sendCursor(seq: number, x: number, y: number, timestamp: number): boolean {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN ||
      this.state === "LEAVING" ||
      this.state === "LEFT" ||
      this.state === "DISCONNECTED"
    ) {
      return false;
    }

    // Check client socket backpressure (Section 26 of PRD)
    if (this.socket.bufferedAmount > 32 * 1024) {
      this.staleDrops++;
      return false;
    }

    this.send({
      type: "cursor",
      seq,
      x,
      y,
      timestamp,
    });
    return true;
  }

  private processIncomingMessage(rawData: any): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      console.warn("[WS] Failed to parse message JSON:", rawData);
      return;
    }

    // Runtime Zod validation
    const validation = ServerMessageSchema.safeParse(parsed);
    if (!validation.success) {
      console.warn("[WS] Invalid message from server:", validation.error.format());
      return;
    }

    const message = validation.data;

    // Handle welcome to store credentials
    if (message.type === "welcome") {
      this.resumeToken = message.resumeToken;
      this.sessionVersion = message.sessionVersion;
      this.setState("CONNECTED");
    } else if (message.type === "leave_ack") {
      this.resumeToken = null;
      this.setState("LEFT");
      if (this.socket) {
        try {
          this.socket.close(1000, "Left room");
        } catch {
          // ignore
        }
        this.socket = null;
      }
    } else if (message.type === "room_full") {
      this.setState("ROOM_FULL");
    }

    this.notifyHandlers(message);
  }

  private notifyHandlers(message: ServerMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (err) {
        console.error("[WS] Handler error:", err);
      }
    }
  }

  private handleConnectionFailure(): void {
    this.setState("RECONNECTING");
    this.reconnectCount++;

    // Exponential backoff with small random jitter: 1s, 2s, 4s, 8s, 10s max (PRD Section 20)
    const baseDelay = Math.min(10000, Math.pow(2, this.reconnectAttempts) * 1000);
    const jitter = Math.random() * 500;
    const delay = baseDelay + jitter;
    this.reconnectAttempts++;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.activeRoomId && this.activeDisplayName && !this.isIntentionalClose && this.state !== "LEFT") {
        this.connect(this.activeRoomId, this.activeDisplayName);
      }
    }, delay);
  }



  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      for (const handler of this.stateHandlers) {
        handler(newState);
      }
    }
  }

  public getBufferedAmount(): number {
    return this.socket?.bufferedAmount ?? 0;
  }
}
