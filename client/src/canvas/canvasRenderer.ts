import { CanvasObject, CanvasShapeObject, CanvasStrokeObject, CanvasTextObject } from "../shared/types.js";
import { Camera } from "./coordinates.js";

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not obtain 2D rendering context");
    this.ctx = context;
    this.handleResize();
  }

  public handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.resetTransform();
    this.ctx.scale(this.dpr, this.dpr);
  }

  public render(
    objects: CanvasObject[],
    previewObject: CanvasObject | null = null,
    highlightedObjectId: string | null = null,
    camera: Camera = { x: 0, y: 0, zoom: 1 }
  ): void {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    // Clear full canvas viewport
    this.ctx.clearRect(0, 0, width, height);

    // 1. Draw infinite background grid (dots) aligned with camera
    this.drawBackgroundGrid(width, height, camera);

    // 2. Apply camera transform for world coordinates
    this.ctx.save();
    this.ctx.translate(camera.x, camera.y);
    this.ctx.scale(camera.zoom, camera.zoom);

    // Render all persistent world objects
    for (const obj of objects) {
      this.renderObject(obj, obj.objectId === highlightedObjectId);
    }

    // Render active drawing/shape preview
    if (previewObject) {
      this.renderObject(previewObject, false);
    }

    this.ctx.restore();
  }

  private drawBackgroundGrid(viewportWidth: number, viewportHeight: number, camera: Camera): void {
    const baseGridSize = 40;
    // Adapt grid scale when zoomed out/in for clean visuals
    let gridSize = baseGridSize;
    while (gridSize * camera.zoom < 24) gridSize *= 2;
    while (gridSize * camera.zoom > 100) gridSize /= 2;

    const screenGridSize = gridSize * camera.zoom;
    const startX = ((camera.x % screenGridSize) + screenGridSize) % screenGridSize;
    const startY = ((camera.y % screenGridSize) + screenGridSize) % screenGridSize;

    this.ctx.save();
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.05)";

    const dotRadius = Math.max(1, Math.min(2, 1.2 * (camera.zoom < 0.5 ? 0.8 : 1)));
    for (let x = startX; x < viewportWidth; x += screenGridSize) {
      for (let y = startY; y < viewportHeight; y += screenGridSize) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }

  private renderObject(
    obj: CanvasObject,
    isHighlighted: boolean
  ): void {
    this.ctx.save();

    if (isHighlighted) {
      this.ctx.shadowColor = "rgba(239, 68, 68, 0.8)";
      this.ctx.shadowBlur = 10;
    }

    switch (obj.type) {
      case "stroke":
        this.renderStroke(obj);
        break;
      case "shape":
        this.renderShape(obj);
        break;
      case "text":
        this.renderText(obj);
        break;
    }

    this.ctx.restore();
  }

  /**
   * Smooth pen stroke rendering using quadratic Bézier midpoint interpolation.
   * Produces natural, continuous handwritten curves for both live local previews
   * and completed/remote strokes without polygon-like straight line artifacts.
   */
  private renderStroke(stroke: CanvasStrokeObject): void {
    const pts = stroke.points;
    const len = pts.length;
    if (len < 1) return;

    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.lineWidth = stroke.size;

    if (stroke.isHighlighter) {
      this.ctx.globalAlpha = stroke.opacity || 0.45;
      this.ctx.strokeStyle = stroke.color;
      this.ctx.globalCompositeOperation = "source-over";
    } else {
      this.ctx.globalAlpha = stroke.opacity || 1;
      this.ctx.strokeStyle = stroke.color;
    }

    if (len === 1) {
      // Single tap / click dot
      this.ctx.beginPath();
      this.ctx.arc(pts[0][0], pts[0][1], stroke.size / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = stroke.color;
      this.ctx.fill();
    } else if (len === 2) {
      // Direct 2-point segment
      this.ctx.beginPath();
      this.ctx.moveTo(pts[0][0], pts[0][1]);
      this.ctx.lineTo(pts[1][0], pts[1][1]);
      this.ctx.stroke();
    } else {
      // Quadratic Bézier curve through midpoints
      this.ctx.beginPath();
      this.ctx.moveTo(pts[0][0], pts[0][1]);

      for (let i = 1; i < len - 1; i++) {
        const midX = (pts[i][0] + pts[i + 1][0]) / 2;
        const midY = (pts[i][1] + pts[i + 1][1]) / 2;
        this.ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
      }

      // Smooth transition to final point
      this.ctx.lineTo(pts[len - 1][0], pts[len - 1][1]);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private renderShape(shape: CanvasShapeObject): void {
    this.ctx.save();
    this.ctx.globalAlpha = shape.opacity || 1;
    this.ctx.lineWidth = shape.size;
    this.ctx.strokeStyle = shape.color;
    this.ctx.fillStyle = shape.color;

    const x1 = shape.startX;
    const y1 = shape.startY;
    const x2 = shape.endX;
    const y2 = shape.endY;

    switch (shape.shapeType) {
      case "rectangle": {
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const rectW = Math.abs(x2 - x1);
        const rectH = Math.abs(y2 - y1);
        if (shape.fill) {
          this.ctx.fillRect(left, top, rectW, rectH);
        } else {
          this.ctx.strokeRect(left, top, rectW, rectH);
        }
        break;
      }

      case "circle": {
        const radiusX = Math.abs(x2 - x1) / 2;
        const radiusY = Math.abs(y2 - y1) / 2;
        const centerX = Math.min(x1, x2) + radiusX;
        const centerY = Math.min(y1, y2) + radiusY;
        this.ctx.beginPath();
        this.ctx.ellipse(centerX, centerY, Math.max(0.1, radiusX), Math.max(0.1, radiusY), 0, 0, Math.PI * 2);
        if (shape.fill) {
          this.ctx.fill();
        } else {
          this.ctx.stroke();
        }
        break;
      }

      case "line": {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        break;
      }

      case "arrow": {
        this.drawArrow(x1, y1, x2, y2, shape.size);
        break;
      }
    }

    this.ctx.restore();
  }

  private drawArrow(x1: number, y1: number, x2: number, y2: number, size: number): void {
    const headLength = Math.max(14, size * 3);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);

    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    // Arrow head
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6),
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6),
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  private renderText(text: CanvasTextObject): void {
    this.ctx.save();
    this.ctx.fillStyle = text.color;
    this.ctx.font = `${text.fontSize}px ${text.font}`;
    this.ctx.textBaseline = "top";

    const px = text.x;
    const py = text.y;

    const lines = text.content.split("\n");
    const lineHeight = text.fontSize * 1.25;

    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], px, py + i * lineHeight);
    }

    this.ctx.restore();
  }
}
