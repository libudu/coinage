export type GlyphEffects = {
  type: "none" | "fire" | "rune";
  fire: {
    palette: "ember" | "azure" | "jade" | "ashen";
    intensity: number;
    speed: number;
    direction: number;
    disturbance: number;
  };
  rune: {
    material?: "light" | "jade" | "ice" | "gold";
    color: string;
    intensity: number;
    speed: number;
    direction: number;
    haloWidth: number;
  };
};

export const defaultGlyphEffects: GlyphEffects = {
  type: "none",
  fire: {
    palette: "ember",
    intensity: 70,
    speed: 80,
    direction: 0,
    disturbance: 50,
  },
  rune: {
    material: "ice",
    color: "#65dfff",
    intensity: 65,
    speed: 60,
    direction: 0,
    haloWidth: 50,
  },
};

export const firePalettes = {
  ember: { label: "焰橙", cold: "#a91c12", warm: "#ff7b16", hot: "#fff0a8" },
  azure: { label: "幽蓝", cold: "#1d31b7", warm: "#238dff", hot: "#c7faff" },
  jade: { label: "碧焰", cold: "#12613d", warm: "#3ce98e", hot: "#e3ffae" },
  ashen: { label: "灰黑", cold: "#101217", warm: "#353b43", hot: "#a3afad" },
} as const;

export const runePresets = [
  {
    label: "冰蓝秘文",
    material: "ice",
    color: "#65dfff",
    intensity: 65,
    speed: 60,
  },
  {
    label: "紫晶奥术",
    material: "light",
    color: "#bd87ff",
    intensity: 80,
    speed: 45,
  },
  {
    label: "鎏金圣印",
    material: "gold",
    color: "#d9aa48",
    intensity: 60,
    speed: 35,
  },
  {
    label: "古玉灵纹",
    material: "jade",
    color: "#82aa87",
    intensity: 55,
    speed: 30,
  },
] as const;

export function isGlyphEffects(value: unknown): value is GlyphEffects {
  if (!value || typeof value !== "object") return false;
  const effect = value as GlyphEffects;
  const validAmount = (amount: unknown, min: number, max: number) =>
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount >= min &&
    amount <= max;
  return (
    ["none", "fire", "rune"].includes(effect.type) &&
    !!effect.fire &&
    typeof effect.fire.palette === "string" &&
    Object.hasOwn(firePalettes, effect.fire.palette) &&
    validAmount(effect.fire.intensity, 20, 100) &&
    validAmount(effect.fire.speed, 20, 160) &&
    validAmount(effect.fire.direction, 0, 360) &&
    validAmount(effect.fire.disturbance, 0, 100) &&
    !!effect.rune &&
    (effect.rune.material === undefined ||
      ["light", "jade", "ice", "gold"].includes(effect.rune.material)) &&
    typeof effect.rune.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(effect.rune.color) &&
    validAmount(effect.rune.intensity, 20, 100) &&
    validAmount(effect.rune.speed, 20, 160) &&
    validAmount(effect.rune.direction, 0, 360) &&
    validAmount(effect.rune.haloWidth, 10, 100)
  );
}

export type ProjectStyle = { color: string; effects: GlyphEffects };

export const defaultProjectStyle: ProjectStyle = {
  color: "#243d34",
  effects: defaultGlyphEffects,
};

export function isProjectStyle(value: unknown): value is ProjectStyle {
  if (!value || typeof value !== "object") return false;
  const style = value as ProjectStyle;
  return (
    typeof style.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(style.color) &&
    isGlyphEffects(style.effects)
  );
}
