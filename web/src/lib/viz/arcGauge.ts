import { arc, type DefaultArcObject } from 'd3-shape';

const START_ANGLE = -Math.PI / 2;

function arcDatum(innerRadius: number, outerRadius: number, endAngle: number): DefaultArcObject {
  return { innerRadius, outerRadius, startAngle: START_ANGLE, endAngle };
}

/** Build filled arc paths for a 0–100 score ring (12 o'clock start). */
export function buildScoreArcPaths(
  score: number | null | undefined,
  innerRadius: number,
  outerRadius: number,
): { background: string; foreground: string | null } {
  const fullArc = arc().cornerRadius(1);
  const background = fullArc(arcDatum(innerRadius, outerRadius, START_ANGLE + 2 * Math.PI)) ?? '';

  if (score == null) return { background, foreground: null };

  const clamped = Math.min(100, Math.max(0, score));
  const fgArc = arc().cornerRadius(1);
  const foreground =
    fgArc(arcDatum(innerRadius, outerRadius, START_ANGLE + (clamped / 100) * 2 * Math.PI)) ?? '';

  return { background, foreground };
}

/** Dashed overlay arc for critical scores (< 50). */
export function buildCriticalOverlayPath(innerRadius: number, outerRadius: number): string {
  const overlay = arc();
  return overlay(arcDatum(innerRadius, outerRadius, START_ANGLE + 2 * Math.PI)) ?? '';
}
