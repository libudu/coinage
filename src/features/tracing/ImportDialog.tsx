import { RangeInput } from "../../shared/components/RangeInput";
import { buttonStateClasses, segmentedStateClasses } from "../../shared/components/controls";
import { useEffect, useState } from "react";
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
  const [options, setOptions] = useState<TraceOptions>(loadTraceOptions),
    [raster, setRaster] = useState<Raster | null>(null),
    [preview, setPreview] = useState<{
      glyph: Glyph; referenceOffset: Point; options: TraceOptions; raster: Raster;
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
        worker.postMessage({ raster, options, brush, name: source.name.replace(/\.[^.]+$/, "") });
      } catch {
        fail("转换失败，请重试。");
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [raster, options, brush, source.name]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const convert = () => {
    if (!raster || busy || !preview || preview.options !== options || preview.raster !== raster) return;
    onImport({ ...preview.glyph, reference: alignedReference(raster, preview.referenceOffset) });
  };
  return (
    <div
      className="modal-backdrop fixed inset-0 z-[100] bg-[#1f30244f] backdrop-blur-[5px] flex items-center justify-center p-[30px] compact:p-[15px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="import-modal bg-[#fafbf6] border [border-style:solid] border-[#e4e8dc] rounded-[15px]
          shadow-[0_24px_90px_#172b2433] w-[730px] max-h-[calc(100dvh_-_60px)] overflow-auto p-[27px]
          compact:p-[22px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="modal-heading flex items-center justify-between mb-[23px] [&_h2]:text-[20px] [&_h2]:tracking-[1px]
          [&_h2]:font-semibold [&_h2]:mt-[5px] [&_h2]:mx-0 [&_h2]:mb-0">
          <div>
            <span className="eyebrow text-[10px] text-[#8a987d]">导入</span>
            <h2 id="import-title">图片转笔画</h2>
          </div>
          <button
            className="icon-button w-[32px] h-[32px] flex items-center justify-center rounded-[6px] text-[#798273] shrink-0 enabled:hover:bg-[#edf1e6]"
            title="关闭"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="import-body grid grid-cols-[1fr_220px] gap-[27px] compact:grid-cols-[1fr_170px] compact:gap-[20px]
          compact:[&_.trace-preview]:self-center phone:grid-cols-[1fr] phone:gap-[20px]">
          <div className="trace-preview bg-[#fbfbf8] border [border-style:solid] border-[#dfe5d5] rounded-[8px] overflow-hidden flex
            flex-col justify-between [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[340px]
            [&>svg]:object-contain [&>span]:block [&>span]:text-center [&>span]:py-[11px] [&>span]:px-[15px]
            [&>span]:text-[10px] [&>span]:text-[#859575] [&>span]:border-t [&>span]:[border-top-style:solid]
            [&>span]:border-t-[#e6ebde] [&>span]:whitespace-nowrap [&>span]:text-ellipsis [&>span]:overflow-hidden
            [&>span]:max-w-full compact:[&>span]:text-[9px] phone:max-h-[220px] phone:[&>svg]:h-[190px]">
            <svg viewBox="0 0 640 640" width="420" height="420" role="img" aria-label="导入字形预览" aria-busy={busy}>
              {preview && <path d={glyphPath(preview.glyph, brush)} fill={preview.glyph.color} opacity={busy ? 0.4 : 1} />}
            </svg>
            <span>{source.name}</span>
          </div>
          <div className="trace-controls py-[5px] px-0 phone:p-0">
            <label className="field-title block text-[#77856a] text-[10px] mb-[10px]">前景颜色</label>
            <div className={`segmented flex border [border-style:solid] border-[#e2e8d9] rounded-[6px] p-[3px] bg-[#f1f4eb] gap-[3px]
              [&>button]:flex-1 [&>button]:min-w-0 [&>button]:py-[7px] [&>button]:px-[4px] [&>button]:text-[11px]
              [&>button]:rounded-[3px] [&>button]:text-[#87957b] [&>button]:flex [&>button]:justify-center
              [&>button]:items-center [&>button]:gap-[6px] ${segmentedStateClasses}`}>
              <button
                className={options.polarity === "dark" ? "active" : ""}
                onClick={() => setOptions({ ...options, polarity: "dark" })}
              >
                深色
              </button>
              <button
                className={options.polarity === "light" ? "active" : ""}
                onClick={() => setOptions({ ...options, polarity: "light" })}
              >
                浅色
              </button>
            </div>
            <label className="range-label flex justify-between items-center text-[#88967a] text-[11px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[11px] [&>b]:font-medium
              phone:mt-[20px]">
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
            <label className="range-label flex justify-between items-center text-[#88967a] text-[11px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[11px] [&>b]:font-medium
              phone:mt-[20px]">
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
            <label className="range-label flex justify-between items-center text-[#88967a] text-[11px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[11px] [&>b]:font-medium
              phone:mt-[20px]">
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
            <label className="range-label flex justify-between items-center text-[#88967a] text-[11px] mt-[26px] mx-0 mb-[15px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[11px] [&>b]:font-medium
              phone:mt-[20px]">
              笔画粗细 <b>{options.thickness}%</b>
            </label>
            <RangeInput
              aria-label="笔画粗细"
              min={traceOptionLimits.thickness.min}
              max={traceOptionLimits.thickness.max}
              step="5"
              value={options.thickness}
              onChange={(e) => setOptions({ ...options, thickness: +e.target.value })}
            />
            <label className="checkbox-label flex items-center gap-[8px] text-[11px] text-[#81936f] mt-[29px] [&_input]:accent-[#577344]">
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
          <p className="form-error text-[12px] text-[#a84d35] mb-0" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer flex justify-end gap-[10px] pt-[25px] mt-[22px] border-t [border-top-style:solid]
          border-t-[#e4e9dc] [&_.button]:min-w-[80px] phone:pt-[17px] phone:mt-[17px]">
          <button className={`button h-[37px] py-0 px-[14px] inline-flex items-center justify-center gap-[8px] border
            [border-style:solid] border-[#dfe4d7] rounded-[6px] bg-[#fcfdf9] text-[12px] font-[550] whitespace-nowrap ${buttonStateClasses}`} onClick={onClose}>
            取消
          </button>
          <button
            className={`button primary h-[37px] py-0 px-[14px] inline-flex items-center justify-center gap-[8px] border
              [border-style:solid] border-[#dfe4d7] rounded-[6px] bg-[#fcfdf9] text-[12px] font-[550] whitespace-nowrap ${buttonStateClasses}`}
            onClick={convert}
            disabled={!raster || busy || !preview || preview.options !== options || preview.raster !== raster}
          >
            {busy ? <span className="spinner w-[15px] h-[15px] border-[2px] [border-style:solid] border-[#ffffff55] rounded-[50%]
              border-t-white animate-spin [animation-duration:0.7s]" /> : <Icon name="node" />}
            {busy ? "正在提取笔画" : "转换并编辑"}
          </button>
        </div>
      </section>
    </div>
  );
}
