import { useState } from "react";
import { exportSvg } from "../../core/svg";
import { isProject } from "../../core/validation";
import { migrateProjectBrush } from "../../core/brush";
import type { Glyph } from "../../core/model";
import { download, safeName } from "../../shared/utils/files";
import type { useProject } from "./useProject";

type Options = {
  doc: ReturnType<typeof useProject>;
  glyph: Glyph;
  clearSelection: () => void;
  closeMenu: () => void;
  toast: (message: string) => void;
};

export function useProjectFiles({
  doc,
  glyph,
  clearSelection,
  closeMenu,
  toast,
}: Options) {
  const { project } = doc;
  const [source, setSource] = useState<{ src: string; name: string } | null>(null);
  const importFile = (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast("请选择 PNG、JPG 或 WebP 图片");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast("图片不能超过 20 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setSource({ src: reader.result as string, name: file.name });
    reader.onerror = () => toast("图片读取失败");
    reader.readAsDataURL(file);
  };
  const importProject = async (file: File) => {
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error();
      const value: unknown = JSON.parse(await file.text());
      if (!isProject(value)) throw new Error();
      doc.replace(migrateProjectBrush(value));
      clearSelection();
      toast("手稿已打开");
    } catch {
      toast("请选择有效的造字手稿 JSON 文件");
    }
  };
  const exportProject = () => {
    download(
      JSON.stringify(project, null, 2),
      `${safeName(project.name)}.coinage.json`,
      "application/json",
    );
    closeMenu();
    toast("手稿已导出");
  };
  const saveSvg = () => {
    download(
      exportSvg(glyph, project.brush),
      `${safeName(glyph.name)}.svg`,
      "image/svg+xml",
    );
    closeMenu();
    toast("SVG 已导出");
  };
  const savePng = () => {
    const url = URL.createObjectURL(
        new Blob([exportSvg(glyph, project.brush)], { type: "image/svg+xml" }),
      ),
      img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 1280;
      c.getContext("2d")!.drawImage(img, 0, 0, 1280, 1280);
      c.toBlob((blob) => {
        if (blob) {
          const a = document.createElement("a"),
            png = URL.createObjectURL(blob);
          a.href = png;
          a.download = `${safeName(glyph.name)}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(png), 1000);
        }
      });
      URL.revokeObjectURL(url);
      toast("PNG 已导出");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast("PNG 导出失败");
    };
    img.src = url;
    closeMenu();
  };
  return {
    source, setSource, importFile, importProject, exportProject, saveSvg, savePng,
  };
}
