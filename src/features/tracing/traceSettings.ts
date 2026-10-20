import { isImportSettings } from "../../core/importSettings";
import type { ImportSettings } from "../../core/importSettings";

let writes: Promise<unknown> = Promise.resolve();

export async function loadImportSettings(): Promise<ImportSettings> {
  // 关闭后立即重开导入时，先等待上一轮参数写入完成。
  await writes.catch(() => {});
  const response = await fetch("/api/import-settings");
  if (!response.ok) throw new Error("读取导入配置失败");
  const value: unknown = await response.json();
  if (!isImportSettings(value)) throw new Error("导入配置格式不正确");
  return value;
}

export function saveImportSettings(settings: ImportSettings) {
  const save = writes
    .catch(() => {})
    .then(async () => {
      const response = await fetch("/api/import-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        keepalive: true,
      });
      if (!response.ok) throw new Error("保存导入配置失败");
    });
  writes = save;
  return save;
}
