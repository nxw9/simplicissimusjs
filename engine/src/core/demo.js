import { validateProject, FORMAT_VERSION } from "./project.js";
export function demoProject() {
  const entities = [];
  const add = (id, name, shape, position, scale, color, extra = {}) =>
    entities.push({
      id,
      name,
      shape,
      position,
      scale,
      color,
      rotation: [0, 0, 0],
      kind: "prop",
      solid: true,
      dialogue: "",
      health: 40,
      ...extra,
    });
  add("arch", "Старая арка", "ruin", [0, 0, -8], [1, 1, 1], "#979b89");
  add("warden", "Хранитель", "humanoid", [-3, 0, 1], [1, 1, 1], "#d6bb79", {
    kind: "npc",
    solid: false,
    dialogue:
      "Огонь у старой арки угас. Найди светящийся осколок за руинами и принеси его мне. Осторожно: там бродит страж.",
  });
  add(
    "shard",
    "Солнечный осколок",
    "sphere",
    [2, 0.8, -13],
    [0.6, 0.6, 0.6],
    "#9effb9",
    { kind: "item", solid: false },
  );
  add(
    "sentinel",
    "Страж руин",
    "humanoid",
    [-1, 0, -13],
    [1, 1, 1],
    "#a44d47",
    {
      kind: "enemy",
      solid: false,
      health: 60,
    },
  );
  for (let i = 0; i < 36; i++) {
    const a = i * 2.39996,
      r = 14 + (i % 6) * 2.5;
    add(
      `tree-${i}`,
      "Сосна",
      "tree",
      [Math.cos(a) * r, 0, Math.sin(a) * r],
      [0.8 + (i % 3) * 0.25, 1 + (i % 4) * 0.2, 0.8 + (i % 3) * 0.25],
      "#426858",
    );
  }
  for (let i = 0; i < 7; i++)
    add(
      `rock-${i}`,
      "Камень",
      "sphere",
      [-9 + i * 3.1, 0.35, -5 - (i % 2) * 3],
      [1.4, 0.7, 1.1],
      "#777f70",
    );
  return validateProject({
    format: "hearth-project",
    schemaVersion: FORMAT_VERSION,
    weapon: null,
    id: "hearth-demo",
    contentVersion: 1,
    title: "Долина тихого огня",
    world: {
      terrain: null,
      size: 80,
      sky: "#9aaea7",
      ground: "#4b6250",
      spawn: [0, 1.7, 7],
    },
    assets: [],
    entities,
    quests: [
      {
        id: "first-fire",
        title: "Вернуть тихий огонь",
        giver: "warden",
        target: "shard",
        required: 1,
        type: "collect",
        reward: 25,
      },
    ],
  });
}
