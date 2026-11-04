import { z } from "zod";
import { MountSchema } from "./mount.js";
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,80}$/)
  .refine((v) => !(v in Object.prototype));
const vec = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const reward = z
  .object({
    xp: z.number().int().min(0).max(10000),
    potions: z.number().int().min(0).max(100),
    items: z.array(id).max(30).default([]),
  })
  .strict();
export const RPGSchema = z
  .object({
    mount: MountSchema.optional(),
    startingPotions: z.number().int().min(0).max(99),
    potionHeal: z.number().int().min(1).max(1000),
    potionCost: z.number().int().min(0).max(10000),
    upgradeCosts: z.array(z.number().int().min(0).max(10000)).max(10),
    services: z.object({ rest: id, healer: id, smith: id, horse: id }).strict(),
    rewards: z.record(id, reward),
    enemyRewards: z.record(
      id,
      z
        .object({
          xp: z.number().int().min(0).max(10000),
          gold: z.number().int().min(0).max(10000),
        })
        .strict(),
    ),
    requirements: z.record(
      id,
      z
        .object({
          items: z.array(id),
          enemies: z.array(id),
          message: z.string().max(500),
        })
        .strict(),
    ),
    pickups: z.record(id, z.number().int().min(1).max(99)),
    ship: z
      .object({
        entity: id,
        quest: id,
        from: vec,
        to: vec,
        duration: z.number().min(2).max(300),
        deckHeight: z.number().min(0).max(10),
        halfWidth: z.number().min(1).max(10),
        halfLength: z.number().min(2).max(20),
      })
      .strict(),
    water: z
      .object({
        height: z.number().min(-50).max(50),
        color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
        dry: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      })
      .strict(),
  })
  .strict();
export const RPGStateSchema = z
  .object({
    level: z.number().int().min(1).max(100),
    xp: z.number().int().nonnegative(),
    potions: z.number().int().nonnegative(),
    upgrade: z.number().int().nonnegative(),
    stamina: z.number().min(0).max(100),
    usedPickups: z.array(id).max(1000).default([]),
    mounted: z.boolean(),
    horsePosition: vec,
    horseYaw: z.number().finite(),
    shipProgress: z.number().min(0).max(1),
    shipDirection: z.union([z.literal(-1), z.literal(1)]),
    shipMoving: z.boolean(),
  })
  .strict();
export function initialRPG(p) {
  return {
    usedPickups: [],
    level: 1,
    xp: 0,
    potions: p.rpg.startingPotions,
    upgrade: 0,
    stamina: 100,
    mounted: false,
    horsePosition: [
      ...p.entities.find((e) => e.id === p.rpg.services.horse).position,
    ],
    horseYaw: p.entities.find(e => e.id === p.rpg.services.horse).rotation[1],
    shipProgress: 0,
    shipDirection: 1,
    shipMoving: false,
  };
}
export function validateRPG(p) {
  if (!p.rpg) return;
  const c = p.rpg,
    es = new Map(p.entities.map((e) => [e.id, e])),
    qs = new Set(p.quests.map((q) => q.id));
  const entity = (id, kind) => {
    if (!es.has(id) || (kind && es.get(id).kind !== kind))
      throw Error("RPG: неверная ссылка " + id);
  };
  for (const [role, id] of Object.entries(c.services))
    entity(id, ["healer", "smith"].includes(role) ? "npc" : "prop");
  entity(c.ship.entity, "prop");
  if (c.mount) {
    const horse = es.get(c.services.horse);
    if (horse.shape !== "model" || horse.solid || horse.motion || horse.moonOnly)
      throw Error("Маунт: выберите 3D-модель без коллизий, механизма и ограничения красной луны");
    if (horse.scale.some(n => n !== 1)) throw Error("Маунт: задайте размер через высоту модели, масштаб объекта должен быть 1");
  }
  if (!qs.has(c.ship.quest)) throw Error("RPG: нет задания корабля");
  for (const [q, r] of Object.entries(c.rewards)) {
    if (!qs.has(q)) throw Error("RPG: нет задания " + q);
    r.items.forEach((id) => entity(id, "item"));
  }
  for (const id of Object.keys(c.enemyRewards)) entity(id, "enemy");
  for (const [id, r] of Object.entries(c.requirements)) {
    entity(id, "item");
    r.items.forEach((x) => entity(x, "item"));
    r.enemies.forEach((x) => entity(x, "enemy"));
  }
  for (const id of Object.keys(c.pickups)) entity(id, "item");
  for (const v of [c.ship.from, c.ship.to])
    if (Math.abs(v[0]) > p.world.size / 2 || Math.abs(v[2]) > p.world.size / 2)
      throw Error("RPG: порт вне мира");
  const [x0, z0, x1, z1] = c.water.dry;
  if (x1 <= x0 || z1 <= z0) throw Error("RPG: неверная сухая область");
}
export function collectionBlocked(p, state, id) {
  const r = p.rpg?.requirements[id];
  return r &&
    (r.items.some((x) => !state.inventory.includes(x)) ||
      r.enemies.some((x) => !state.defeated.includes(x)))
    ? r.message
    : null;
}
export function gainXP(game, amount) {
  const r = game.state.rpg;
  if (!r) return;
  r.xp += amount;
  while (r.level < 100 && r.xp >= r.level * 70) {
    r.xp -= r.level * 70;
    r.level++;
    game.state.health = game.maxHealth;
  }
}
export function shipPosition(p, r) {
  return p.rpg.ship.from.map(
    (v, i) => v + (p.rpg.ship.to[i] - v) * r.shipProgress,
  );
}
export function dryAt(p, x, z) {
  const [x0, z0, x1, z1] = p.rpg.water.dry;
  return x > x0 && x < x1 && z > z0 && z < z1;
}
