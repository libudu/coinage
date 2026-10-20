export const defaultFilenamePattern = "{desc*}_{name}";
export const filenamePatternMaxLength = 256;

export type FilenameInfo = {
  name: string;
  description: string;
  error: string;
};

export function extractFilenameInfo(
  filename: string,
  pattern: string,
): FilenameInfo {
  const stem = filename.replace(/\.(png|jpe?g|webp)$/i, "");
  const fallback = (error = ""): FilenameInfo => ({
    name: stem,
    description: "",
    error: error ? `${error}，使用原文件名` : "",
  });
  // 留空表示直接使用文件名；模板只支持字段占位符，其他字符均按字面匹配。
  if (!pattern) return fallback();
  if (pattern.length > filenamePatternMaxLength)
    return fallback(`模板不能超过 ${filenamePatternMaxLength} 个字符`);
  const parts = pattern.split(/(\{[^{}]*\})/u);
  const fields: ("name" | "desc")[] = [];
  let expression = "";
  for (const [index, part] of parts.entries()) {
    if (index % 2 === 0) {
      if (/[{}]/u.test(part))
        return fallback("占位符请使用 {name}、{desc}，可在末尾加 *");
      if (!part && index > 0 && index < parts.length - 1)
        return fallback("占位符之间需要分隔文字或符号");
      expression += part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      continue;
    }
    const token = /^\{(name|desc)(\*)?\}$/u.exec(part);
    if (!token) return fallback("占位符请使用 {name}、{desc}，可在末尾加 *");
    const field = token[1] as "name" | "desc";
    if (fields.includes(field)) return fallback(`{${field}} 只能使用一次`);
    fields.push(field);
    // 默认尽量少取；占位符末尾的星号控制贪婪，与字段名称无关。
    expression += `(.${field === "name" ? "+" : "*"}${token[2] ? "" : "?"})`;
  }
  if (!fields.length) return fallback("模板需包含 {name} 或 {desc}");
  const match = new RegExp(`^${expression}$`, "su").exec(stem);
  if (!match) return fallback("未匹配模板");
  const values = { name: "", desc: "" };
  fields.forEach((field, index) => {
    values[field] = match[index + 1].trim();
  });
  return { name: values.name, description: values.desc, error: "" };
}
