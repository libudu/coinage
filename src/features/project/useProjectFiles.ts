import { useToast } from "../../shared/components/Toast";
import { useState } from "react";
import { exportSvg } from "../../core/svg";
import { download, safeName } from "../../shared/utils/files";
import { useProjectActions, useProjectApi } from "./useProject";
import { activeGlyph } from "./projectStore";

export function useProjectFiles() {
  const toast = useToast();
  const api = useProjectApi();
  const { commitTransaction } = useProjectActions();
  const [source, setSource] = useState<{ src: string; name: string } | null>(
    null,
  );
  const importFile = (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast("请选择 PNG、JPG 或 WebP 图片");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast("图片不能超过 20 MB", { tone: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setSource({ src: reader.result as string, name: file.name });
    reader.onerror = () => toast("图片读取失败", { tone: "error" });
    reader.readAsDataURL(file);
  };
  const exportProject = () => {
    commitTransaction();
    const { project } = api.getState();
    download(
      JSON.stringify(project, null, 2),
      "手稿应急副本.coinage.json",
      "application/json",
    );
    toast("手稿已导出", { tone: "success" });
  };
  const saveSvg = () => {
    commitTransaction();
    const state = api.getState(),
      { project } = state,
      glyph = activeGlyph(state);
    download(
      exportSvg(glyph, project.brush, project.style?.color),
      `${safeName(glyph.name)}.svg`,
      "image/svg+xml",
    );
    toast("SVG 已导出", { tone: "success" });
  };
  const savePng = () => {
    commitTransaction();
    const state = api.getState(),
      { project } = state,
      glyph = activeGlyph(state);
    const url = URL.createObjectURL(
        new Blob([exportSvg(glyph, project.brush, project.style?.color)], {
          type: "image/svg+xml",
        }),
      ),
      img = new Image();
    const fail = () => toast("PNG 导出失败", { tone: "error" });
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1280;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建画布");
        context.drawImage(img, 0, 0, 1280, 1280);
        canvas.toBlob((blob) => {
          if (!blob) {
            fail();
            return;
          }
          try {
            const png = URL.createObjectURL(blob);
            try {
              const anchor = document.createElement("a");
              anchor.href = png;
              anchor.download = `${safeName(glyph.name)}.png`;
              anchor.click();
              toast("PNG 已导出", { tone: "success" });
            } finally {
              setTimeout(() => URL.revokeObjectURL(png), 1000);
            }
          } catch {
            fail();
          }
        }, "image/png");
      } catch {
        fail();
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fail();
    };
    img.src = url;
  };
  return {
    source,
    setSource,
    importFile,
    exportProject,
    saveSvg,
    savePng,
  };
}
