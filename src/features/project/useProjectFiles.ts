import { useState } from "react";
import { exportSvg } from "../../core/svg";
import { download, safeName } from "../../shared/utils/files";
import { useProjectActions, useProjectApi } from "./useProject";
import { activeGlyph } from "./projectStore";

type Options = {
  toast: (message: string) => void;
};

export function useProjectFiles({
  toast,
}: Options) {
  const api = useProjectApi();
  const { commitTransaction } = useProjectActions();
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
  const exportProject = () => {
    commitTransaction();
    const { project } = api.getState();
    download(
      JSON.stringify(project, null, 2),
      "手稿应急副本.coinage.json",
      "application/json",
    );
    toast("手稿已导出");
  };
  const saveSvg = () => {
    commitTransaction();
    const state = api.getState(), { project } = state, glyph = activeGlyph(state);
    download(
      exportSvg(glyph, project.brush),
      `${safeName(glyph.name)}.svg`,
      "image/svg+xml",
    );
    toast("SVG 已导出");
  };
  const savePng = () => {
    commitTransaction();
    const state = api.getState(), { project } = state, glyph = activeGlyph(state);
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
  };
  return {
    source, setSource, importFile, exportProject, saveSvg, savePng,
  };
}
