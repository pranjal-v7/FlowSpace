import { RemoteCursorSnapshot, ServerCursorMessage } from "../shared/types.js";
import { Camera, sanitizeCamera } from "../canvas/coordinates.js";

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

export interface OffscreenIndicatorData {
  x: number;
  y: number;
  angleDeg: number;
}

export class RemoteCursorInterpolator {
  private tracks: Map<string, RemoteCursorTrack> = new Map();
  private domElements: Map<string, HTMLElement | null> = new Map();
  private indicatorElements: Map<string, HTMLElement | null> = new Map();
  private interpolationDelayMs = 60; // Configurable (50-80ms)
  private rafId: number | null = null;
  private isRunning = false;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  private viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;

  public setInterpolationDelay(delayMs: number): void {
    this.interpolationDelayMs = Math.max(10, Math.min(250, delayMs));
  }

  public getInterpolationDelay(): number {
    return this.interpolationDelayMs;
  }

  public setCamera(camera: Camera): void {
    this.camera = sanitizeCamera(camera);
  }

  public setViewport(width: number, height: number): void {
    if (Number.isFinite(width) && width > 0) this.viewportWidth = width;
    if (Number.isFinite(height) && height > 0) this.viewportHeight = height;
  }

  public registerDomElement(userId: string, element: HTMLElement | null): void {
    if (element) {
      this.domElements.set(userId, element);
    } else {
      this.domElements.delete(userId);
    }
    const track = this.tracks.get(userId);
    if (track) {
      track.domElement = element;
    }
  }

  public registerIndicatorDomElement(userId: string, element: HTMLElement | null): void {
    if (element) {
      this.indicatorElements.set(userId, element);
    } else {
      this.indicatorElements.delete(userId);
    }
  }

  public getTrackWorldPosition(userId: string): { x: number; y: number } | null {
    const track = this.tracks.get(userId);
    if (!track || track.samples.length === 0) return null;
    return { x: track.currentX, y: track.currentY };
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
        domElement: this.domElements.get(c.userId) || null,
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
        domElement: this.domElements.get(message.userId) || null,
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
    this.domElements.delete(userId);
    this.indicatorElements.delete(userId);
  }

  public clear(): void {
    this.tracks.clear();
    this.domElements.clear();
    this.indicatorElements.clear();
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
    const renderTime = Date.now() - this.interpolationDelayMs;
    const safeCam = sanitizeCamera(this.camera);
    const vw = this.viewportWidth;
    const vh = this.viewportHeight;
    const centerX = vw / 2;
    const centerY = vh / 2;

    const HYSTERESIS = 20;
    const minX = 64;
    const maxX = Math.max(minX + 10, vw - 64);
    const minY = 36;
    const maxY = Math.max(minY + 10, vh - 36);

    // Keep track of placed indicators to apply small stacking offsets for clusters
    const placedIndicators: { x: number; y: number }[] = [];

    for (const track of this.tracks.values()) {
      if (track.samples.length === 0) continue;

      let targetX = track.currentX;
      let targetY = track.currentY;

      if (track.samples.length === 1) {
        targetX = track.samples[0].x;
        targetY = track.samples[0].y;
      } else {
        const p0 = track.samples[track.samples.length - 2];
        const p1 = track.samples[track.samples.length - 1];

        const dt = p1.timestamp - p0.timestamp;
        if (dt > 0) {
          const t = Math.max(0, Math.min(1, (renderTime - p0.timestamp) / dt));
          targetX = p0.x + (p1.x - p0.x) * t;
          targetY = p0.y + (p1.y - p0.y) * t;
        } else {
          targetX = p1.x;
          targetY = p1.y;
        }
      }

      track.currentX = targetX;
      track.currentY = targetY;

      const domEl = track.domElement || this.domElements.get(track.userId);
      const indicatorEl = this.indicatorElements.get(track.userId);

      // Project world coordinates to local screen coordinates
      const screenX = Math.round(targetX * safeCam.zoom + safeCam.x);
      const screenY = Math.round(targetY * safeCam.zoom + safeCam.y);

      if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
        if (domEl) domEl.style.display = "none";
        if (indicatorEl) indicatorEl.style.display = "none";
        continue;
      }

      // Check if cursor is on-screen vs off-screen (with hysteresis margin)
      const isOnScreen =
        screenX >= -HYSTERESIS &&
        screenX <= vw + HYSTERESIS &&
        screenY >= -HYSTERESIS &&
        screenY <= vh + HYSTERESIS;

      if (isOnScreen) {
        // 1. Render normal on-screen cursor
        if (domEl) {
          domEl.style.display = "";
          domEl.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
        }
        if (indicatorEl) {
          indicatorEl.style.display = "none";
        }
      } else {
        // 2. Hide on-screen cursor, compute and render edge indicator
        if (domEl) {
          domEl.style.display = "none";
        }

        if (indicatorEl) {
          let dx = screenX - centerX;
          let dy = screenY - centerY;
          if (dx === 0 && dy === 0) dx = 1;

          // Ray-box intersection from viewport center to screen position
          let t = Infinity;
          if (dx > 0) t = Math.min(t, (maxX - centerX) / dx);
          else if (dx < 0) t = Math.min(t, (minX - centerX) / dx);
          if (dy > 0) t = Math.min(t, (maxY - centerY) / dy);
          else if (dy < 0) t = Math.min(t, (minY - centerY) / dy);

          if (!Number.isFinite(t) || t < 0) t = 0;

          let indX = Math.round(centerX + t * dx);
          let indY = Math.round(centerY + t * dy);

          // Check collision with already placed off-screen indicators and offset along edge
          for (const placed of placedIndicators) {
            const dist = Math.hypot(placed.x - indX, placed.y - indY);
            if (dist < 42) {
              // Offset along tangent
              if (indY <= minY + 5 || indY >= maxY - 5) {
                // Top or bottom edge -> shift horizontally
                indX = Math.max(minX, Math.min(maxX, indX + (indX > centerX ? -44 : 44)));
              } else {
                // Left or right edge -> shift vertically
                indY = Math.max(minY, Math.min(maxY, indY + (indY > centerY ? -44 : 44)));
              }
            }
          }
          placedIndicators.push({ x: indX, y: indY });

          const angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);

          indicatorEl.style.display = "flex";
          indicatorEl.style.transform = `translate3d(${indX}px, ${indY}px, 0) translate(-50%, -50%)`;
          indicatorEl.style.setProperty("--arrow-angle", `${angleDeg}deg`);
        }
      }
    }
  }
}
