import { RemoteCursorSnapshot, ServerCursorMessage } from "../../../shared/types.js";

export interface CursorSample {
  x: number;
  y: number;
  timestamp: number;
  seq: number;
}

export interface RemoteCursorTrack {
  userId: string;
  samples: CursorSample[]; // Bounded to max 3 samples
  lastSeq: number;
  currentX: number;
  currentY: number;
  domElement: HTMLElement | null;
}

export class RemoteCursorInterpolator {
  private tracks: Map<string, RemoteCursorTrack> = new Map();
  private interpolationDelayMs = 60; // Configurable (50-80ms)
  private rafId: number | null = null;
  private isRunning = false;
  private containerRect: DOMRect | null = null;

  public setInterpolationDelay(delayMs: number): void {
    this.interpolationDelayMs = Math.max(10, Math.min(250, delayMs));
  }

  public getInterpolationDelay(): number {
    return this.interpolationDelayMs;
  }

  public setContainerRect(rect: DOMRect | null): void {
    this.containerRect = rect;
  }

  public registerDomElement(userId: string, element: HTMLElement | null): void {
    const track = this.tracks.get(userId);
    if (track) {
      track.domElement = element;
    }
  }

  public initializeFromSnapshot(cursors: RemoteCursorSnapshot[]): void {
    const now = Date.now();
    for (const c of cursors) {
      this.tracks.set(c.userId, {
        userId: c.userId,
        samples: [{ x: c.x, y: c.y, timestamp: now, seq: c.seq }],
        lastSeq: c.seq,
        currentX: c.x,
        currentY: c.y,
        domElement: null,
      });
    }
  }

  public handleCursorMessage(message: ServerCursorMessage): void {
    let track = this.tracks.get(message.userId);
    if (!track) {
      track = {
        userId: message.userId,
        samples: [],
        lastSeq: -1,
        currentX: message.x,
        currentY: message.y,
        domElement: null,
      };
      this.tracks.set(message.userId, track);
    }

    // Sequence check: ignore stale or duplicate sequences
    if (message.seq <= track.lastSeq) {
      return;
    }

    track.lastSeq = message.seq;
    track.samples.push({
      x: message.x,
      y: message.y,
      timestamp: Date.now(),
      seq: message.seq,
    });

    // Bounded buffer rule: keep at most 3 recent samples (PRD Section 30)
    if (track.samples.length > 3) {
      track.samples.shift();
    }
  }

  public removeUser(userId: string): void {
    this.tracks.delete(userId);
  }

  public clear(): void {
    this.tracks.clear();
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const renderLoop = () => {
      this.renderFrame();
      if (this.isRunning) {
        this.rafId = requestAnimationFrame(renderLoop);
      }
    };

    this.rafId = requestAnimationFrame(renderLoop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private renderFrame(): void {
    if (!this.containerRect) return;

    const renderTime = Date.now() - this.interpolationDelayMs;
    const width = this.containerRect.width;
    const height = this.containerRect.height;

    for (const track of this.tracks.values()) {
      if (track.samples.length === 0) continue;

      let targetX = track.currentX;
      let targetY = track.currentY;

      if (track.samples.length === 1) {
        // Only 1 sample -> snap to that position
        targetX = track.samples[0].x;
        targetY = track.samples[0].y;
      } else {
        // Find interval [p0, p1] for renderTime
        const p0 = track.samples[track.samples.length - 2];
        const p1 = track.samples[track.samples.length - 1];

        const dt = p1.timestamp - p0.timestamp;
        if (dt > 0) {
          const t = Math.max(0, Math.min(1, (renderTime - p0.timestamp) / dt));
          // Linear interpolation (PRD Section 31)
          targetX = p0.x + (p1.x - p0.x) * t;
          targetY = p0.y + (p1.y - p0.y) * t;
        } else {
          targetX = p1.x;
          targetY = p1.y;
        }
      }

      track.currentX = targetX;
      track.currentY = targetY;

      // Update DOM element transform directly with GPU acceleration
      if (track.domElement) {
        const pixelX = Math.round(targetX * width);
        const pixelY = Math.round(targetY * height);
        track.domElement.style.transform = `translate3d(${pixelX}px, ${pixelY}px, 0)`;
      }
    }
  }
}
