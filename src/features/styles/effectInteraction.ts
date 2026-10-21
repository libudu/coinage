import type { Point } from "../../core/model";

export type EffectBounds = Point & { size: number };

export function createEffectPointer() {
  let last: (Point & { time: number }) | null = null;
  let velocity: Point = { x: 0, y: 0 };
  return {
    move(x: number, y: number, time: number) {
      const elapsed = last ? time - last.time : 0;
      velocity =
        last && elapsed > 0 && elapsed < 200
          ? {
              x: ((x - last.x) * 1000) / Math.max(1, elapsed),
              y: ((y - last.y) * 1000) / Math.max(1, elapsed),
            }
          : { x: 0, y: 0 };
      last = { x, y, time };
    },
    reset() {
      last = null;
      velocity = { x: 0, y: 0 };
    },
    frame(bounds: EffectBounds, time: number) {
      if (!last || bounds.size <= 0) return { pointer: [-10, -10, 0, 0] };
      const x = (last.x - bounds.x) / bounds.size;
      const y = (last.y - bounds.y) / bounds.size;
      const age = Math.max(0, time - last.time);
      const decay = age < 800 ? Math.exp(-age / 140) : 0;
      const speed = Math.hypot(velocity.x, velocity.y) / bounds.size;
      const scale = (Math.min(3, speed) / Math.max(0.001, speed)) * decay;
      // 按渲染宽度归一化速度，大小不同的字符保持相同手感。
      return {
        pointer: [
          x,
          y,
          (velocity.x / bounds.size) * scale,
          (velocity.y / bounds.size) * scale,
        ],
      };
    },
  };
}
