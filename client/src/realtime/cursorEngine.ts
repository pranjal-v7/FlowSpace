import { RealtimeWebSocketClient } from "./wsClient.js";

export class LocalCursorEngine {
  private wsClient: RealtimeWebSocketClient;
  private seq = 0;
  private lastSentTime = 0;
  private throttleIntervalMs = 35; // ~28-30Hz
  private lastSentX = -999999;
  private lastSentY = -999999;
  private minMovementThreshold = 0.5; // World unit distance threshold

  constructor(wsClient: RealtimeWebSocketClient) {
    this.wsClient = wsClient;
  }

  public resetSequence(): void {
    this.seq = 0;
    this.lastSentX = -999999;
    this.lastSentY = -999999;
    this.lastSentTime = 0;
  }

  public handlePointerMove(worldX: number, worldY: number): void {
    const now = Date.now();

    // 1. Throttle check (25-30Hz)
    if (now - this.lastSentTime < this.throttleIntervalMs) {
      return;
    }

    // 2. Movement distance threshold check in world coordinates
    const dx = Math.abs(worldX - this.lastSentX);
    const dy = Math.abs(worldY - this.lastSentY);
    if (dx < this.minMovementThreshold && dy < this.minMovementThreshold) {
      return;
    }

    // 3. Increment monotonic sequence
    this.seq++;
    this.lastSentTime = now;
    this.lastSentX = worldX;
    this.lastSentY = worldY;

    // 4. Send world coordinates via droppable cursor lane
    this.wsClient.sendCursor(this.seq, worldX, worldY, now);
  }
}
