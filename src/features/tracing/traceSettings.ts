import { defaultTrace, traceOptionLimits } from "./trace";
import type { TraceOptions } from "./trace";

const KEY = "coinage.trace.v1";

export function loadTraceOptions(storage?: Pick<Storage, "getItem">): TraceOptions {
  const options = { ...defaultTrace };
  try {
    const value: unknown = JSON.parse((storage ?? localStorage).getItem(KEY) || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return options;
    const saved = value as Record<string, unknown>;
    for (const key of Object.keys(traceOptionLimits) as (keyof typeof traceOptionLimits)[]) {
      const n = saved[key], { min, max } = traceOptionLimits[key];
      if (typeof n === "number" && Number.isFinite(n) && n >= min && n <= max)
        options[key] = n;
    }
    if (saved.polarity === "dark" || saved.polarity === "light") options.polarity = saved.polarity;
    if (typeof saved.colorOnly === "boolean") options.colorOnly = saved.colorOnly;
  } catch {}
  return options;
}

export function saveTraceOptions(options: TraceOptions, storage?: Pick<Storage, "setItem">) {
  try {
    (storage ?? localStorage).setItem(KEY, JSON.stringify(options));
  } catch {}
}
