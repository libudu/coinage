import { useCallback, useEffect, useRef, useState } from "react";
import {
  clamp,
  centerPath,
  emptyGlyph,
  exportSvg,
  isProject,
  uid,
} from "../core/model";
import { migrateProjectBrush } from "../core/brush";
import type { Point } from "../core/model";
import { Icon } from "../shared/components/Icon";
import { GlyphPreview } from "../features/editor/GlyphPreview";
import { IconButton } from "../shared/components/controls";
import { download, safeName } from "../shared/utils/files";
import { ImportDialog } from "../features/tracing/ImportDialog";
import { EditorCanvas } from "../features/editor/EditorCanvas";
import type { Tool } from "../features/editor/EditorCanvas";
import { EditorContextMenu } from "../features/editor/EditorContextMenu";
import { Properties } from "../features/editor/Properties";
import { useProject } from "../features/project/useProject";

export default function App() {
  const [contextMenu, setContextMenu] = useState<Point | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const doc = useProject(),
    { project, update } = doc,
    glyph =
      project.glyphs.find((g) => g.id === project.activeId) ||
      project.glyphs[0];
  const [nodeId, setNodeId] = useState<string | null>(
      glyph.strokes[0]?.nodes[1] || null,
    ),
    [strokeId, setStrokeId] = useState<string | null>(
      glyph.strokes[0]?.id || null,
    ),
    [tool, setTool] = useState<Tool>("select");
  const [source, setSource] = useState<{ src: string; name: string } | null>(
      null,
    ),
    [toast, setToast] = useState(""),
    [menu, setMenu] = useState<"export" | "project" | null>(null),
    [shortcuts, setShortcuts] = useState(false),
    [showReference, setShowReference] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const node = nodeId ? glyph.nodes[nodeId] : undefined,
    stroke = glyph.strokes.find((s) => s.id === strokeId);
  const select = useCallback((n: string | null, s?: string | null) => {
    setContextMenu(null);
    setNodeId(n);
    if (s !== undefined) setStrokeId(s);
  }, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = (position: Point, n: string | null, s: string | null) => {
    select(n, s);
    setMenu(null);
    setContextMenu(position);
  };
  const upload = () => fileInput.current?.click();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);
  const switchGlyph = (id: string) => {
    update((_, p) => {
      p.activeId = id;
    }, false);
    select(null, null);
    setShowReference(false);
  };
  const addGlyph = () => {
    const g = emptyGlyph(
      `字形 ${String(project.glyphs.length + 1).padStart(2, "0")}`,
    );
    update((_, p) => {
      p.glyphs.push(g);
      p.activeId = g.id;
    });
    select(null, null);
    setTool("pen");
    setShowReference(false);
  };
  const importFile = (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setToast("请选择 PNG、JPG 或 WebP 图片");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setToast("图片不能超过 20 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setSource({ src: reader.result as string, name: file.name });
    reader.onerror = () => setToast("图片读取失败");
    reader.readAsDataURL(file);
  };
  const importProject = async (file: File) => {
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error();
      const value: unknown = JSON.parse(await file.text());
      if (!isProject(value)) throw new Error();
      doc.replace(migrateProjectBrush(value));
      select(null, null);
      setToast("手稿已打开");
    } catch {
      setToast("请选择有效的造字手稿 JSON 文件");
    }
  };
  const exportProject = () => {
    download(
      JSON.stringify(project, null, 2),
      `${safeName(project.name)}.coinage.json`,
      "application/json",
    );
    setMenu(null);
    setToast("手稿已导出");
  };
  const saveSvg = () => {
    download(exportSvg(glyph, project.brush), `${safeName(glyph.name)}.svg`, "image/svg+xml");
    setMenu(null);
    setToast("SVG 已导出");
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
      setToast("PNG 已导出");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setToast("PNG 导出失败");
    };
    img.src = url;
    setMenu(null);
  };
  const remove = () => {
    if (
      stroke?.locked ||
      (node && glyph.strokes.some((s) => s.locked && s.nodes.includes(node.id)))
    ) {
      setToast("请先解锁笔画");
      return;
    }
    if (node) {
      update((g) => {
        delete g.nodes[node.id];
        g.strokes = g.strokes
          .map((s) => ({ ...s, nodes: s.nodes.filter((id) => id !== node.id) }))
          .filter((s) => s.nodes.length >= 2);
        const used = new Set(g.strokes.flatMap((s) => s.nodes));
        Object.keys(g.nodes).forEach((id) => {
          if (!used.has(id)) delete g.nodes[id];
        });
      });
      select(null);
    } else if (stroke) {
      update((g) => {
        g.strokes = g.strokes.filter((s) => s.id !== stroke.id);
        const used = new Set(g.strokes.flatMap((s) => s.nodes));
        Object.keys(g.nodes).forEach((id) => {
          if (!used.has(id)) delete g.nodes[id];
        });
      });
      select(null, null);
    } else {
      update((_, p) => {
        p.glyphs = p.glyphs.filter((g) => g.id !== glyph.id);
        if (!p.glyphs.length) p.glyphs.push(emptyGlyph());
        p.activeId = p.glyphs[0].id;
      });
      select(null, null);
    }
    setToast("已删除，可撤销");
  };
  const duplicate = () => {
    if (!stroke) return;
    const sid = uid();
    update((g) => {
      const mapping = new Map<string, string>(),
        ids = stroke.nodes.map((old) => {
          if (mapping.has(old)) return mapping.get(old)!;
          const id = uid();
          mapping.set(old, id);
          const n = g.nodes[old];
          g.nodes[id] = {
            ...n,
            id,
            x: clamp(n.x + 24, 0, 640),
            y: clamp(n.y + 24, 0, 640),
          };
          return id;
        });
      g.strokes.push({
        ...stroke,
        id: sid,
        name: `${stroke.name} 副本`,
        nodes: ids,
        locked: false,
      });
    });
    select(null, sid);
  };
  const undo = () => {
      doc.undo();
      select(null, null);
    },
    redo = () => {
      doc.redo();
      select(null, null);
    };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (source) return;
      if (shortcuts) {
        if (e.key === "Escape") setShortcuts(false);
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          exportProject();
        }
        if (e.key.toLowerCase() === "d") {
          e.preventDefault();
          duplicate();
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (node || stroke) remove();
      }
      if (e.key === "Escape") {
        select(null, null);
        setMenu(null);
      }
      if (e.key === "?") setShortcuts(true);
      if (
        node &&
        !glyph.strokes.some((s) => s.locked && s.nodes.includes(node.id)) &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        update((g) => {
          const n = g.nodes[node.id];
          n.x = clamp(
            n.x + (e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0),
            0,
            640,
          );
          n.y = clamp(
            n.y + (e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0),
            0,
            640,
          );
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  return (
    <div className={`studio ${inspectorOpen ? "inspector-open" : ""}`}>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) importFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void importProject(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 30 30">
              <path d="M5 23V11L15 4l10 7v12M5 16h20M15 4v22M8 25l7-9 7 9" />
            </svg>
          </span>
          <span>
            造字<span className="brand-latin">COINAGE</span>
          </span>
        </div>
        <div className="document-title">
          <span className="header-divider" />
          <input
            aria-label="手稿名称"
            value={project.name}
            onChange={(e) =>
              update((_, p) => {
                p.name = e.target.value;
              }, false)
            }
            onBlur={() => {
              if (!project.name.trim())
                update((_, p) => {
                  p.name = "未命名手稿";
                });
            }}
          />
          <div
            className="dropdown-wrap"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <IconButton
              icon="chevron"
              title="手稿菜单"
              onClick={() => setMenu(menu === "project" ? null : "project")}
            />
            {menu === "project" && (
              <div className="dropdown project-dropdown">
                <button
                  onClick={() => {
                    projectInput.current?.click();
                    setMenu(null);
                  }}
                >
                  <Icon name="folder" />
                  打开手稿
                </button>
                <button onClick={exportProject}>
                  <Icon name="save" />
                  保存手稿文件
                </button>
                <button
                  onClick={() => {
                    setSource({ src: "/reference.png", name: "示例字形.png" });
                    setMenu(null);
                  }}
                >
                  <Icon name="image" />
                  导入示例图片
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={`save-state ${doc.saved === "error" ? "error" : ""}`}>
          <span className="save-dot" />
          {doc.saved === "saved"
            ? "已保存到本机"
            : doc.saved === "saving"
              ? "保存中"
              : "存储空间不足，请导出手稿"}
        </div>
        <div className="header-actions">
          <div className="history-actions">
            <IconButton
              icon="undo"
              title="撤销 Ctrl+Z"
              onClick={undo}
              disabled={!doc.canUndo}
            />
            <IconButton
              icon="redo"
              title="重做 Ctrl+Shift+Z"
              onClick={redo}
              disabled={!doc.canRedo}
            />
          </div>
          <button className="button import-button" onClick={upload}>
            <Icon name="upload" />
            导入图片
          </button>
          <div
            className="split-button dropdown-wrap"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button className="button primary" onClick={saveSvg}>
              <Icon name="download" />
              导出 SVG
            </button>
            <button
              className="split-arrow"
              aria-label="更多导出格式"
              onClick={() => setMenu(menu === "export" ? null : "export")}
            >
              <Icon name="chevron" size={16} />
            </button>
            {menu === "export" && (
              <div className="dropdown export-dropdown">
                <button onClick={saveSvg}>
                  <Icon name="node" />
                  SVG 矢量图
                </button>
                <button onClick={savePng}>
                  <Icon name="image" />
                  PNG 透明图片
                </button>
                <button onClick={exportProject}>
                  <Icon name="file" />
                  JSON 可编辑手稿
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="workspace">
        <aside className="left-panel">
          <div className="panel-tabs">
            <span>
              字符集 <b>{project.glyphs.length.toString().padStart(2, "0")}</b>
            </span>
            <IconButton icon="plus" title="新建字符" onClick={addGlyph} />
          </div>
          <div className="glyph-list">
            {project.glyphs.map((g, index) => (
              <button
                key={g.id}
                className={`glyph-card ${g.id === glyph.id ? "selected" : ""}`}
                onClick={() => switchGlyph(g.id)}
              >
                <div className="glyph-thumb">
                  <GlyphPreview glyph={g} brush={project.brush} />
                </div>
                <span className="glyph-card-text">
                  <strong>{g.name}</strong>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                </span>
                {g.id === glyph.id && <span className="glyph-active-dot" />}
              </button>
            ))}
            <button className="add-glyph" onClick={addGlyph}>
              <Icon name="plus" size={16} />
              新建字符
            </button>
          </div>
          <div className="layers-section">
            <div className="section-heading">
              <h3>笔画</h3>
              <span className="count-badge">{glyph.strokes.length}</span>
            </div>
            <div className="layer-list">
              {glyph.strokes.map((s, i) => (
                <div
                  key={s.id}
                  className={`layer-row ${strokeId === s.id ? "selected" : ""} ${!s.visible ? "muted" : ""}`}
                >
                  <button
                    className="layer-select"
                    onClick={() => select(null, s.id)}
                  >
                    <svg width="26" height="26" viewBox="0 0 640 640">
                      <path
                        d={centerPath(glyph, s)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="38"
                      />
                    </svg>
                    <span>{s.name}</span>
                    <small>{String(i + 1).padStart(2, "0")}</small>
                  </button>
                  <button
                    className={`layer-control ${s.locked ? "is-locked" : ""}`}
                    aria-label={`${s.locked ? "解锁" : "锁定"}${s.name}`}
                    title={s.locked ? "解锁笔画" : "锁定笔画"}
                    onClick={() =>
                      update((g) => {
                        g.strokes.find((item) => item.id === s.id)!.locked =
                          !s.locked;
                      })
                    }
                  >
                    <Icon name={s.locked ? "lock" : "unlock"} size={13} />
                  </button>
                  <button
                    className="layer-control"
                    aria-label={`${s.visible ? "隐藏" : "显示"}${s.name}`}
                    title={s.visible ? "隐藏笔画" : "显示笔画"}
                    onClick={() =>
                      update((g) => {
                        g.strokes.find((item) => item.id === s.id)!.visible =
                          !s.visible;
                      })
                    }
                  >
                    <Icon name={s.visible ? "eye" : "eyeOff"} size={14} />
                  </button>
                </div>
              ))}
              {!glyph.strokes.length && (
                <button className="empty-layer" onClick={() => setTool("pen")}>
                  <Icon name="pen" />
                  绘制第一笔
                </button>
              )}
            </div>
          </div>
          <div className="left-footer">
            <button onClick={() => setShortcuts(true)}>
              <Icon name="shortcut" size={17} />
              快捷键<span>?</span>
            </button>
          </div>
        </aside>
        <EditorCanvas
          openContextMenu={openContextMenu}
          toggleInspector={() => setInspectorOpen((v) => !v)}
          doc={doc}
          glyph={glyph}
          nodeId={nodeId}
          strokeId={strokeId}
          select={select}
          tool={tool}
          setTool={setTool}
          upload={upload}
          importFile={importFile}
          toast={setToast}
          showReference={showReference}
          modalOpen={!!source || shortcuts || !!contextMenu}
        />
        <Properties
          closeInspector={() => setInspectorOpen(false)}
          doc={doc}
          glyph={glyph}
          nodeId={nodeId}
          strokeId={strokeId}
          showReference={showReference}
          setShowReference={setShowReference}
        />
        {contextMenu && (
          <EditorContextMenu
            key={`${glyph.id}:${nodeId}:${strokeId}`}
            position={contextMenu}
            onClose={closeContextMenu}
            doc={doc}
            glyph={glyph}
            nodeId={nodeId}
            strokeId={strokeId}
            select={select}
            remove={remove}
            duplicate={duplicate}
            toast={setToast}
          />
        )}
      </div>
      {source && (
        <ImportDialog
          source={source}
          onClose={() => setSource(null)}
          onImport={(g) => {
            update((_, p) => {
              p.glyphs.push(g);
              p.activeId = g.id;
            });
            setSource(null);
            select(null, g.strokes[0]?.id || null);
            setTool("select");
            setShowReference(false);
            setToast(`已提取 ${g.strokes.length} 条笔画`);
          }}
        />
      )}
      {shortcuts && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShortcuts(false);
          }}
        >
          <section
            className="shortcut-modal"
            role="dialog"
            aria-modal="true"
            aria-label="快捷键"
          >
            <div className="modal-heading">
              <h2>快捷键</h2>
              <IconButton
                icon="close"
                title="关闭"
                onClick={() => setShortcuts(false)}
              />
            </div>
            <div className="shortcut-list">
              {[
                ["选择 / 钢笔 / 分支 / 平移", "V / P / B / H"],
                ["从节点拉出新笔画", "Alt + 拖动"],
                ["约束 45° 方向", "Shift + 拖动"],
                ["添加路径节点", "双击笔画"],
                ["全局 / 节点 / 笔画操作", "右键"],
                ["移动节点", "方向键"],
                ["大步移动节点", "Shift + 方向键"],
                ["临时平移画布", "空格 + 拖动"],
                ["预览 / 编辑", "Tab"],
                ["网格", "G"],
                ["适应画布", "0"],
                ["撤销 / 重做", "Ctrl Z / Ctrl Shift Z"],
                ["保存手稿文件", "Ctrl S"],
                ["删除节点 / 笔画", "Delete"],
                ["结束绘制", "Esc"],
              ].map(([label, key]) => (
                <div key={label}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
