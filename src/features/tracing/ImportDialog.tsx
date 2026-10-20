import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { Button } from "../../shared/components/Button";
import { Modal } from "../../shared/components/Modal";
import { RangeInput } from "../../shared/components/RangeInput";
import { ArtboardGrid } from "../../shared/components/ArtboardGrid";
import { IconButton } from "../../shared/components/controls";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { rasterize, resizeTrace } from "./trace";
import type { Raster } from "./trace";
import {
  defaultTrace,
  defaultImportSettings,
  traceOptionLimits,
  importSettingLimits,
} from "../../core/importSettings";
import type { ImportSettings, TraceOptions } from "../../core/importSettings";
import type { Glyph, Point } from "../../core/model";
import type { BrushDefaults } from "../../core/brush";
import { glyphPath } from "../../core/geometry";
import { createTraceWorker } from "./createTraceWorker";
import { loadImportSettings, saveImportSettings } from "./traceSettings";
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
  const [options, setOptions] = useState<ImportSettings>(() => ({
      ...defaultImportSettings,
    })),
    [settingsReady, setSettingsReady] = useState(false),
    [settingsError, setSettingsError] = useState(""),
    [loadAttempt, setLoadAttempt] = useState(0),
    [saveAttempt, setSaveAttempt] = useState(0),
    [reference, setReference] = useState(""),
    [raster, setRaster] = useState<Raster | null>(null),
    [preview, setPreview] = useState<{
      glyph: Glyph;
      referenceOffset: Point;
      options: TraceOptions;
      raster: Raster;
    } | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const persistedSettings = useRef<ImportSettings | null>(null);
  useEffect(() => {
    let alive = true;
    loadImportSettings()
      .then((settings) => {
        if (!alive) return;
        persistedSettings.current = settings;
        setOptions(settings);
        setSettingsReady(true);
        setSettingsError("");
      })
      .catch(() => {
        if (alive) setSettingsError("读取导入配置失败，请重试");
      });
    return () => {
      alive = false;
    };
  }, [loadAttempt]);
  useEffect(() => {
    if (!settingsReady || options === persistedSettings.current) return;
    let alive = true;
    saveImportSettings(options)
      .then(() => {
        persistedSettings.current = options;
        if (alive) setSettingsError("");
      })
      .catch(() => {
        if (alive) setSettingsError("保存导入配置失败，请重试");
      });
    return () => {
      alive = false;
    };
  }, [options, settingsReady, saveAttempt]);
  const traceOptions = useMemo<TraceOptions>(
    () => ({
      threshold: options.threshold,
      simplify: options.simplify,
      noise: options.noise,
      polarity: options.polarity,
      width: defaultTrace.width,
    }),
    [options.threshold, options.simplify, options.noise, options.polarity],
  );
  const resizedPreview = useMemo(
    () =>
      preview &&
      resizeTrace(preview, preview.raster, options.width, brush, {
        x: options.offsetX,
        y: options.offsetY,
      }),
    [preview, options.width, options.offsetX, options.offsetY, brush],
  );
  useEffect(() => {
    if (!settingsReady) return;
    let alive = true;
    setRaster(null);
    setPreview(null);
    setBusy(true);
    setError("");
    rasterize(source.src, options.crop)
      .then((data) => {
        if (alive) {
          setRaster(data.raster);
          setReference(data.reference);
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
  }, [source, settingsReady, options.crop]);
  useEffect(() => {
    if (!raster) return;
    setBusy(true);
    setError("");
    let worker: Worker | undefined;
    let alive = true;
    const fail = (message: string) => {
      if (!alive) return;
      setBusy(false);
      setPreview(null);
      setError(message);
      worker?.terminate();
    };
    const timer = setTimeout(() => {
      try {
        worker = createTraceWorker();
        worker.onmessage = (e) => {
          if (!alive) return;
          if (e.data.error) fail(e.data.error);
          else {
            setPreview({ ...e.data, options: traceOptions, raster });
            setBusy(false);
            worker?.terminate();
          }
        };
        worker.onerror = () => fail("转换失败，请重试。");
        worker.postMessage({
          raster,
          options: traceOptions,
          brush,
          name: source.name.replace(/\.[^.]+$/, ""),
        });
      } catch {
        fail("转换失败，请重试。");
      }
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [raster, traceOptions, brush, source.name]);
  const convert = () => {
    if (
      !raster ||
      busy ||
      !preview ||
      !resizedPreview ||
      preview.options !== traceOptions ||
      preview.raster !== raster
    )
      return;
    onImport({
      ...resizedPreview.glyph,
      reference: alignedReference(raster, resizedPreview.referenceOffset),
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
            className="trace-preview self-start bg-[#fbfbf8] border [border-style:solid] border-[#dfe5d5] rounded-[8px] overflow-hidden flex
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
              <rect width="640" height="640" fill="#fffefa" />
              <ArtboardGrid />
              {resizedPreview && reference && (
                <image
                  href={reference}
                  width="640"
                  height="640"
                  x={
                    (resizedPreview.referenceOffset.x * 640) /
                    Math.max(preview!.raster.width, preview!.raster.height)
                  }
                  y={
                    (resizedPreview.referenceOffset.y * 640) /
                    Math.max(preview!.raster.width, preview!.raster.height)
                  }
                  opacity=".2"
                  pointerEvents="none"
                />
              )}
              {resizedPreview && (
                <path
                  data-trace-artwork=""
                  d={glyphPath(resizedPreview.glyph, brush)}
                  fill={resizedPreview.glyph.color}
                  opacity={busy ? 0.4 : 1}
                />
              )}
            </svg>
            <span>{source.name}</span>
          </div>
          <fieldset
            disabled={!settingsReady}
            className="trace-controls m-0 min-w-0 border-0 py-[5px] pl-0 pr-[5px] max-h-[56dvh] overflow-y-auto phone:max-h-none phone:p-0"
          >
            <div className="flex items-center justify-between gap-[8px] mb-[7px]">
              <span className="field-title text-[#77856a] text-[12px]">
                前景颜色
              </span>
              <Button
                variant="bare"
                className="shrink-0 text-[11px] text-[#5a7446] underline underline-offset-2 hover:text-[#38572c]"
                onClick={() => setOptions({ ...defaultImportSettings })}
              >
                恢复默认
              </Button>
            </div>
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
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[16px] mx-0 mb-[7px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[14px]"
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
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[16px] mx-0 mb-[7px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[14px]"
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
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[16px] mx-0 mb-[7px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[14px]"
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
              className="range-label flex justify-between items-center text-[#88967a] text-[12px] mt-[16px] mx-0 mb-[7px]
              [&>b]:[font-family:ui-monospace,_monospace] [&>b]:text-[#5a7446] [&>b]:text-[12px] [&>b]:font-medium
              phone:mt-[14px]"
            >
              笔画粗细 <b>{options.width} px</b>
            </label>
            <RangeInput
              aria-label="笔画粗细"
              min={traceOptionLimits.width.min}
              max={traceOptionLimits.width.max}
              step="1"
              value={options.width}
              onChange={(e) =>
                setOptions({ ...options, width: +e.target.value })
              }
            />
            <div className="mt-[16px] border-t border-[#e4e9dc] pt-[12px]">
              <div className="flex items-center justify-between text-[12px] text-[#88967a]">
                <span>边缘裁剪</span>
                <span className="font-mono text-[#5a7446]">
                  {options.crop}%
                </span>
              </div>
              <RangeInput
                variant="row"
                aria-label="边缘裁剪"
                min={importSettingLimits.crop.min}
                max={importSettingLimits.crop.max}
                step={1}
                value={options.crop}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    crop: Number(event.target.value),
                  }))
                }
              />
              <div className="mb-[6px] mt-[10px] text-[12px] text-[#77856a]">
                整体偏移
              </div>
              {(
                [
                  ["offsetX", "X"],
                  ["offsetY", "Y"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="mb-[6px]">
                  <div className="flex items-center justify-between text-[12px] text-[#88967a]">
                    <span>{label}</span>
                    <span className="font-mono text-[#5a7446]">
                      {options[key]} px
                    </span>
                  </div>
                  <RangeInput
                    variant="row"
                    aria-label={`${label} 偏移`}
                    min={importSettingLimits[key].min}
                    max={importSettingLimits[key].max}
                    step={1}
                    value={options[key]}
                    onChange={(event) =>
                      setOptions((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </div>
        {settingsError && (
          <div
            role="alert"
            className="mt-[15px] flex items-center gap-[10px] text-[12px] text-[#a84d35]"
          >
            <span>{settingsError}</span>
            <Button
              variant="bare"
              className="underline"
              onClick={() =>
                settingsReady
                  ? setSaveAttempt((n) => n + 1)
                  : setLoadAttempt((n) => n + 1)
              }
            >
              重试
            </Button>
          </div>
        )}
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
              preview.options !== traceOptions ||
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
