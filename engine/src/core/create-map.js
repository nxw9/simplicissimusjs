import { FORMAT_VERSION, validateProject } from "./project.js";
import { createTerrain, EYE_HEIGHT } from "./terrain.js";

export const MIN_MAP_SIZE = 20;
export const MAX_MAP_SIZE = 2000;

export function validateMapSize(size) {
  if (!Number.isFinite(size) || size < MIN_MAP_SIZE || size > MAX_MAP_SIZE)
    throw Error(`Размер стороны карты должен быть от ${MIN_MAP_SIZE} до ${MAX_MAP_SIZE} м.`);
  return size;
}

/** A new editable heightfield; terrain extent never becomes a movement wall. */
export function createMap({ title = "Новая карта", size = 80 } = {}) {
  validateMapSize(size);
  if (typeof title !== "string" || !title.trim() || title.trim().length > 160)
    throw Error("Введите название карты: от 1 до 160 символов.");
  // Keep small maps detailed and large maps within the existing render budget.
  const resolution = Math.max(128, Math.min(512, Math.ceil(size / 2 / 32) * 32));
  const terrain = createTerrain(resolution);
  const half = size / 2;
  terrain.regions.push({
    id: "main-map",
    name: "Основная карта · вся территория",
    min: [-half, -half],
    max: [half, half],
  });
  return validateProject({
    format: "hearth-project",
    schemaVersion: FORMAT_VERSION,
    id: crypto.randomUUID(),
    title: title.trim(),
    contentVersion: 1,
    weapon: null,
    world: {
      size,
      playBounds: null,
      sky: "#9aaea7",
      ground: "#4b6250",
      spawn: [0, EYE_HEIGHT, 0],
      terrain,
    },
    assets: [],
    entities: [],
    quests: [],
  });
}
