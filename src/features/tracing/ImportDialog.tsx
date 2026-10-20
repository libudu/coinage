import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { Button } from "../../shared/components/Button";
import { Modal } from "../../shared/components/Modal";
import { RangeInput } from "../../shared/components/RangeInput";
import { IconButton } from "../../shared/components/controls";
import { useEffect, useId, useState } from "react";
import { rasterize, traceOptionLimits } from "./trace";
import type { Raster, TraceOptions } from "./trace";
import type { Glyph, Point } from "../../core/model";
import type { BrushDefaults } from "../../core/brush";
import { glyphPath } from "../../core/geometry";
import { createTraceWorker } from "./createTraceWorker";
import { loadTraceOptions, saveTraceOptions } from "./traceSettings";
import { Icon } from "../../shared/components/Icon";

function alignedReference(raster: Raster, offset: Point) {
  const source = document.createElement("canvas"),
    target = document.createElement("canvas");
  source.width = target.width = raster.width;
  source.height = target.height = raster.height;
  const ctx = source.getContext("2d")!,
    data = ctx.createImageData(raster.width, raster.height);
  data.data.set(raster.pixels);
  ctx.putImageData(data, 0, 0);
  target.getContext("2d")!.drawImage(source, offset.x, offset.y);
  return target.toDataURL("image/png");
}

export function ImportDialog({
  source,
  brush,
  onClose,
  onImport,
}: {
  source: { src: string; name: string };
  brush?: BrushDefaults;
  onClose: () => void;
  onImport: (g: Glyph) => void;
}) {
  const titleId = useId();
  const [options, setOptions] = useState<TraceOptions>(loadTraceOptions),
    [raster, setRaster] = useState<Raster | null>(null),
    [preview, setPreview] = useState<{
      glyph: Glyph;
      referenceOffset: Point;
      options: TraceOptions;
      raster: Raster;
    } | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => saveTraceOptions(options), [options]);
  useEffect(() => {
    let alive = true;
    setRaster(null);
    setPreview(null);
    setBusy(true);
    setError("");
    rasterize(source.src)
      .then((data) => {
        if (alive) {
          setRaster(data.raster);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [source]);
  useEffect(() => {
    if (!raster) return;
    setBusy(true);
    setError("");
    let worker: Worker | undefined;
    const fail = (message: string) => {
      setBusy(false);
      setPreview(null);
      setError(message);
      worker?.terminate();
    };
    const timer = setTimeout(() => {
      try {
        worker = createTraceWorker();
        worker.onmessage = (e) => {
          if (e.data.error) fail(e.data.error);
          else {
            setPreview({ ...e.data, options, raster });
            setBusy(false);
            worker?.terminate();
          }
        };
        worker.onerror = () => fail("转换失败，请重试。");
        worker.postMessage({
          raster,
          options,
          brush,
          name: source.name.replace(/\.[^.]+$/, ""),
        });
      } catch {
        fail("转换失败，请重试。");
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [raster, options, brush, source.name]);
  const convert = () => {
    if (
      !raster ||
      busy ||
      !preview ||
      preview.options !== options ||
      preview.raster !== raster
    )
      return;
    onImport({
      ...preview.glyph,
      reference: alignedReference(raster, preview.referenceOffset),
    });
  };
  return (
    <Modal
      gutter="md"
      onClose={onClose}
      aria-labelledby={titleId}
      className="import-modal w-[730px]"
    >
      <div className="p-[27px] compact:p-[22px]">
        <div
          className="modal-heading flex items-center justify-between mb-[23px] [&_h2]:text-[20px] [&_h2]:tracking-[1px]
          [&_h2]:font-semibold [&_h2]:mt-[5px] [&_h2]:mx-0 [&_h2]:mb-0"
        >
          <div>
            <span className="eyebrow text-[12px] text-[#8a987d]">导入</span>
            <h2 id={titleId}>图片转笔画</h2>
          </div>
          <IconButton icon="close" title="关闭" onClick={onClose} />
        </div>
        <div
          className="import-body grid grid-cols-[1fr_220px] gap-[27px] compact:grid-cols-[1fr_170px] compact:gap-[20px]
          compact:[&_.trace-preview]:self-center phone:grid-cols-[1fr] phone:gap-[20px]"
        >
          <div
            className="trace-preview bg-[#fbfbf8] border [border-style:solid] border-[#dfe5d5] rounded-[8px] overflow-hidden flex
            flex-col justify-between [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[340px]
            [&>svg]:object-contain [&>span]:block [&>span]:text-center [&>span]:py-[11px] [&>span]:px-[15px]
            [&>span]:text-[12px] [&>span]:text-[#859575] [&>span]:border-t [&>span]:[border-top-style:solid]
            [&>span]:border-t-[#e6ebde] [&>span]:whitespace-nowrap [&>span]:text-ellipsis [&>span]:overflow-hidden
            [&>span]:max-w-full phone:max-h-[220px] phone:[&>svg]:h-[190px]"
          >
            <svg
              viewBox="0 0 640 640"
              width="420"
              height="420"
              role="img"
              aria-label="导入字形预览"
              aria-busy={busy}
            >
              {preview && (
                <path
                  d={glyphPath(preview.glyph, brush)}
                  fill={preview.glyph.color}
                  opacity={busy ? 0.4 : 1}
                />
              )}
            </svg>
            <span>{source.name}</span>
          </div>
          <div className="trace-controls py-[5px] px-0 phone:p-0">
            <label className="field-title block text-[#77856a] text-[12px] mb-[10px]">
              前景颜色
            </label>
            <SegmentedControl
              label="前景颜色"
              value={options.polarity}
              options={[
                { value: "dark", label: "深色" },
                { value: "light", label: "浅色" },
              ]}
              onValueChange={(polarity) => setOptions({ ...options, polarity })}
            />
            <label
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[20px]"
            >
              识别阈值 <b>{options.threshold}</b>
            </label>
            <RangeInput
              aria-label="识别阈值"
              min={traceOptionLimits.threshold.min}
              max={traceOptionLimits.threshold.max}
              value={options.threshold}
              onChange={(e) =>
                setOptions({ ...options, threshold: +e.target.value })
              }
            />
            <label
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[20px]"
            >
              路径简化 <b>{options.simplify.toFixed(1)}</b>
            </label>
            <RangeInput
              aria-label="路径简化"
              min={traceOptionLimits.simplify.min}
              max={traceOptionLimits.simplify.max}
              step=".5"
              value={options.simplify}
              onChange={(e) =>
                setOptions({ ...options, simplify: +e.target.value })
              }
            />
            <label
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[20px]"
            >
              去除杂点 <b>{options.noise}</b>
            </label>
            <RangeInput
              aria-label="去除杂点"
              min={traceOptionLimits.noise.min}
              max={traceOptionLimits.noise.max}
              value={options.noise}
              onChange={(e) =>
                setOptions({ ...options, noise: +e.target.value })
              }
            />
            <label
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[20px]"
            >
              笔画粗细 <b>{options.thickness}%</b>
            </label>
            <RangeInput
              aria-label="笔画粗细"
              min={traceOptionLimits.thickness.min}
              max={traceOptionLimits.thickness.max}
              step="5"
              value={options.thickness}
              onChange={(e) =>
                setOptions({ ...options, thickness: +e.target.value })
              }
            />
            <label className="checkbox-label flex items-center gap-[8px] text-[12px] text-[#81936f] mt-[29px] [&_input]:accent-[#577344]">
              <input
                type="checkbox"
                checked={options.colorOnly}
                onChange={(e) =>
                  setOptions({ ...options, colorOnly: e.target.checked })
                }
              />
              只提取彩色笔画
            </label>
          </div>
        </div>
        {error && (
          <p
            className="form-error text-[12px] text-[#a84d35] mb-0"
            role="alert"
          >
            {error}
          </p>
        )}
        <div
          className="modal-footer flex justify-end gap-[10px] pt-[25px] mt-[22px] border-t [border-top-style:solid]
          border-t-[#e4e9dc] [&_.button]:min-w-[80px] phone:pt-[17px] phone:mt-[17px]"
        >
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            onClick={convert}
            disabled={
              !raster ||
              busy ||
              !preview ||
              preview.options !== options ||
              preview.raster !== raster
            }
          >
            {busy ? (
              <span
                className="spinner w-[15px] h-[15px] border-[2px] [border-style:solid] border-[#ffffff55] rounded-[50%]
              border-t-white animate-spin [animation-duration:0.7s]"
              />
            ) : (
              <Icon name="node" />
            )}
            {busy ? "正在提取笔画" : "转换并编辑"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
