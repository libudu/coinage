import {
  defaultImportSettings,
  isImportSettings,
} from "../../core/importSettings";
import type { ImportSettings } from "../../core/importSettings";
import { withBrowserRecord } from "../../shared/utils/browserDatabase";

export function loadBrowserImportSettings(
  factory?: IDBFactory,
): Promise<ImportSettings> {
  return withBrowserRecord(
    "import-settings",
    "readonly",
    (value) => {
      if (value === undefined) return { ...defaultImportSettings };
      if (!isImportSettings(value)) throw new Error("浏览器导入配置格式不正确");
      return value;
    },
    factory,
  );
}

export function saveBrowserImportSettings(
  settings: ImportSettings,
  factory?: IDBFactory,
) {
  return withBrowserRecord(
    "import-settings",
    "readwrite",
    (_value, store) => {
      if (!isImportSettings(settings)) throw new Error("导入配置格式不正确");
      store.put(settings, "import-settings");
    },
    factory,
  );
}
