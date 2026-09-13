import { ClientTelemetry, ServerPongMessage } from "../shared/types.js";
import { RealtimeWebSocketClient } from "./wsClient.js";

export class TelemetryManager {
  private wsClient: RealtimeWebSocketClient;
  private smoothedRtt = 0;
  private currentFps = 60;
  private frameCount = 0;
  private lastFpsCalcTime = performance.now();
  private pingInterval: any = null;
  private rafId: number | null = null;

  private prevOutgoing = 0;
  private prevIncoming = 0;
  private outgoingRate = 0;
  private incomingRate = 0;
  private rateCalcInterval: any = null;

  constructor(wsClient: RealtimeWebSocketClient) {
    this.wsClient = wsClient;
  }

  public start(): void {
    // 1. App Ping loop every 2.5s for RTT measurement
    this.pingInterval = setInterval(() => {
      if (this.wsClient.getState() === "CONNECTED") {
        this.wsClient.send({
          type: "app_ping",
          timestamp: Date.now(),
        });
      }
    }, 2500);

    // 2. Message rate calculator (every 1s)
    this.rateCalcInterval = setInterval(() => {
      this.outgoingRate = this.wsClient.outgoingCount - this.prevOutgoing;
      this.incomingRate = this.wsClient.incomingCount - this.prevIncoming;
      this.prevOutgoing = this.wsClient.outgoingCount;
      this.prevIncoming = this.wsClient.incomingCount;
    }, 1000);

    // 3. Render FPS counter loop
    const countFps = () => {
      this.frameCount++;
      const now = performance.now();
      const delta = now - this.lastFpsCalcTime;
      if (delta >= 1000) {
        this.currentFps = Math.round((this.frameCount * 1000) / delta);
        this.frameCount = 0;
        this.lastFpsCalcTime = now;
      }
      this.rafId = requestAnimationFrame(countFps);
    };
    this.rafId = requestAnimationFrame(countFps);
  }

  public stop(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.rateCalcInterval) clearInterval(this.rateCalcInterval);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  public handlePong(message: ServerPongMessage): void {
    const now = Date.now();
    const rtt = Math.max(0, now - message.clientTimestamp);
    if (this.smoothedRtt === 0) {
      this.smoothedRtt = rtt;
    } else {
      // Exponential Moving Average (PRD Section 36)
      this.smoothedRtt = Math.round(0.2 * rtt + 0.8 * this.smoothedRtt);
    }
  }

  public getTelemetry(): ClientTelemetry {
    return {
      rtt: this.smoothedRtt,
      fps: this.currentFps,
      outgoingRate: this.outgoingRate,
      incomingRate: this.incomingRate,
      bufferedBytes: this.wsClient.getBufferedAmount(),
      staleDrops: this.wsClient.staleDrops,
      reconnectCount: this.wsClient.reconnectCount,
    };
  }
}
