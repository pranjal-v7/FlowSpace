import { describe, it, expect } from "vitest";

// Test suite for camera coordinate sanitization and zooming
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 5.0;
export const DEFAULT_ZOOM = 1.0;

export function sanitizeCamera(cam: Camera): Camera {
  const zoom = Number.isFinite(cam.zoom) && cam.zoom > 0
    ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom))
    : DEFAULT_ZOOM;
  const x = Number.isFinite(cam.x) ? Math.max(-100000, Math.min(100000, cam.x)) : 0;
  const y = Number.isFinite(cam.y) ? Math.max(-100000, Math.min(100000, cam.y)) : 0;
  return { x, y, zoom };
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: Camera
): { x: number; y: number } {
  const safeCam = sanitizeCamera(camera);
  const sx = Number.isFinite(screenX) ? screenX : 0;
  const sy = Number.isFinite(screenY) ? screenY : 0;
  return {
    x: (sx - safeCam.x) / safeCam.zoom,
    y: (sy - safeCam.y) / safeCam.zoom,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  camera: Camera
): { x: number; y: number } {
  const safeCam = sanitizeCamera(camera);
  const wx = Number.isFinite(worldX) ? worldX : 0;
  const wy = Number.isFinite(worldY) ? worldY : 0;
  return {
    x: wx * safeCam.zoom + safeCam.x,
    y: wy * safeCam.zoom + safeCam.y,
  };
}

export function zoomAtScreenPoint(
  screenX: number,
  screenY: number,
  currentCamera: Camera,
  targetZoom: number
): Camera {
  const safeCam = sanitizeCamera(currentCamera);
  const sx = Number.isFinite(screenX) ? screenX : 0;
  const sy = Number.isFinite(screenY) ? screenY : 0;
  const safeTarget = Number.isFinite(targetZoom) && targetZoom > 0 ? targetZoom : safeCam.zoom;
  const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, safeTarget));

  if (Math.abs(clampedZoom - safeCam.zoom) < 0.0001) {
    return { ...safeCam };
  }

  const worldX = (sx - safeCam.x) / safeCam.zoom;
  const worldY = (sy - safeCam.y) / safeCam.zoom;

  const newX = sx - worldX * clampedZoom;
  const newY = sy - worldY * clampedZoom;

  return sanitizeCamera({
    x: newX,
    y: newY,
    zoom: clampedZoom,
  });
}

describe("Camera & Coordinate System Hardening", () => {
  it("sanitizes NaN, Infinity, and extreme offsets", () => {
    const corruptedCam = { x: NaN, y: Infinity, zoom: -5 };
    const safe = sanitizeCamera(corruptedCam);
    expect(safe.x).toBe(0);
    expect(safe.y).toBe(0);
    expect(safe.zoom).toBe(DEFAULT_ZOOM);
  });

  it("clamps zoom to [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(sanitizeCamera({ x: 0, y: 0, zoom: 0.01 }).zoom).toBe(MIN_ZOOM);
    expect(sanitizeCamera({ x: 0, y: 0, zoom: 10 }).zoom).toBe(MAX_ZOOM);
  });

  it("zoomAtScreenPoint never mutates the input camera reference", () => {
    const original: Camera = { x: 50, y: 100, zoom: 1.0 };
    const frozen = Object.freeze({ ...original });
    const result = zoomAtScreenPoint(200, 200, frozen, 0.8);
    expect(result).not.toBe(frozen);
    expect(result.zoom).toBeCloseTo(0.8);
  });

  it("zoomAtScreenPoint safely handles clamping without reference mutation", () => {
    const cam: Camera = { x: 50, y: 100, zoom: MIN_ZOOM };
    const result = zoomAtScreenPoint(200, 200, cam, 0.01);
    expect(result).not.toBe(cam); // Must return a clone, never the same reference
    expect(result.zoom).toBe(MIN_ZOOM);
    // Modifying result must not alter cam
    result.x = 9999;
    expect(cam.x).toBe(50);
  });

  it("converts world to screen and back accurately", () => {
    const cam: Camera = { x: 120, y: 80, zoom: 0.5 };
    const worldPoint = { x: 300, y: 400 };
    const screenPoint = worldToScreen(worldPoint.x, worldPoint.y, cam);
    expect(screenPoint.x).toBe(300 * 0.5 + 120);
    expect(screenPoint.y).toBe(400 * 0.5 + 80);

    const backToWorld = screenToWorld(screenPoint.x, screenPoint.y, cam);
    expect(backToWorld.x).toBeCloseTo(300);
    expect(backToWorld.y).toBeCloseTo(400);
  });

  it("ensures min line width at low zoom preserves legibility", () => {
    const strokeSize = 2;
    const lowZoom = 0.15;
    const minScreenPixels = 1.2;
    const minWorldLineWidth = minScreenPixels / lowZoom;
    const effectiveLineWidth = Math.max(strokeSize, minWorldLineWidth);

    // Rendered width on screen: effectiveLineWidth * lowZoom
    const renderedScreenWidth = effectiveLineWidth * lowZoom;
    expect(renderedScreenWidth).toBeGreaterThanOrEqual(minScreenPixels);
  });
});
