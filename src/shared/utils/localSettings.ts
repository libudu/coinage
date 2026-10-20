export type LocalSettings = {
  showSentenceGrid: boolean;
};

const KEY = "coinage.settings";
const defaults: LocalSettings = { showSentenceGrid: true };

export function loadLocalSettings(
  storage?: Pick<Storage, "getItem">,
): LocalSettings {
  const settings = { ...defaults };
  try {
    const value: unknown = JSON.parse(
      (storage ?? window.localStorage).getItem(KEY) ?? "null",
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      return settings;
    const saved = value as Record<string, unknown>;
    if (typeof saved.showSentenceGrid === "boolean")
      settings.showSentenceGrid = saved.showSentenceGrid;
  } catch {}
  return settings;
}

// 前端偏好独立于手稿；存储不可用时仍允许本次会话正常操作。
export function saveLocalSettings(
  patch: Partial<LocalSettings>,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  try {
    const target = storage ?? window.localStorage;
    target.setItem(
      KEY,
      JSON.stringify({ ...loadLocalSettings(target), ...patch }),
    );
  } catch {}
}
