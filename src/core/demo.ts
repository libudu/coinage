import { emptyGlyph, newStroke, uid } from "./model";
import type { Project } from "./model";

export function demoProject(): Project {
  const shapes = [
    [
      [
        [126, 401],
        [126, 290],
        [320, 116],
        [514, 290],
        [514, 401],
      ],
      [
        [126, 290],
        [240, 290],
        [240, 220],
        [320, 307],
        [402, 190],
      ],
      [
        [320, 116],
        [320, 230],
      ],
      [
        [402, 190],
        [402, 290],
        [514, 290],
      ],
    ],
    [
      [
        [133, 251],
        [133, 351],
        [61, 414],
        [201, 414],
        [320, 537],
        [425, 414],
        [572, 414],
        [477, 337],
        [477, 192],
        [355, 337],
      ],
      [
        [133, 251],
        [175, 215],
        [245, 284],
      ],
    ],
    [
      [
        [105, 167],
        [105, 311],
        [320, 510],
        [535, 311],
        [535, 168],
      ],
      [
        [105, 311],
        [205, 220],
        [205, 376],
      ],
      [
        [205, 292],
        [320, 402],
        [320, 455],
      ],
      [
        [320, 402],
        [424, 290],
        [424, 220],
        [535, 311],
      ],
      [
        [424, 290],
        [424, 414],
      ],
    ],
  ];
  const glyphs = shapes.map((paths, index) => {
    const g = emptyGlyph(`字形 ${String(index + 1).padStart(2, "0")}`);
    const byPosition = new Map<string, string>();
    paths.forEach((coords) => {
      const ids = coords.map(([x, y]) => {
        const key = `${x},${y}`;
        if (byPosition.has(key)) return byPosition.get(key)!;
        const id = uid();
        g.nodes[id] = {
          id,
          x,
          y: index === 0 ? y + 65 : y,
          width: 48,
          mode: "corner",
        };
        byPosition.set(key, id);
        return id;
      });
      g.strokes.push(newStroke(ids, g.strokes.length));
    });
    return g;
  });
  return { version: 1, glyphs, activeId: glyphs[0].id };
}
