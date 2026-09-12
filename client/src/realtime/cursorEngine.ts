import { RealtimeWebSocketClient } from "./wsClient.js";

export class LocalCursorEngine {
  private wsClient: RealtimeWebSocketClient;
  private seq = 0;
  private lastSentTime = 0;
  private throttleIntervalMs = 35; // ~28-30Hz
  private lastSentX = -1;
  private lastSentY = -1;
  private minMovementThreshold = 0.0008; // Normalized min distance

  constructor(wsClient: RealtimeWebSocketClient) {
    this.wsClient = wsClient;
  }

  public resetSequence(): void {
    this.seq = 0;
    this.lastSentX = -1;
    this.lastSentY = -1;
    this.lastSentTime = 0;
  }

  public handlePointerMove(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect
  ): void {
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    // 1. Normalize coordinates to [0, 1]
    const normX = Math.max(0, Math.min(1, (clientX - canvasRect.left) / canvasRect.width));
    const normY = Math.max(0, Math.min(1, (clientY - canvasRect.top) / canvasRect.height));

    const now = Date.now();

    // 2. Throttle check (25-30Hz)
    if (now - this.lastSentTime < this.throttleIntervalMs) {
      return;
    }

    // 3. Movement distance threshold check
    const dx = Math.abs(normX - this.lastSentX);
    const dy = Math.abs(normY - this.lastSentY);
    if (this.lastSentX >= 0 && dx < this.minMovementThreshold && dy < this.minMovementThreshold) {
      return;
    }

    // 4. Increment monotonic sequence
    this.seq++;
    this.lastSentTime = now;
    this.lastSentX = normX;
    this.lastSentY = normY;

    // 5. Send via droppable cursor lane
    this.wsClient.sendCursor(this.seq, normX, normY, now);
  }
}
