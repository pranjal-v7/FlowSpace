export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5.0;
export const DEFAULT_ZOOM = 1.0;
export const ZOOM_STEP = 0.25;

/**
 * Converts screen/viewport coordinates (relative to canvas container top-left)
 * to virtual infinite world coordinates.
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: Camera
): { x: number; y: number } {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom,
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
  return {
    x: worldX * camera.zoom + camera.x,
    y: worldY * camera.zoom + camera.y,
  };
}

/**
 * Computes updated camera position and zoom level when zooming centered around
 * a specific screen point (such as the cursor position).
 */
export function zoomAtScreenPoint(
  screenX: number,
  screenY: number,
  currentCamera: Camera,
  targetZoom: number
): Camera {
  const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
  if (clampedZoom === currentCamera.zoom) {
    return currentCamera;
  }

  // World point before zoom
  const worldX = (screenX - currentCamera.x) / currentCamera.zoom;
  const worldY = (screenY - currentCamera.y) / currentCamera.zoom;

  // New camera offset so that world point stays at the same screen point
  const newX = screenX - worldX * clampedZoom;
  const newY = screenY - worldY * clampedZoom;

  return {
    x: newX,
    y: newY,
    zoom: clampedZoom,
  };
}
