import { useEffect, useRef, useState } from "react";
import { defaultTrace, makeMask, rasterize } from "./trace";
import type { Raster, TraceOptions } from "./trace";
import type { Glyph } from "../../core/model";
import { Icon } from "../../shared/components/Icon";

export function ImportDialog({
  source,
  onClose,
  onImport,
}: {
  source: { src: string; name: string };
  onClose: () => void;
  onImport: (g: Glyph) => void;
}) {
  const [options, setOptions] = useState<TraceOptions>(defaultTrace),
    [raster, setRaster] = useState<Raster | null>(null),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    worker = useRef<Worker | null>(null);
  useEffect(() => {
    let alive = true;
    rasterize(source.src)
      .then((data) => {
        if (alive) {
          setRaster(data.raster);
          setReference(data.reference);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      worker.current?.terminate();
    };
  }, [source]);
  useEffect(() => {
    if (!raster || !canvas.current) return;
    const ctx = canvas.current.getContext("2d")!,
      mask = makeMask(raster, options),
      data = ctx.createImageData(raster.width, raster.height);
    for (let i = 0; i < mask.length; i++) {
      data.data[i * 4] = mask[i] ? 36 : 251;
      data.data[i * 4 + 1] = mask[i] ? 61 : 251;
      data.data[i * 4 + 2] = mask[i] ? 52 : 248;
      data.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  }, [raster, options]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onClose]);
  const convert = () => {
    if (!raster || busy) return;
    setBusy(true);
    setError("");
    worker.current = new Worker(new URL("./trace.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current.onmessage = (e) => {
      setBusy(false);
      worker.current?.terminate();
      if (e.data.error) setError(e.data.error);
      else onImport({ ...e.data.glyph, reference });
    };
    worker.current.onerror = () => {
      setBusy(false);
      setError("转换失败，请重试。");
      worker.current?.terminate();
    };
    worker.current.postMessage({
      raster,
      options,
      name: source.name.replace(/\.[^.]+$/, ""),
    });
  };
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">导入</span>
            <h2 id="import-title">图片转笔画</h2>
          </div>
          <button
            className="icon-button"
            title="关闭"
            onClick={onClose}
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="import-body">
          <div className="trace-preview">
            <canvas ref={canvas} width="420" height="420" />
            <span>{source.name}</span>
          </div>
          <div className="trace-controls">
            <label className="field-title">前景颜色</label>
            <div className="segmented">
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
            <label className="range-label">
              识别阈值 <b>{options.threshold}</b>
            </label>
            <input
              aria-label="识别阈值"
              type="range"
              min="20"
              max="245"
              value={options.threshold}
              onChange={(e) =>
                setOptions({ ...options, threshold: +e.target.value })
              }
            />
            <label className="range-label">
              路径简化 <b>{options.simplify.toFixed(1)}</b>
            </label>
            <input
              aria-label="路径简化"
              type="range"
              min=".5"
              max="8"
              step=".5"
              value={options.simplify}
              onChange={(e) =>
                setOptions({ ...options, simplify: +e.target.value })
              }
            />
            <label className="range-label">
              去除杂点 <b>{options.noise}</b>
            </label>
            <input
              aria-label="去除杂点"
              type="range"
              min="0"
              max="100"
              value={options.noise}
              onChange={(e) =>
                setOptions({ ...options, noise: +e.target.value })
              }
            />
            <label className="checkbox-label">
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
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button className="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className="button primary"
            onClick={convert}
            disabled={!raster || busy}
          >
            {busy ? <span className="spinner" /> : <Icon name="node" />}
            {busy ? "正在提取笔画" : "转换并编辑"}
          </button>
        </div>
      </section>
    </div>
  );
}
