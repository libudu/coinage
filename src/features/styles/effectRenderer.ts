import {
  Application,
  Color,
  Container,
  Filter,
  GlProgram,
  Mesh,
  MeshGeometry,
  Shader,
  Sprite,
  Texture,
} from "pixi.js";
import { GlowFilter } from "pixi-filters/glow";
import type { BrushDefaults } from "../../core/brush";
import { glyphPath } from "../../core/geometry";
import {
  defaultGlyphEffects,
  defaultInkSettings,
  defaultSpiderWebSettings,
  firePalettes,
} from "../../core/glyphEffects";
import type { GlyphEffects, SpiderWebSettings } from "../../core/glyphEffects";
import type { Glyph } from "../../core/model";
import { effectFragment, effectVertex } from "./effectShaders";
import { buildFlameField, flameFieldScale, flameFieldSize } from "./flameField";
import { createEffectPointer } from "./effectInteraction";
import { createFireAirflow, fireGustCount } from "./fireEffect";
import { createInkFlow, inkFieldSize } from "./inkEffect";
import {
  hitRune,
  runeMaterials,
  runeRippleCount,
  runeRippleDuration,
  runePointerTilt,
  writeRuneRipples,
} from "./runeEffect";
import type { EffectBounds } from "./effectInteraction";
import type { RuneRipple } from "./runeEffect";
import {
  buildSpiderWeb,
  createSpiderWeb,
  drawSpiderWeb,
} from "./spiderWebEffect";

type GlyphTexture = {
  canvas: HTMLCanvasElement;
  pixels: Uint8ClampedArray;
  mask: Texture;
  flame: Texture | null;
  direction: number;
  references: number;
  web?: ReturnType<typeof createWebTexture>;
};

type Entry = {
  container: Container;
  sprite: Sprite;
  filter: Filter;
  glow: GlowFilter;
  path: string;
  textures: GlyphTexture;
  bounds: EffectBounds;
  tilt: number[];
  airflow: ReturnType<typeof createFireAirflow>;
  ripples: RuneRipple[];
  ink: ReturnType<typeof createInkTexture> | null;
  web: ReturnType<typeof createWebMesh> | null;
};

function createWebTexture(mask: GlyphTexture) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建蜘蛛网纹理");
  const texture = Texture.from(canvas);
  let appearance = "",
    density = -1;
  let geometry: ReturnType<typeof buildSpiderWeb>;
  return {
    texture,
    update(next: SpiderWebSettings) {
      const key = `${next.color}:${next.thickness}:${next.density}`;
      if (appearance === key) return;
      if (density !== next.density) {
        geometry = buildSpiderWeb(mask.pixels, mask.canvas.width, next.density);
        density = next.density;
      }
      drawSpiderWeb(context, geometry, next);
      texture.source.update();
      appearance = key;
    },
  };
}

function createWebMesh(mask: GlyphTexture) {
  mask.web ??= createWebTexture(mask);
  const flow = createSpiderWeb(mask.pixels, mask.canvas.width);
  const geometry = new MeshGeometry({
    positions: flow.positions,
    uvs: flow.rest,
    indices: flow.indices,
  });
  // 独立纹理绑定随实例释放，避免共享默认网格着色器继续引用已销毁的纹理。
  const shader = Shader.from({
    gl: {
      name: "coinage-spider-web",
      vertex: `
        in vec2 aPosition;
        in vec2 aUV;
        uniform mat3 uProjectionMatrix;
        uniform mat3 uWorldTransformMatrix;
        uniform mat3 uTransformMatrix;
        uniform vec4 uWorldColorAlpha;
        uniform vec4 uColor;
        out vec2 vUV;
        out vec4 vColor;
        void main() {
          vec3 position = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
          gl_Position = vec4(position.xy, 0.0, 1.0);
          vUV = aUV;
          vColor = uWorldColorAlpha * uColor;
        }
      `,
      fragment: `
        in vec2 vUV;
        in vec4 vColor;
        uniform sampler2D uTexture;
        out vec4 finalColor;
        void main() { finalColor = texture(uTexture, vUV) * vColor; }
      `,
    },
    resources: { uTexture: mask.web.texture.source },
  });
  const mesh = new Mesh({ texture: mask.web.texture, geometry, shader });
  return {
    mesh,
    flow,
    update(delta: number, settings: SpiderWebSettings, force = false) {
      if (
        flow.update(
          delta,
          settings.elasticity,
          settings.propagation ?? defaultSpiderWebSettings.propagation,
        ) ||
        force
      )
        geometry.getBuffer("aPosition").update();
    },
    destroy() {
      mesh.destroy();
      shader.destroy();
      geometry.destroy(true);
    },
  };
}

function createInkTexture(mask: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = inkFieldSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建水墨纹理");
  context.drawImage(mask, 0, 0, inkFieldSize, inkFieldSize);
  const image = context.getImageData(0, 0, inkFieldSize, inkFieldSize);
  const source = new Float32Array(inkFieldSize * inkFieldSize);
  for (let i = 0; i < source.length; i++)
    source[i] = image.data[i * 4 + 3] / 255;
  const flow = createInkFlow(source);
  image.data.set(flow.pixels);
  context.putImageData(image, 0, 0);
  const texture = Texture.from(canvas);
  return {
    flow,
    texture,
    upload() {
      image.data.set(flow.pixels);
      context.putImageData(image, 0, 0);
      texture.source.update();
    },
  };
}

function createMask(path: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建字形纹理");
  context.scale(canvas.width / 800, canvas.height / 800);
  context.translate(80, 80);
  context.fillStyle = "white";
  context.fill(new Path2D(path));
  return {
    canvas,
    pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
    mask: Texture.from(canvas),
    flame: null,
    direction: -1,
    references: 0,
  };
}

function createFlameTexture(mask: HTMLCanvasElement, direction: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = flameFieldSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建火焰纹理");
  context.translate(flameFieldSize / 2, flameFieldSize / 2);
  context.rotate((-direction * Math.PI) / 180);
  context.scale(flameFieldScale, flameFieldScale);
  context.drawImage(
    mask,
    -flameFieldSize / 2,
    -flameFieldSize / 2,
    flameFieldSize,
    flameFieldSize,
  );
  const image = context.getImageData(0, 0, flameFieldSize, flameFieldSize);
  image.data.set(buildFlameField(image.data, flameFieldSize));
  context.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

export async function createEffectScene(host: HTMLElement) {
  const app = new Application();
  await app.init({
    preference: "webgl",
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    autoStart: false,
    width: 1,
    height: 1,
  });
  app.canvas.setAttribute("aria-hidden", "true");
  app.canvas.className = "glyph-effects-canvas";
  host.append(app.canvas);
  const entries = new Map<HTMLElement, Entry>();
  // 造句中的重复字形共享遮罩和供燃场；最后一个可见实例离开时释放。
  const textures = new Map<string, GlyphTexture>();
  let glyphs: readonly Glyph[] = [],
    brush: BrushDefaults | undefined,
    effects: GlyphEffects = defaultGlyphEffects;
  let destroyed = false;
  let time = 0;
  let inView = true;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = createEffectPointer();
  let webDrag: { entry: Entry; pointerId: number } | null = null;
  const webSettings = () => effects.web ?? defaultSpiderWebSettings;
  const webPoint = (event: PointerEvent, entry: Entry) => ({
    x: (event.clientX - entry.bounds.x) / entry.bounds.size,
    y: (event.clientY - entry.bounds.y) / entry.bounds.size,
  });
  const releaseWeb = (event?: PointerEvent) => {
    if (!webDrag || (event && event.pointerId !== webDrag.pointerId)) return;
    webDrag.entry.web?.flow.release();
    webDrag = null;
    delete host.dataset.webDragging;
    if (canInteract()) app.start();
  };
  const canInteract = () =>
    !destroyed && !document.hidden && inView && !reducedMotion.matches;
  const updateInteraction = (delta: number) => {
    const now = performance.now();
    for (const entry of entries.values()) {
      if (effects.type === "web") {
        entry.web?.update(delta, webSettings());
        continue;
      }
      const uniforms = entry.filter.resources.effectUniforms.uniforms;
      const frame = pointer.frame(entry.bounds, now);
      if (effects.type === "fire") entry.airflow.update(frame.pointer, delta);
      if (
        effects.type === "ink" &&
        entry.ink?.flow.update(
          frame.pointer,
          delta,
          effects.ink ?? defaultInkSettings,
        )
      )
        entry.ink.upload();
      const smoothing = 1 - Math.exp(-delta / 0.1);
      const tilt = runePointerTilt(frame.pointer);
      for (let i = 0; i < 2; i++)
        entry.tilt[i] += (tilt[i] - entry.tilt[i]) * smoothing;
      uniforms.uTilt = entry.tilt;
      entry.ripples = entry.ripples.filter(
        (ripple) => time - ripple.started < runeRippleDuration,
      );
      writeRuneRipples(uniforms.uRipples, entry.ripples, time);
    }
  };
  const resetInteraction = () => {
    releaseWeb();
    pointer.reset();
    for (const entry of entries.values()) {
      entry.tilt.fill(0);
      entry.airflow.reset();
      entry.ripples = [];
      if (entry.web) {
        entry.web.flow.reset();
        entry.web.update(0, webSettings(), true);
      }
      if (entry.ink) {
        entry.ink.flow.reset();
        entry.ink.upload();
      }
    }
    updateInteraction(0);
  };
  const movePointer = (event: PointerEvent) => {
    if (!canInteract() || event.pointerType === "touch") return;
    if (webDrag?.pointerId === event.pointerId) {
      webDrag.entry.web?.flow.move(webPoint(event, webDrag.entry));
      app.start();
    }
    if (effects.type !== "web")
      pointer.move(event.clientX, event.clientY, performance.now());
  };
  const grabWeb = (event: PointerEvent) => {
    if (
      !canInteract() ||
      effects.type !== "web" ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      webDrag
    )
      return;
    for (const entry of entries.values()) {
      if (!entry.web) continue;
      const point = webPoint(event, entry);
      if (
        !entry.web.flow.grab(
          point,
          webSettings().propagation ?? defaultSpiderWebSettings.propagation,
        )
      )
        continue;
      webDrag = { entry, pointerId: event.pointerId };
      host.dataset.webDragging = "true";
      app.start();
      event.preventDefault();
      break;
    }
  };
  const leaveWindow = (event: PointerEvent) => {
    if (!event.relatedTarget) {
      pointer.reset();
      releaseWeb(event);
    }
  };
  const clickRune = (event: MouseEvent) => {
    if (!canInteract() || effects.type !== "rune" || event.button !== 0) return;
    for (const entry of entries.values()) {
      const origin = hitRune(
        { x: event.clientX, y: event.clientY },
        entry.bounds,
        entry.tilt,
        entry.textures.pixels,
        entry.textures.canvas.width,
      );
      if (!origin) continue;
      entry.ripples.push({ origin, started: time });
      if (entry.ripples.length > runeRippleCount) entry.ripples.shift();
      break;
    }
  };
  const program = GlProgram.from({
    vertex: effectVertex,
    fragment: effectFragment,
    name: "coinage-glyph-effects",
  });
  // 滤镜会共享临时纹理绑定；视口变化回收纹理前先解除引用。
  const releaseFilterInputs = () => {
    for (const { filter, glow } of entries.values())
      for (const shader of [filter, glow]) {
        const inputs = shader.groups[0];
        if (!inputs) continue;
        inputs.setResource(Texture.EMPTY.source, 1);
        inputs.setResource(Texture.EMPTY.source.style, 2);
        inputs.setResource(Texture.EMPTY.source, 3);
      }
  };
  const dispose = (element: HTMLElement, entry: Entry) => {
    if (webDrag?.entry === entry) releaseWeb();
    delete element.dataset.effectReady;
    entry.web?.destroy();
    entry.container.destroy({ children: true });
    entry.filter.destroy();
    entry.glow.destroy();
    entry.ink?.texture.destroy(true);
    if (--entry.textures.references === 0) {
      entry.textures.mask.destroy(true);
      entry.textures.flame?.destroy(true);
      entry.textures.web?.texture.destroy(true);
      textures.delete(entry.path);
    }
    entries.delete(element);
  };

  const layout = () => {
    if (destroyed) return;
    const rect = host.getBoundingClientRect();
    const top = Math.max(0, -rect.top - 40);
    const height = Math.max(
      1,
      Math.min(rect.height - top, window.innerHeight + 80),
    );
    app.canvas.style.top = `${top - 32}px`;
    app.canvas.style.left = "-32px";
    const width = Math.max(1, rect.width + 64);
    if (
      Math.abs(app.screen.width - width) > 0.5 ||
      Math.abs(app.screen.height - height - 64) > 0.5
    ) {
      releaseFilterInputs();
      app.renderer.resize(width, height + 64);
    }
    const retained = new Set<HTMLElement>();
    const oldFlames: Texture[] = [];
    for (const element of host.querySelectorAll<HTMLElement>(
      "[data-effect-glyph]",
    )) {
      const glyph = glyphs.find((g) => g.id === element.dataset.effectGlyph);
      if (!glyph || effects.type === "none") continue;
      const box = element.getBoundingClientRect();
      if (!box.width || box.bottom < -40 || box.top > window.innerHeight + 40)
        continue;
      const path = glyphPath(glyph, brush);
      if (!path) continue;
      let entry = entries.get(element);
      if (entry && entry.path !== path) {
        dispose(element, entry);
        entry = undefined;
      }
      if (!entry) {
        let glyphTexture = textures.get(path);
        if (!glyphTexture) {
          glyphTexture = createMask(path);
          textures.set(path, glyphTexture);
        }
        glyphTexture.references++;
        const sprite = new Sprite(Texture.WHITE);
        const airflow = createFireAirflow();
        const filter = new Filter({
          glProgram: program,
          clipToViewport: false,
          resources: {
            uMask: glyphTexture.mask.source,
            uFlame: Texture.EMPTY.source,
            uInk: Texture.EMPTY.source,
            effectUniforms: {
              uTime: { value: time, type: "f32" },
              uKind: { value: 1, type: "f32" },
              uIntensity: { value: 0.7, type: "f32" },
              uSpeed: { value: 0.8, type: "f32" },
              uDisturbance: { value: 0.5, type: "f32" },
              uHaloWidth: { value: 0.014, type: "f32" },
              uMaterial: { value: 0, type: "f32" },
              uAngle: { value: 0, type: "f32" },
              uSeed: { value: entries.size * 1.7, type: "f32" },
              uCold: { value: [0, 0, 0], type: "vec3<f32>" },
              uWarm: { value: [1, 0.4, 0.1], type: "vec3<f32>" },
              uHot: { value: [1, 1, 1], type: "vec3<f32>" },
              uAirSources: {
                value: airflow.sources,
                type: "vec4<f32>",
                size: fireGustCount,
              },
              uAirMotion: {
                value: airflow.motion,
                type: "vec4<f32>",
                size: fireGustCount,
              },
              uTilt: { value: [0, 0], type: "vec2<f32>" },
              uRipples: {
                value: new Float32Array(runeRippleCount * 4),
                type: "vec4<f32>",
                size: runeRippleCount,
              },
            },
          },
        });
        const glow = new GlowFilter({
          distance: 7,
          quality: 0.18,
          outerStrength: 1.5,
        });
        const container = new Container();
        sprite.filters = [filter];
        container.filters = [glow];
        container.addChild(sprite);
        app.stage.addChild(container);
        entry = {
          container,
          sprite,
          filter,
          glow,
          path,
          textures: glyphTexture,
          bounds: { x: 0, y: 0, size: 1 },
          tilt: [0, 0],
          airflow,
          ripples: [],
          ink: null,
          web: null,
        };
        entries.set(element, entry);
      }
      retained.add(element);
      const effect = effects;
      const fire = effect.type === "fire";
      const ink = effect.type === "ink";
      const web = effect.type === "web";
      if (web) {
        if (!entry.web) {
          entry.web = createWebMesh(entry.textures);
          entry.container.addChild(entry.web.mesh);
        }
        entry.textures.web!.update(webSettings());
      }
      entry.sprite.visible = !web;
      entry.sprite.filters = web ? [] : [entry.filter];
      if (!web && entry.web) {
        entry.web.destroy();
        entry.web = null;
      }
      const settings = fire
        ? effect.fire
        : ink
          ? (effect.ink ?? defaultInkSettings)
          : effect.rune;
      const direction =
        ("direction" in settings ? settings.direction : 0) % 360;
      if (ink && !entry.ink)
        entry.ink = createInkTexture(entry.textures.canvas);
      entry.filter.resources.uInk =
        entry.ink && ink ? entry.ink.texture.source : Texture.EMPTY.source;
      if (!ink && entry.ink) {
        entry.ink.texture.destroy(true);
        entry.ink = null;
      }
      entry.container.filters = ink || web ? [] : [entry.glow];
      if (
        fire &&
        (!entry.textures.flame || entry.textures.direction !== direction)
      ) {
        const flame = createFlameTexture(entry.textures.canvas, direction);
        if (entry.textures.flame) oldFlames.push(entry.textures.flame);
        entry.textures.flame = flame;
        entry.textures.direction = direction;
      }
      entry.filter.resources.uFlame = (
        fire ? entry.textures.flame! : Texture.EMPTY
      ).source;
      const palette = firePalettes[effect.fire.palette];
      const color = fire ? palette.warm : effect.rune.color;
      const material = runeMaterials[effect.rune.material ?? "light"];
      const uniforms = entry.filter.resources.effectUniforms.uniforms;
      uniforms.uKind = fire ? 1 : ink ? 3 : 2;
      uniforms.uIntensity = settings.intensity / 100;
      uniforms.uSpeed = settings.speed / 100;
      uniforms.uDisturbance = effect.fire.disturbance / 100;
      uniforms.uHaloWidth = 0.028 * (effect.rune.haloWidth / 100);
      uniforms.uMaterial = material.id;
      uniforms.uAngle = (direction * Math.PI) / 180;
      uniforms.uCold = new Color(fire ? palette.cold : (material.cold ?? color))
        .toArray()
        .slice(0, 3);
      uniforms.uWarm = new Color(color).toArray().slice(0, 3);
      uniforms.uHot = new Color(fire ? palette.hot : material.hot)
        .toArray()
        .slice(0, 3);
      entry.glow.color = color;
      entry.glow.outerStrength = fire
        ? 0.45 + settings.intensity / 110
        : material.glow + settings.intensity * material.glowGain;
      const size = box.width * 1.25;
      entry.bounds = {
        x: box.left - box.width * 0.125,
        y: box.top - box.height * 0.125,
        size,
      };
      entry.sprite.width = entry.sprite.height = size;
      entry.web?.mesh.scale.set(size);
      entry.container.position.set(
        box.left - rect.left - box.width * 0.125 + 32,
        box.top - rect.top - box.height * 0.125 - top + 32,
      );
    }
    for (const [element, entry] of entries)
      if (!retained.has(element)) dispose(element, entry);
    // 所有共享实例换绑后再回收旧方向的纹理。
    for (const flame of oldFlames) flame.destroy(true);
    // 成功绘制后才隐藏原始 SVG；无 GPU 时仍显示原字形。
    updateInteraction(0);
    app.render();
    for (const element of retained) element.dataset.effectReady = "true";
  };

  const tick = () => {
    const delta = Math.min(app.ticker.deltaMS, 50) / 1000;
    time += delta;
    updateInteraction(delta);
    for (const entry of entries.values())
      entry.filter.resources.effectUniforms.uniforms.uTime = time;
    if (
      effects.type === "web" &&
      !Array.from(entries.values()).some((entry) => entry.web?.flow.active)
    )
      app.stop();
  };
  app.ticker.maxFPS = 40;
  app.ticker.add(tick);
  const syncPlayback = () => {
    if (destroyed) return;
    if (!document.hidden && inView && !reducedMotion.matches) {
      if (
        effects.type !== "web" ||
        Array.from(entries.values()).some((entry) => entry.web?.flow.active)
      )
        app.start();
      else app.stop();
    } else {
      app.stop();
      resetInteraction();
      app.render();
    }
  };
  const resize = new ResizeObserver(layout);
  resize.observe(host);
  const visibility = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncPlayback();
  });
  visibility.observe(host);
  window.addEventListener("scroll", layout, true);
  window.addEventListener("resize", layout);
  window.addEventListener("pointermove", movePointer, { passive: true });
  window.addEventListener("pointerup", releaseWeb);
  window.addEventListener("pointerout", leaveWindow);
  window.addEventListener("pointercancel", resetInteraction);
  window.addEventListener("blur", resetInteraction);
  host.addEventListener("click", clickRune);
  host.addEventListener("pointerdown", grabWeb);
  document.addEventListener("visibilitychange", syncPlayback);
  reducedMotion.addEventListener("change", syncPlayback);
  syncPlayback();
  return {
    update(
      nextGlyphs: readonly Glyph[],
      nextBrush: BrushDefaults | undefined,
      nextEffects: GlyphEffects,
    ) {
      glyphs = nextGlyphs;
      brush = nextBrush;
      if (effects.type !== nextEffects.type) resetInteraction();
      effects = nextEffects;
      host.dataset.webEffect = effects.type === "web" ? "true" : "false";
      layout();
      syncPlayback();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releaseWeb();
      delete host.dataset.webEffect;
      app.stop();
      releaseFilterInputs();
      resize.disconnect();
      visibility.disconnect();
      window.removeEventListener("scroll", layout, true);
      window.removeEventListener("resize", layout);
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("pointerup", releaseWeb);
      window.removeEventListener("pointerout", leaveWindow);
      window.removeEventListener("pointercancel", resetInteraction);
      window.removeEventListener("blur", resetInteraction);
      host.removeEventListener("click", clickRune);
      host.removeEventListener("pointerdown", grabWeb);
      document.removeEventListener("visibilitychange", syncPlayback);
      reducedMotion.removeEventListener("change", syncPlayback);
      for (const [element, entry] of entries) dispose(element, entry);
      app.destroy(true, { children: true });
    },
  };
}

export type EffectScene = Awaited<ReturnType<typeof createEffectScene>>;
