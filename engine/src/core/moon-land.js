import { z } from "zod";
import { groundPosition } from "./terrain.js";

export const MoonLandSchema = z.object({
  regionId: z.string().min(1).max(80),
  dormantHeight: z.number().min(-80).max(-0.1),
  returnPosition: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
}).strict();
export function moonRegion(world) { return world.terrain?.regions.find(r => r.id === world.moonLand?.regionId); }
export function inMoonLand(world, position, margin = 0) {
  const r = moonRegion(world);
  return !!r && position[0] >= r.min[0] - margin && position[0] <= r.max[0] + margin &&
    position[2] >= r.min[1] - margin && position[2] <= r.max[1] + margin;
}
export function moonBound(e, world) { return !!e.moonOnly || inMoonLand(world, e.position); }
export function eventEntityPresent(e, world, state) {
  const dropped = state.droppedItems?.[e.id];
  if (e.kind === "item" && (state.inventory?.includes(e.id) || (dropped && !inMoonLand(world, dropped)))) return true;
  return !moonBound(e, world) || !!state.events?.moonActive;
}
/** The authored terrain always shows the island. A session owns its mutable copy. */
export function moonRuntimeProject(project) {
  if (!project.world.moonLand) return project;
  return {...project, world: {...project.world, terrain: {...project.world.terrain, heights: [...project.world.terrain.heights]}}};
}
export function syncMoonLand(game) {
  const w = game.project.world, cfg = w.moonLand, region = moonRegion(w);
  if (!cfg || !region) return;
  const active = !!game.state.events.moonActive;
  if (game.moonLandActive === active) return;
  const n = w.terrain.resolution, step = w.size / n, half = w.size / 2;
  const dirty = {minX: Math.max(0, Math.round((region.min[0] + half) / step)), maxX: Math.min(n, Math.round((region.max[0] + half) / step)),
    minZ: Math.max(0, Math.round((region.min[1] + half) / step)), maxZ: Math.min(n, Math.round((region.max[1] + half) / step))};
  for (let z = dirty.minZ; z <= dirty.maxZ; z++) for (let x = dirty.minX; x <= dirty.maxX; x++) {
    const i = z * (n + 1) + x, authored = game.sourceWorld.terrain.heights[i];
    const edge = Math.min(x - dirty.minX, dirty.maxX - x, z - dirty.minZ, dirty.maxZ - z) * step;
    const t = Math.min(1, Math.max(0, edge / 4)), fade = t * t * (3 - 2 * t);
    w.terrain.heights[i] = active ? authored : authored + (Math.min(authored, cfg.dormantHeight) - authored) * fade;
  }
  game.moonLandActive = active; game.terrainRevision = (game.terrainRevision ?? 0) + 1; game.terrainDirty = dirty;
  if (!active) evacuateMoonLand(game);
}
export function evacuateMoonLand(game) {
  const {world} = game.project, s = game.state;
  if (!world.moonLand || s.events.moonActive) return false;
  const shore = groundPosition(world, world.moonLand.returnPosition);
  let returned = false;
  if (inMoonLand(world, s.position, 0.5)) {s.position = shore; game.moonReturnSerial = (game.moonReturnSerial ?? 0) + 1; returned = true;}
  if (s.rpg && inMoonLand(world, s.rpg.horsePosition, 0.5)) {s.rpg.horsePosition = [shore[0], shore[1] - 1.7, shore[2]]; s.rpg.mounted = false;}
  for (const [id, pos] of Object.entries(s.droppedItems)) if (inMoonLand(world, pos)) s.droppedItems[id] = [shore[0], shore[1] - 1.55, shore[2]];
  return returned;
}
