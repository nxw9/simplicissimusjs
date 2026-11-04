import { syncMoonLand, eventEntityPresent } from "./moon-land.js";
import { z } from "zod";
import { conditionLabels, conditionMet } from "./dialogue.js";

const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,80}$/)
  .refine((v) => !(v in Object.prototype));
const vec = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const EventConditionsSchema = z
  .array(
    z
      .object({
        kind: z.enum(Object.keys(conditionLabels)),
        target: id,
      })
      .strict(),
  )
  .max(12);
export const RedMoonSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(["chance", "conditions", "both", "either"]),
    chance: z.number().min(0).max(1),
    match: z.enum(["all", "any"]),
    conditions: EventConditionsSchema,
  })
  .strict();
export const RED_MOON_DEFAULTS = Object.freeze({
  enabled: false,
  mode: "chance",
  chance: 0.2,
  match: "all",
  conditions: [],
});
export const SpawnSchema = z
  .object({
    enabled: z.boolean(),
    match: z.enum(["all", "any"]),
    conditions: EventConditionsSchema,
    windows: z
      .array(
        z
          .object({
            from: z.number().min(0).lt(24),
            to: z.number().min(0).lt(24),
            chance: z.number().min(0).max(1),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export const HeldWeaponSchema = z
  .object({
    autoFit: z.boolean().default(false),
    axis: z.enum(["auto","x","y","z","-x","-y","-z"]).default("y"),
    assetId: id.nullable(),
    hand: z.enum(["right", "left"]),
    socket: z.string().max(160),
    position: vec,
    rotation: vec,
    length: z.number().min(0.05).max(8),
    grip: z.number().min(0).max(1),
    hideNodes: z.array(z.string().min(1).max(160)).max(30).default([]),
  })
  .strict();
export const MoonDoorSchema = z
  .object({
    duration: z.number().min(0.2).max(60),
    refuge: z
      .tuple([
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
        z.number().finite(),
      ])
      .nullable(),
  })
  .strict();
export const BookSchema = z
  .object({
    author: z.string().max(200),
    pages: z.array(z.string().min(1).max(6000)).min(1).max(100),
  })
  .strict();
export const EventStateSchema = z
  .object({
    day: z.number().int().min(0),
    moonNight: z.number().int().nullable(),
    moonRoll: z.boolean(),
    moonActive: z.boolean(),
    spawns: z.record(
      id,
      z.object({ cycle: z.string().max(60), appeared: z.boolean() }).strict(),
    ),
    doors: z.record(id, z.number().min(0).max(1)),
    readBooks: z.array(id),
  })
  .strict();
export const initialEvents = () => ({
  day: 0,
  moonNight: null,
  moonRoll: false,
  moonActive: false,
  spawns: {},
  doors: {},
  readBooks: [],
});
export function inTimeWindow(hour, from, to) {
  if (from === to) return true;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}
export function conditionsMatch(conditions, match, game) {
  return (
    !conditions.length ||
    (match === "any"
      ? conditions.some((c) => conditionMet(c, game))
      : conditions.every((c) => conditionMet(c, game)))
  );
}
export function eventConditions(project) {
  return [
    ...(project.world.redMoon?.conditions ?? []),
    ...project.entities.flatMap((e) => e.spawn?.conditions ?? []),
    ...project.quests.flatMap((q) => q.conditions ?? []),
  ];
}
export function validateWorldEvents(p) {
  const entities = new Map(p.entities.map((e) => [e.id, e]));
  const assets = new Set(p.assets.map((a) => a.id));
  for (const c of eventConditions(p)) {
    const valid = c.kind.startsWith("quest")
      ? p.quests.some((q) => q.id === c.target)
      : entities.get(c.target)?.kind ===
        (c.kind.startsWith("enemy") ? "enemy" : "item");
    if (!valid) throw Error(`Условие события: отсутствует цель ${c.target}`);
  }
  const moon = p.world.redMoon;
  if (moon?.enabled && moon.mode !== "chance" && !moon.conditions.length)
    throw Error(
      "Для красной луны выберите хотя бы одно условие или режим вероятности.",
    );
  for (const e of p.entities) {
    if ((e.spawn || e.heldWeapon) && !["npc", "enemy"].includes(e.kind))
      throw Error(
        "Оружие в руке и появление по времени доступны только NPC и врагам.",
      );
    if (e.heldWeapon?.assetId && !assets.has(e.heldWeapon.assetId))
      throw Error(`Не найдена модель оружия в руке: ${e.name}`);
    if (e.moonDoor && (e.kind !== "prop" || e.motion || !e.solid))
      throw Error("Лунная дверь — твёрдый объект без обычного механизма.");
    if (e.moonDoor?.refuge) {
      const [x0, z0, x1, z1] = e.moonDoor.refuge;
      if (x0 >= x1 || z0 >= z1)
        throw Error("Неверные границы подземелья лунной двери.");
    }
    if (e.book && !["prop", "item"].includes(e.kind))
      throw Error("Книга доступна для предмета или объекта.");
    const windows = e.spawn?.windows ?? [];
    for (let i = 0; i < windows.length; i++)
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i],
          b = windows[j];
        if (
          a.from === a.to ||
          b.from === b.to ||
          inTimeWindow(a.from, b.from, b.to) ||
          inTimeWindow(b.from, a.from, a.to)
        )
          throw Error(`Интервалы появления пересекаются: ${e.name}`);
      }
  }
}

// One saved draw per night / time window. Loading a save never rerolls it.
export function updateWorldEvents(game, random = Math.random) {
  const s = game.state,
    ev = (s.events ??= initialEvents()),
    moon = game.project.world.redMoon;
  const night = s.worldTime >= 18 || s.worldTime < 6;
  if (moon?.enabled && game.project.world.dayNight?.enabled && night) {
    const cycle = ev.day - (s.worldTime < 6 ? 1 : 0);
    if (ev.moonNight !== cycle) {
      ev.moonNight = cycle;
      ev.moonRoll = random() < moon.chance;
      ev.moonActive = false;
    }
    const met =
      moon.conditions.length > 0 &&
      conditionsMatch(moon.conditions, moon.match, game);
    const activate =
      moon.mode === "chance"
        ? ev.moonRoll
        : moon.mode === "conditions"
          ? met
          : moon.mode === "both"
            ? met && ev.moonRoll
            : met || ev.moonRoll;
    // Once triggered, the event lasts until dawn, even if an item is dropped.
    ev.moonActive ||= activate;
  } else ev.moonActive = false;
  for (const e of game.project.entities) {
    const cfg = e.spawn;
    if (!cfg?.enabled || s.defeated.includes(e.id)) continue;
    const index = cfg.windows.findIndex((w) =>
      inTimeWindow(s.worldTime, w.from, w.to),
    );
    if (index < 0) continue;
    const w = cfg.windows[index],
      day = ev.day - (w.from > w.to && s.worldTime < w.to ? 1 : 0);
    const cycle = `${day}:${index}`;
    if (
      ev.spawns[e.id]?.cycle !== cycle &&
      conditionsMatch(cfg.conditions, cfg.match, game)
    )
      ev.spawns[e.id] = { cycle, appeared: random() < w.chance };
  }
  syncMoonLand(game);
  return ev;
}
export function actorPresent(e, game) {
  if (!eventEntityPresent(e, game.project.world, game.state)) return false;
  if (game.state.defeated.includes(e.id)) return true; // corpses and loot remain
  const cfg = e.spawn;
  if (!cfg?.enabled) return true;
  const i = cfg.windows.findIndex((w) =>
    inTimeWindow(game.state.worldTime, w.from, w.to),
  );
  if (i < 0 || !conditionsMatch(cfg.conditions, cfg.match, game)) return false;
  const w = cfg.windows[i],
    day =
      (game.state.events?.day ?? 0) -
      (w.from > w.to && game.state.worldTime < w.to ? 1 : 0);
  const r = game.state.events?.spawns[e.id];
  return r?.cycle === `${day}:${i}` && r.appeared;
}
export function advanceWorld(game, dt, random = Math.random) {
  const c = game.project.world.dayNight;
  if (c?.enabled && Number.isFinite(dt) && dt > 0) {
    const total = game.state.worldTime + (dt * 24) / (c.dayMinutes * 60);
    game.state.events.day += Math.floor(total / 24);
    game.state.worldTime = total % 24;
  }
  return updateWorldEvents(game, random);
}
export function doorShouldOpen(e, game, position = game.state.position) {
  if (game.state.events?.moonActive) return true;
  const r = e.moonDoor.refuge;
  return (
    !!r &&
    position[0] >= r[0] &&
    position[0] <= r[2] &&
    position[2] >= r[1] &&
    position[2] <= r[3]
  );
}
