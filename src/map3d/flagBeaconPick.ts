/** Screen-space hit test and focus zoom for light-pillar beacons. */

export type BeaconPickTarget = {
  lng: number;
  lat: number;
  x: number;
  y: number;
  z: number;
  sy: number;
  adaptiveSize: number;
  scaleCap: number;
};

export function beaconFocusZoom(currentZoom: number): number {
  if (currentZoom >= 14.5) return currentZoom;
  return Math.max(currentZoom + 1.75, 11);
}

/** CSS pixels, origin at the top-left. Anchor is the top of the form. */
export function beaconSpriteHit(
  clickX: number,
  clickY: number,
  anchorX: number,
  anchorY: number,
  headCss: number,
  stemCss: number,
): boolean {
  const radius = Math.max(1, headCss) * 0.5;
  const stem = Math.max(0, stemCss);
  const headX = anchorX;
  const headY = anchorY - (stem + radius);
  const dx = clickX - headX;
  const dy = clickY - headY;
  if (dx * dx + dy * dy <= radius * radius) return true;
  if (stem <= 0) return false;
  const y0 = Math.min(headY + radius * 0.7, anchorY);
  const y1 = Math.max(headY + radius * 0.7, anchorY);
  const halfWidth = Math.max(5, radius * 0.22);
  return clickY >= y0 && clickY <= y1 && Math.abs(clickX - anchorX) <= halfWidth;
}

export function projectSceneToCss(
  clipX: number,
  clipY: number,
  clipW: number,
  cssWidth: number,
  cssHeight: number,
): { x: number; y: number } | null {
  if (!(clipW > 0) || cssWidth <= 0 || cssHeight <= 0) return null;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) return null;
  return {
    x: (ndcX * 0.5 + 0.5) * cssWidth,
    y: (0.5 - ndcY * 0.5) * cssHeight,
  };
}

/** Scene-space Y of the beacon anchor (top of the form). */
export function beaconAnchorY(
  baseY: number,
  scaleY: number,
  objectTop: number,
  factor: number,
): number {
  return baseY + scaleY * Math.max(objectTop, 0.05) * factor;
}
