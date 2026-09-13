export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 5.0;
export const DEFAULT_ZOOM = 1.0;
export const ZOOM_STEP = 0.25;

/**
 * Validates and clamps camera values to prevent NaN, zero-zoom, or runaway off-screen coords.
 */
export function sanitizeCamera(cam: Camera): Camera {
  const zoom = Number.isFinite(cam.zoom) && cam.zoom > 0
    ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom))
    : DEFAULT_ZOOM;
  const x = Number.isFinite(cam.x) ? Math.max(-100000, Math.min(100000, cam.x)) : 0;
  const y = Number.isFinite(cam.y) ? Math.max(-100000, Math.min(100000, cam.y)) : 0;
  return { x, y, zoom };
}

/**
 * Converts screen/viewport coordinates (relative to canvas container top-left)
 * to virtual infinite world coordinates.
 */
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

/**
 * Converts virtual infinite world coordinates to screen/viewport coordinates
 * (relative to canvas container top-left).
 */
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

/**
 * Computes updated camera position and zoom level when zooming centered around
 * a specific screen point (such as cursor or pinch midpoint).
 * ALWAYS returns a fresh, immutable sanitized Camera object.
 */
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

  // World point before zoom
  const worldX = (sx - safeCam.x) / safeCam.zoom;
  const worldY = (sy - safeCam.y) / safeCam.zoom;

  // New camera offset so that world point stays at the same screen point
  const newX = sx - worldX * clampedZoom;
  const newY = sy - worldY * clampedZoom;

  return sanitizeCamera({
    x: newX,
    y: newY,
    zoom: clampedZoom,
  });
}
