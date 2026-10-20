import "./EditorCanvas.css";
import { memo, useEffect, useRef, useState } from "react";
import { clamp } from "../../core/geometry";
import type { Point } from "../../core/model";
import { Icon } from "../../shared/components/Icon";
import { IconButton } from "../../shared/components/controls";
import type { EditorCanvasProps, Tool } from "./canvasTypes";
import { GlyphArtwork } from "./GlyphArtwork";
import { useCanvasInteraction } from "./useCanvasInteraction";
import { useActiveGlyph, useProject, useProjectActions } from "../project/useProject";

export function EditorCanvas({
  importFile,
  toast,
  modalOpen,
  showShortcuts,
  openContextMenu,
}: EditorCanvasProps) {
  const glyph = useActiveGlyph();
  const nodeIds = useProject((s) => s.session.nodeIds);
  const nodeId = nodeIds.at(-1) ?? null;
  const strokeId = useProject((s) => s.session.strokeId);
  const tool = useProject((s) => s.session.tool);
  const showReference = useProject((s) => s.session.showReference);
  const brush = useProject((s) => s.project.brush);
  const { setTool, select } = useProjectActions();
  const [grid, setGrid] = useState(true),
    [nodesVisible, setNodesVisible] = useState(true),
    [preview, setPreview] = useState(false),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [fit, setFit] = useState(0.8),
    [space, setSpace] = useState(false),
    [dragOver, setDragOver] = useState(false);
  const stage = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 700 });
  const stroke = glyph.strokes.find((s) => s.id === strokeId),
    scale = fit * zoom;
  const interaction = useCanvasInteraction({
    toast,
    space,
    preview,
    pan,
    setPan,
    stage,
    svg,
  });
  const { start, move, end, canvasDown, drag } = interaction;
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  useEffect(() => {
    reset();
  }, [glyph.id]);
  useEffect(() => {
    setPreview(false);
    if (tool !== "hand") setNodesVisible(true);
  }, [tool]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
      setFit(
        Math.max(
          0.2,
          Math.min(
            (entry.contentRect.width -
              (entry.contentRect.width < 500 ? 88 : 130)) /
              640,
            (entry.contentRect.height - 145) / 640,
            1.25,
          ),
        ),
      );
    });
    observer.observe(stage.current);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey)
        setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.08 : 0.92), 0.25, 4));
      else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    };
    const el = stage.current;
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        modalOpen ||
        (e.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable]",
        ) ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpace(true);
      }
      if (e.key === "Escape") {
        interaction.cancelDrag();
        interaction.finishPen();
        setTool("select");
        setPreview(false);
      }
      const tools: Record<string, Tool> = {
        v: "select",
        p: "pen",
        b: "branch",
        h: "hand",
      };
      if (tools[e.key.toLowerCase()]) setTool(tools[e.key.toLowerCase()]);
      if (e.key.toLowerCase() === "g") setGrid((v) => !v);
      if (e.key === "Tab") {
        e.preventDefault();
        setPreview((v) => !v);
      }
      if (e.key === "0") reset();
      if (e.key === "+" || e.key === "=")
        setZoom((z) => clamp(z * 1.2, 0.25, 4));
      if (e.key === "-") setZoom((z) => clamp(z / 1.2, 0.25, 4));
    };
    const up = (e: KeyboardEvent) => {
        if (e.code === "Space") setSpace(false);
      },
      blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [modalOpen, setTool]);
  const rulerStep = scale > 1.2 ? 40 : scale > 0.6 ? 80 : 160,
    rulerValues = Array.from({ length: 61 }, (_, i) => (i - 20) * rulerStep);
  const rulerX = (viewport.width - 640 * scale) / 2 + 11 + pan.x - 22,
    rulerY = (viewport.height - 640 * scale) / 2 + pan.y - 22;
  return (
    <main className="editor flex flex-col min-w-0 min-h-0 bg-[#f0f2eb]">
      <div className="editor-topbar h-[51px] bg-[#f9faf5] border-b [border-bottom-style:solid] border-b-[var(--border)] flex
        items-center justify-between gap-[10px] py-0 px-[24px] shrink-0 laptop:py-0 laptop:px-[17px] tablet:py-0
        tablet:px-[12px] phone:py-0 phone:px-[10px]">
        <HistoryActions />
        <div className="view-actions flex gap-[5px] items-center [&_.icon-button]:w-[28px] [&_.icon-button]:h-[28px]
          [&_.icon-button>svg]:w-[15px] [&_.icon-button>svg]:h-[15px] tablet:gap-[1px]
          phone:[&_.mini-divider]:hidden phone:[&_.icon-button]:w-[25px]">
          <button
            className={`view-button ${preview ? "active" : ""} gap-[6px] items-center text-[12px] text-[#7a8671] py-[6px] px-[9px]
              rounded-[4px] flex phone:p-[5px] [&.active]:bg-[#e7eddf] [&.active]:text-[#385e3d]`}
            onClick={() => setPreview((v) => !v)}
          >
            <Icon name="eye" size={16} />
            预览
          </button>
          <span className="mini-divider w-[1px] h-[17px] bg-[#dfe5d6] my-0 mx-[5px]" />
          <IconButton
            icon="grid"
            title="网格 G"
            active={grid}
            onClick={() => setGrid((v) => !v)}
          />
          <IconButton
            icon="node"
            title="显示节点"
            active={nodesVisible}
            onClick={() => {
              setNodesVisible((v) => !v);
              setPreview(false);
            }}
          />
          <IconButton
            icon="shortcut"
            title="快捷键"
            onClick={showShortcuts}
          />
        </div>
      </div>
      <div
        ref={stage}
        className={`canvas-stage tool-${tool} ${space ? "space-pan" : ""} ${dragOver ? "drag-over" : ""} relative flex-1
          overflow-hidden min-h-0 touch-none bg-[#f0f2eb]`}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => end(e)}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          if (e.target === e.currentTarget) {
            if (space || tool === "hand" || e.button === 1) start(e, "pan");
            else select(null, null);
          }
        }}
        onContextMenu={(e) => {
          if ((e.target as Element).closest("button, input")) return;
          e.preventDefault();
          if (preview || drag.current) return;
          const target = e.target as Element;
          const targetNode =
            target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
          const targetStroke = targetNode
            ? (stroke?.visible && stroke.nodes.includes(targetNode)
                ? stroke
                : glyph.strokes.find((s) => s.visible && s.nodes.includes(targetNode)))
                ?.id ?? null
            : target.closest("[data-stroke-id]")?.getAttribute("data-stroke-id") ?? null;
          if (!targetNode && !targetStroke) return;
          openContextMenu({ x: e.clientX, y: e.clientY }, targetNode, targetStroke);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0]);
        }}
      >
        <div
          className="ruler ruler-horizontal absolute z-[5] pointer-events-none text-[#a9b19d] bg-[#f2f4ed] flex justify-around
            overflow-hidden h-[22px] left-[22px] right-0 top-0 border-b [border-bottom-style:solid] border-b-[#e3e7db]
            items-start pt-[3px] [font:12px_ui-monospace,monospace]"
          aria-hidden="true"
          style={{
            backgroundPositionX: rulerX,
            backgroundSize: `${(rulerStep * scale) / 8}px 4px`,
            backgroundImage:
              "linear-gradient(90deg, #dce1d4 1px, transparent 1px)",
          }}
        >
          {rulerValues.map((value) => (
            <span
              key={value}
              style={{ position: "absolute", left: rulerX + value * scale }}
            >
              {value}
            </span>
          ))}
        </div>
        <div
          className="ruler ruler-vertical absolute z-[5] pointer-events-none text-[#a9b19d] bg-[#f2f4ed] flex justify-around
            overflow-hidden w-[22px] top-[22px] bottom-0 left-0 border-r [border-right-style:solid] border-r-[#e3e7db]
            flex-col items-center [font:12px_ui-monospace,monospace] [&_span]:[writing-mode:vertical-rl] [&_span]:[transform:rotate(180deg)]"
          aria-hidden="true"
          style={{
            backgroundPositionY: rulerY,
            backgroundSize: `4px ${(rulerStep * scale) / 8}px`,
            backgroundImage:
              "linear-gradient(0deg, #dce1d4 1px, transparent 1px)",
          }}
        >
          {rulerValues.map((value) => (
            <span
              key={value}
              style={{ position: "absolute", top: rulerY + value * scale }}
            >
              {value}
            </span>
          ))}
        </div>
        <span className="ruler-origin absolute top-0 left-0 w-[22px] h-[22px] border-r [border-right-style:solid]
          border-r-[#e3e7db] border-b [border-bottom-style:solid] border-b-[#e3e7db] bg-[#f2f4ed] z-[6]" />
        <div className="canvas-tools absolute top-[47px] left-[38px] z-[10] bg-[#fcfdf8] border [border-style:solid]
          border-[#dfe5d6] p-[5px] rounded-[8px] shadow-[0_3px_8px_#35472806] flex flex-col gap-[6px]
          [&_.icon-button]:w-[33px] [&_.icon-button]:h-[34px] [&_.icon-button]:rounded-[4px]
          [&_.icon-button]:text-[#748369] laptop:left-[30px] tablet:left-[29px] tablet:top-[38px] tablet:p-[3px]
          tablet:gap-[3px] tablet:[&_.icon-button]:w-[28px] tablet:[&_.icon-button]:h-[30px] phone:left-[26px] [&_.icon-button.active]:bg-[#dcecba]! [&_.icon-button.active]:text-[#3f5d2c]!">
          {(
            [
              { id: "select", icon: "cursor", label: "选择 V" },
              { id: "pen", icon: "pen", label: "钢笔 P" },
              {
                id: "branch",
                icon: "branch",
                label: "拉出笔画 B / Alt+拖动节点",
              },
              { id: "hand", icon: "hand", label: "移动画布 H / 空格" },
            ] as const
          ).map((t) => (
            <IconButton
              key={t.id}
              icon={t.icon}
              title={t.label}
              active={tool === t.id}
              onClick={() => setTool(t.id)}
            />
          ))}
        </div>
        <div
          className="artboard-wrap absolute top-[50%] left-[calc(50%_+_11px)] shadow-[0_3px_16px_#48513706]"
          style={{
            width: 640 * scale,
            height: 640 * scale,
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
          }}
        >
          <div className="artboard-label absolute top-[-23px] left-0 right-0 flex justify-between text-[12px] text-[#8d9880]
            pointer-events-none gap-[15px] [&>span:last-child]:[font-family:ui-monospace,_monospace]
            [&>span:last-child]:tracking-[0.5px] [&>span:first-child]:whitespace-nowrap
            [&>span:first-child]:overflow-hidden [&>span:first-child]:text-ellipsis [&>span:last-child]:shrink-0">
            <span>{glyph.name}</span>
            <span>640 × 640</span>
          </div>
          <svg
            ref={svg}
            className={`artboard ${preview ? "is-preview" : ""} w-full h-full border [border-style:solid] border-[#d9dfcf] block overflow-visible touch-none`}
            viewBox="0 0 640 640"
            onPointerDown={canvasDown}
            aria-label="字形编辑画布"
          >
            <GlyphArtwork
              glyph={glyph}
              nodeId={nodeId}
              nodeIds={nodeIds}
              strokeId={strokeId}
              tool={tool}
              showReference={showReference}
              brush={brush}
              scale={scale}
              grid={grid}
              preview={preview}
              nodesVisible={nodesVisible}
              interaction={interaction}
            />
          </svg>
          <div className="artboard-corner corner-tl absolute w-[7px] h-[7px] pointer-events-none border-[#b8c3a7] border-solid top-0
            left-0 [border-width:1px_0_0_1px]" />
          <div className="artboard-corner corner-br absolute w-[7px] h-[7px] pointer-events-none border-[#b8c3a7] border-solid
            bottom-0 right-0 [border-width:0_1px_1px_0]" />
        </div>
        {dragOver && (
          <div className="drop-message absolute inset-[24px] z-[15] bg-[#eef5e5ee] border-[2px] [border-style:dashed]
            border-[#91ac6e] rounded-[10px] flex items-center justify-center flex-col gap-[15px] text-[#42633a]
            pointer-events-none text-[15px]">
            <Icon name="upload" size={32} />
            <span>松开以导入图片</span>
          </div>
        )}
        <div className="canvas-bottom absolute bottom-[23px] left-[43px] right-[24px] flex items-center justify-end
          pointer-events-none tablet:left-[34px] tablet:right-[14px] phone:left-[29px] phone:right-[10px]">
          <div className="zoom-control flex items-center bg-[#fcfdf8] border [border-style:solid] border-[#dfe5d6] rounded-[7px]
            py-[3px] px-[4px] pointer-events-auto shadow-[0_2px_5px_#43502e03] [&_.icon-button]:w-[28px]
            [&_.icon-button]:h-[27px] [&_.icon-button>svg]:w-[14px] [&_.icon-button>svg]:h-[14px] [&>span]:h-[16px]
            [&>span]:w-[1px] [&>span]:bg-[#e3e8db] [&>span]:my-0 [&>span]:mx-[4px] tablet:p-[2px]
            tablet:[&_.icon-button]:w-[23px]">
            <IconButton
              icon="minus"
              title="缩小"
              onClick={() => setZoom((z) => clamp(z / 1.2, 0.25, 4))}
            />
            <button className="zoom-value text-[#77866b] min-w-[43px] h-[26px] tablet:min-w-[35px] [font:12px_ui-monospace,monospace]" onClick={reset}>
              {Math.round(zoom * 100)}%
            </button>
            <IconButton
              icon="plus"
              title="放大"
              onClick={() => setZoom((z) => clamp(z * 1.2, 0.25, 4))}
            />
            <span />
            <IconButton icon="fit" title="适应画布 0" onClick={reset} />
          </div>
        </div>
      </div>
    </main>
  );
}

const HistoryActions = memo(function HistoryActions() {
  const canUndo = useProject((s) => s.past.length > 0 || !!s.transaction && s.project !== s.transaction.before);
  const canRedo = useProject((s) => s.future.length > 0 && (!s.transaction || s.project === s.transaction.before));
  const saved = useProject((s) => s.saved);
  const saveError = useProject((s) => s.saveError);
  const { undo, redo } = useProjectActions();
  return (
    <div className="history-actions flex items-center min-w-0 gap-[3px] [&_.icon-button]:w-[28px] [&_.icon-button]:h-[28px]
          tablet:[&_.icon-button]:w-[25px] compact:gap-[1px]">
          <IconButton
            icon="undo"
            title="撤销 Ctrl+Z"
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            icon="redo"
            title="重做 Ctrl+Shift+Z"
            onClick={redo}
            disabled={!canRedo}
          />
          <div
            className={`save-state ${saved === "error" ? "error" : ""} flex items-center min-w-0 gap-[7px] ml-[10px]
              text-[#8b9386] text-[12px] whitespace-nowrap compact:hidden [&.error]:text-[#a04c32]
              [&.error_.save-dot]:bg-[#b76548]`}
            role="status"
          >
            <span className="save-dot inline-block w-[5px] h-[5px] rounded-[50%] bg-[#8eab70] shrink-0" />
            <span className="truncate">
              {saved === "saved"
                ? "已保存到本机"
                : saved === "saving"
                  ? "保存中"
                  : saveError || "本地保存失败，请导出手稿"}
            </span>
          </div>
        </div>
  );
});
