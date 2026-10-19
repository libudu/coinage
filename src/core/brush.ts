import type { Point, Project } from "./model";

export type BrushTip = "none" | "horizontal" | "vertical";
export type BrushSettings = { length: number; spread: number };
export type BrushDefaults = {
  startTip: BrushTip;
  endTip: BrushTip;
  startBrush: BrushSettings;
  endBrush: BrushSettings;
};
export const defaultBrushSettings: Readonly<BrushSettings> = { length: 100, spread: 100 };
export const defaultBrush: BrushDefaults = {
  startTip: "none", endTip: "none",
  startBrush: { ...defaultBrushSettings }, endBrush: { ...defaultBrushSettings },
};

// Accept older v1 files, but discard endpoint overrides on load/import.
export function migrateProjectBrush(project: Project): Project {
  for (const glyph of project.glyphs)
    for (const stroke of glyph.strokes) {
      delete stroke.startTip;
      delete stroke.endTip;
      delete stroke.startBrush;
      delete stroke.endBrush;
    }
  return project;
}

export function changeGlobalBrush(project: Project, patch: Partial<BrushDefaults>) {
  project.brush = structuredClone({ ...(project.brush ?? defaultBrush), ...patch });
}

export function isBrushDefaults(value: unknown): value is BrushDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const brush = value as BrushDefaults;
  return brushTips.includes(brush.startTip) && brushTips.includes(brush.endTip)
    && isBrushSettings(brush.startBrush) && isBrushSettings(brush.endBrush);
}
export const brushSettingLimits = {
  length: { min: 25, max: 250 },
  spread: { min: 0, max: 200 },
} as const;

export function isBrushSettings(value: unknown): value is BrushSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as BrushSettings;
  return (["length", "spread"] as const).every((key) =>
    Number.isFinite(settings[key]) &&
    settings[key] >= brushSettingLimits[key].min &&
    settings[key] <= brushSettingLimits[key].max,
  );
}
export const brushTips: readonly BrushTip[] = ["none", "horizontal", "vertical"];
export const brushPresets: readonly {
  name: string;
  start: BrushTip;
  end: BrushTip;
}[] = [
  { name: "横", start: "horizontal", end: "horizontal" },
  { name: "横竖", start: "horizontal", end: "vertical" },
  { name: "横无", start: "horizontal", end: "none" },
  { name: "竖", start: "vertical", end: "vertical" },
  { name: "竖横", start: "vertical", end: "horizontal" },
  { name: "竖无", start: "vertical", end: "none" },
  { name: "无横", start: "none", end: "horizontal" },
  { name: "无竖", start: "none", end: "vertical" },
];

export type BrushSample = Point & {
  width: number;
  boundary?: boolean;
  brushSkew?: number;
};

// The reference PNGs have a roughly 1.35× flared end, a 0.3× width
// diagonal cut, and a shoulder about 1.2 widths long. Keep these in local
// path coordinates so both ends follow curves and scale with stroke width.
// Add shoulder samples even to a straight, two-node stroke; otherwise the
// flare would stretch over the entire stroke. Never mutate stored knots.
export function applyBrushProfile<T extends BrushSample>(
  points: T[],
  start: BrushTip,
  end: BrushTip,
  startSettings: Readonly<BrushSettings> = defaultBrushSettings,
  endSettings: Readonly<BrushSettings> = defaultBrushSettings,
): (T | BrushSample)[] {
  if (points.length < 2 || (start === "none" && end === "none")) return points;
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    ));
  const total = lengths[lengths.length - 1];
  const first = points[0], last = points[points.length - 1];
  // Stop before the next knot, including a turn or a shared junction.
  const firstBoundary = points.findIndex((p, i) => i > 0 && p.boundary);
  let lastBoundary = points.length - 2;
  while (lastBoundary > 0 && !points[lastBoundary].boundary) lastBoundary--;
  const requestedStart = first.width * 1.2 * startSettings.length / 100,
    requestedEnd = last.width * 1.2 * endSettings.length / 100;
  const startLength = start === "none" ? 0 : Math.min(
    requestedStart, total * 0.45,
    lengths[firstBoundary < 0 ? points.length - 1 : firstBoundary] * 0.8,
  );
  const endLength = end === "none" ? 0 : Math.min(
    requestedEnd, total * 0.45, (total - lengths[lastBoundary]) * 0.8,
  );
  const shoulders = [startLength, total - endLength]
    .filter((d) => d > 0 && d < total).sort((a, b) => a - b);
  const result: (T | BrushSample)[] = [];
  const add = (p: T | BrushSample, at: number) => {
    const fromStart = startLength > 0 ? Math.max(0, 1 - at / startLength) : 0;
    const fromEnd = endLength > 0 ? Math.max(0, 1 - (total - at) / endLength) : 0;
    // Length controls the shoulder's reach; spread controls its flare.
    // Only geometric clipping reduces the flare, keeping short strokes safe.
    const strength = fromStart * startLength / requestedStart * startSettings.spread / 100
      + fromEnd * endLength / requestedEnd * endSettings.spread / 100;
    result.push({
      ...p,
      width: p.width * (1 + 0.35 * strength),
      brushSkew:
        (start === "horizontal" ? 1 : -1) * Math.min(first.width * 0.15, startLength * 0.125) * fromStart
        + (end === "horizontal" ? 1 : -1) * Math.min(last.width * 0.15, endLength * 0.125) * fromEnd,
    });
  };
  add(first, 0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    for (const d of shoulders) {
      if (d <= lengths[i - 1] + 0.0001 || d >= lengths[i] - 0.0001) continue;
      const t = (d - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
      add({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        width: a.width + (b.width - a.width) * t }, d);
    }
    add(b, lengths[i]);
  }
  return result;
}
