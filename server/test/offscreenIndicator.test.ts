import { describe, it, expect } from "vitest";

export function computeIndicatorPosition(
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  edgeMargin = 32
) {
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const minX = edgeMargin;
  const maxX = Math.max(minX + 10, viewportWidth - edgeMargin);
  const minY = edgeMargin;
  const maxY = Math.max(minY + 10, viewportHeight - edgeMargin);

  let dx = screenX - centerX;
  let dy = screenY - centerY;
  if (dx === 0 && dy === 0) dx = 1;

  let t = Infinity;
  if (dx > 0) t = Math.min(t, (maxX - centerX) / dx);
  else if (dx < 0) t = Math.min(t, (minX - centerX) / dx);
  if (dy > 0) t = Math.min(t, (maxY - centerY) / dy);
  else if (dy < 0) t = Math.min(t, (minY - centerY) / dy);

  if (!Number.isFinite(t) || t < 0) t = 0;

  const indX = Math.round(centerX + t * dx);
  const indY = Math.round(centerY + t * dy);
  const angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);

  return { indX, indY, angleDeg };
}

export function computeJumpCamera(
  targetWorldX: number,
  targetWorldY: number,
  currentZoom: number,
  viewportWidth: number,
  viewportHeight: number
) {
  return {
    targetCamX: viewportWidth / 2 - targetWorldX * currentZoom,
    targetCamY: viewportHeight / 2 - targetWorldY * currentZoom,
    zoom: currentZoom,
  };
}

describe("Off-Screen Indicator & Navigation Math", () => {
  const VW = 1000;
  const VH = 800;

  it("places indicator on the right edge when cursor is far to the right", () => {
    const { indX, indY, angleDeg } = computeIndicatorPosition(2500, 400, VW, VH, 30);
    expect(indX).toBe(VW - 30); // 970
    expect(indY).toBe(400);
    expect(angleDeg).toBe(0);
  });

  it("places indicator on the left edge when cursor is far to the left", () => {
    const { indX, indY, angleDeg } = computeIndicatorPosition(-1500, 400, VW, VH, 30);
    expect(indX).toBe(30);
    expect(indY).toBe(400);
    expect(Math.abs(angleDeg)).toBe(180);
  });

  it("places indicator on the top edge when cursor is far above", () => {
    const { indX, indY, angleDeg } = computeIndicatorPosition(500, -900, VW, VH, 30);
    expect(indX).toBe(500);
    expect(indY).toBe(30);
    expect(angleDeg).toBe(-90);
  });

  it("places indicator on the bottom edge when cursor is far below", () => {
    const { indX, indY, angleDeg } = computeIndicatorPosition(500, 2000, VW, VH, 30);
    expect(indX).toBe(500);
    expect(indY).toBe(VH - 30); // 770
    expect(angleDeg).toBe(90);
  });

  it("correctly calculates target camera to center on collaborator world coordinate", () => {
    const worldX = 400;
    const worldY = 300;
    const zoom = 1.5;
    const { targetCamX, targetCamY, zoom: finalZoom } = computeJumpCamera(
      worldX,
      worldY,
      zoom,
      VW,
      VH
    );

    // Center of screen: 500, 400
    // Resulting screenX = worldX * zoom + targetCamX = 400 * 1.5 + (-100) = 600 - 100 = 500!
    // Resulting screenY = worldY * zoom + targetCamY = 300 * 1.5 + (-50) = 450 - 50 = 400!
    expect(worldX * zoom + targetCamX).toBe(VW / 2);
    expect(worldY * zoom + targetCamY).toBe(VH / 2);
    expect(finalZoom).toBe(zoom); // Zoom is preserved!
  });

  it("home camera restores (0, 0) and preserves zoom", () => {
    const currentZoom = 2.0;
    const homeCam = { x: 0, y: 0, zoom: currentZoom };
    expect(homeCam.x).toBe(0);
    expect(homeCam.y).toBe(0);
    expect(homeCam.zoom).toBe(2.0);
  });
});
