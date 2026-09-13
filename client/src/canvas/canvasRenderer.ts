import { CanvasObject, CanvasShapeObject, CanvasStrokeObject, CanvasTextObject } from "../shared/types.js";

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
    this.ctx.resetTransform();
    this.ctx.scale(this.dpr, this.dpr);
  }

  public render(
    objects: CanvasObject[],
    previewObject: CanvasObject | null = null,
    highlightedObjectId: string | null = null
  ): void {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    this.ctx.clearRect(0, 0, width, height);

    // 1. Render all persistent objects
    for (const obj of objects) {
      this.renderObject(obj, width, height, obj.objectId === highlightedObjectId);
    }

    // 2. Render active drawing/shape preview
    if (previewObject) {
      this.renderObject(previewObject, width, height, false);
    }
  }

  private renderObject(
    obj: CanvasObject,
    width: number,
    height: number,
    isHighlighted: boolean
  ): void {
    this.ctx.save();

    if (isHighlighted) {
      this.ctx.shadowColor = "rgba(239, 68, 68, 0.8)";
      this.ctx.shadowBlur = 10;
    }

    switch (obj.type) {
      case "stroke":
        this.renderStroke(obj, width, height);
        break;
      case "shape":
        this.renderShape(obj, width, height);
        break;
      case "text":
        this.renderText(obj, width, height);
        break;
    }

    this.ctx.restore();
  }

  private renderStroke(stroke: CanvasStrokeObject, width: number, height: number): void {
    if (stroke.points.length < 1) return;

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

    this.ctx.beginPath();
    const startX = stroke.points[0][0] * width;
    const startY = stroke.points[0][1] * height;
    this.ctx.moveTo(startX, startY);

    if (stroke.points.length === 1) {
      this.ctx.arc(startX, startY, stroke.size / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = stroke.color;
      this.ctx.fill();
    } else {
      for (let i = 1; i < stroke.points.length; i++) {
        const px = stroke.points[i][0] * width;
        const py = stroke.points[i][1] * height;
        this.ctx.lineTo(px, py);
      }
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private renderShape(shape: CanvasShapeObject, width: number, height: number): void {
    this.ctx.save();
    this.ctx.globalAlpha = shape.opacity || 1;
    this.ctx.lineWidth = shape.size;
    this.ctx.strokeStyle = shape.color;
    this.ctx.fillStyle = shape.color;

    const x1 = shape.startX * width;
    const y1 = shape.startY * height;
    const x2 = shape.endX * width;
    const y2 = shape.endY * height;

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
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
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

  private renderText(text: CanvasTextObject, width: number, height: number): void {
    this.ctx.save();
    this.ctx.fillStyle = text.color;
    this.ctx.font = `${text.fontSize}px ${text.font}`;
    this.ctx.textBaseline = "top";

    const px = text.x * width;
    const py = text.y * height;

    const lines = text.content.split("\n");
    const lineHeight = text.fontSize * 1.25;

    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], px, py + i * lineHeight);
    }

    this.ctx.restore();
  }
}
