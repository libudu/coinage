import {
  defaultFilenamePattern,
  filenamePatternMaxLength,
} from "./filenameInfo";

export type TraceOptions = {
  threshold: number;
  simplify: number;
  noise: number;
  polarity: "dark" | "light";
  width: number;
};
export const defaultTrace: TraceOptions = {
  threshold: 155,
  simplify: 2.5,
  noise: 14,
  polarity: "dark",
  width: 24,
};
export const traceOptionLimits = {
  threshold: { min: 20, max: 245 },
  simplify: { min: 0.5, max: 8 },
  noise: { min: 0, max: 100 },
  width: { min: 1, max: 200 },
} as const;

export type ImportSettings = TraceOptions & {
  crop: number;
  offsetX: number;
  offsetY: number;
  filenamePattern: string;
};
export const defaultImportSettings: ImportSettings = {
  ...defaultTrace,
  crop: 0,
  offsetX: 0,
  offsetY: 0,
  filenamePattern: defaultFilenamePattern,
};
export const importSettingLimits = {
  ...traceOptionLimits,
  crop: { min: 0, max: 45 },
  offsetX: { min: -100, max: 100 },
  offsetY: { min: -100, max: 100 },
} as const;
export function isImportSettings(value: unknown): value is ImportSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  return (
    Object.entries(importSettingLimits).every(
      ([key, { min, max }]) =>
        typeof saved[key] === "number" &&
        Number.isFinite(saved[key]) &&
        saved[key] >= min &&
        saved[key] <= max,
    ) &&
    (saved.polarity === "dark" || saved.polarity === "light") &&
    typeof saved.filenamePattern === "string" &&
    saved.filenamePattern.length <= filenamePatternMaxLength &&
    Object.keys(saved).length === Object.keys(defaultImportSettings).length
  );
}

// 偏好读取只保留当前配置项，并将数值约束在当前控件范围内。
export function normalizeImportSettings(value: unknown): ImportSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("本地导入配置格式不正确");
  const saved = value as Record<string, unknown>;
  const settings = { ...defaultImportSettings };
  for (const key of Object.keys(
    importSettingLimits,
  ) as (keyof typeof importSettingLimits)[]) {
    const n = saved[key],
      { min, max } = importSettingLimits[key];
    if (typeof n === "number" && Number.isFinite(n))
      settings[key] = Math.min(max, Math.max(min, n));
  }
  if (saved.polarity === "dark" || saved.polarity === "light")
    settings.polarity = saved.polarity;
  if (
    typeof saved.filenamePattern === "string" &&
    saved.filenamePattern.length <= filenamePatternMaxLength
  )
    settings.filenamePattern = saved.filenamePattern;
  return settings;
}
