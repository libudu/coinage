export const flameFieldSize = 512;
export const flameFieldScale = 0.64;
export const flameFieldReach = 0.22;

// 在方向对齐的遮罩上从下往上扫描；红通道为离焰根的距离，绿通道只在字形外供燃。
// 只在轮廓或方向变化时生成，避免逐帧叠加多份偏移字形。
export function buildFlameField(pixels: Uint8ClampedArray, size: number) {
  const field = new Uint8ClampedArray(size * size * 4);
  const reach = size * flameFieldScale * flameFieldReach;
  for (let x = 0; x < size; x++) {
    let distance = reach;
    let fuel = 0;
    for (let y = size - 1; y >= 0; y--) {
      const index = (y * size + x) * 4;
      const ink = pixels[index + 3];
      if (ink > 30) {
        fuel = Math.max(ink, distance === 0 ? fuel : 0);
        distance = 0;
      } else distance++;
      field[index] = Math.round(Math.min(1, distance / reach) * 255);
      // 内部由原始抗锯齿遮罩绘制，避免低分辨率焰根在背向边缘多叠一层。
      field[index + 1] = ink <= 30 && distance < reach ? fuel : 0;
      field[index + 3] = 255;
    }
  }
  return field;
}
