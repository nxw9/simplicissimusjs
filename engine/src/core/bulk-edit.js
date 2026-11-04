import { readProject } from "./project.js";
import { questTargets } from "./quests.js";

export function deleteEntities(project, ids) {
  const selected = new Set(ids);
  if (!project.entities.some(e => selected.has(e.id))) return project;
  for (const q of project.quests) if (selected.has(q.giver) || questTargets(q).some(id => selected.has(id)))
    throw Error(`Удаление отменено: объект нужен заданию «${q.title}». Сначала измените или удалите задание.`);
  for (const e of project.entities) if (!selected.has(e.id)) {
    if (selected.has(e.itemOwner)) throw Error(`Удаление отменено: «${e.name}» принадлежит выбранному персонажу. Выделите вещь вместе с ним или смените владельца.`);
    if (["item", "enemy"].includes(e.motion?.condition) && selected.has(e.motion.target)) throw Error(`Удаление отменено: объект используется механизмом «${e.name}».`);
  }
  if (project.rpg) for (const id of [...Object.values(project.rpg.services),project.rpg.ship.entity])
    if (selected.has(id)) throw Error(`Удаление отменено: «${project.entities.find(e => e.id === id)?.name ?? id}» назначен в правилах RPG. Сначала переназначьте его.`);
  const next = structuredClone(project); next.entities = next.entities.filter(e => !selected.has(e.id));
  if (next.rpg) for (const key of ["enemyRewards","pickups","requirements"]) for (const id of selected) delete next.rpg[key][id];
  try {return readProject(next);} catch (error) {throw Error("Удаление отменено: остались связи с выбранными объектами. " + error.message);}
}
export function selectionCenter(entities) {
  if (!entities.length) return [0,0,0];
  return [0,1,2].map(axis => (Math.min(...entities.map(e => e.position[axis])) + Math.max(...entities.map(e => e.position[axis]))) / 2);
}
/** Numeric controls and gizmos share one atomic operation. */
export function applyEntityTransforms(project, transforms) {
  const next = structuredClone(project), byId = new Map(transforms.map(t => [t.id,t]));
  for (const e of next.entities) {
    const t = byId.get(e.id); if (!t) continue;
    const old = [...e.position], ratio = t.scale.map((v,i) => v/e.scale[i]);
    if (Math.abs(t.position[0]) > next.world.size/2 || Math.abs(t.position[2]) > next.world.size/2)
      throw Error("Группа выходит за границы карты. Уменьшите смещение или расширьте мир.");
    e.position = [...t.position]; e.rotation = [...t.rotation]; e.scale = [...t.scale];
    if (next.rpg?.mount && next.rpg.services.horse === e.id) {
      if (Math.max(...ratio)-Math.min(...ratio)>1e-6) throw Error("Маунта можно масштабировать только равномерно.");
      next.rpg.mount.height *= ratio[0]; next.rpg.mount.seat = next.rpg.mount.seat.map(v => v*ratio[0]); e.scale = [1,1,1];
    }
    if (next.rpg?.ship.entity === e.id) {
      for (const key of ["from","to"]) next.rpg.ship[key] = next.rpg.ship[key].map((v,i) => v + t.position[i] - old[i]);
      next.rpg.ship.halfWidth *= ratio[0]; next.rpg.ship.deckHeight *= ratio[1]; next.rpg.ship.halfLength *= ratio[2];
    }
  }
  return readProject(next);
}
export function transformEntities(project, ids, {delta = [0,0,0], factor = 1, spread = true} = {}) {
  if (!Number.isFinite(factor) || factor <= 0 || delta.some(v => !Number.isFinite(v))) throw Error("Введите конечное смещение и положительный масштаб.");
  const selected = new Set(ids), entities = project.entities.filter(e => selected.has(e.id)), center = selectionCenter(entities);
  return applyEntityTransforms(project, entities.map(e => ({id:e.id, rotation:e.rotation,
    position:e.position.map((v,i) => center[i] + (v-center[i]) * (spread ? factor : 1) + delta[i]), scale:e.scale.map(v => v*factor)})));
}
