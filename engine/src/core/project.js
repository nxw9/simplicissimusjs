import { PlayBoundsSchema, validateWorldBounds } from "./world-bounds.js";
import { heightAt } from "./terrain.js";
import { PatrolSchema } from "./patrol.js";
import { MoonLandSchema, moonRegion, inMoonLand } from "./moon-land.js";
import { RangedSchema } from "./ranged.js";
import { LandscapeSchema, VegetationSchema } from "./landscape.js";
import {
  HeldWeaponSchema,
  SpawnSchema,
  RedMoonSchema,
  MoonDoorSchema,
  BookSchema,
  EventConditionsSchema,
  validateWorldEvents,
  eventConditions,
} from "./world-events.js";
import { RPGSchema, validateRPG } from "./rpg.js";
import { validateVideos } from "./video.js";
import { soundEvents, validateAudio } from "./audio.js";
import { DialogueSchema, validateDialogues } from "./dialogue.js";
import { questTargets } from "./quests.js";
import { z } from "zod";
export const FORMAT_VERSION = 25;
// No artificial byte limit; browser memory and storage quotas still apply.
export const MAX_PROJECT_BYTES = Infinity;
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,80}$/)
  .refine((value) => !(value in Object.prototype), "Reserved identifier");
const vec = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const EntitySchema = z
  .object({
    id,
    name: z.string().min(1).max(160),
    kind: z.enum(["prop", "npc", "item", "enemy"]),
    shape: z.enum([
      "box",
      "sphere",
      "tree",
      "rock",
      "ruin",
      "model",
      "humanoid",
      "door",
    ]),
    position: vec,
    rotation: vec,
    scale: vec.refine(
      (v) => v.every((n) => n > 0 && n <= 1000),
      "Scale must be positive and <= 1000",
    ),
    color,
    solid: z.boolean(),
    vegetation: VegetationSchema.optional(),
    patrol: PatrolSchema.optional(),
    surface: z.number().int().min(0).max(4).optional(),
    environment: z.boolean().default(false),
    collision: z.enum(["box", "meshes", "trunk", "wall"]).default("meshes"),
    assetId: id.optional(),
    gear: z
      .object({
        slot: z.enum(["none", "weapon", "head", "body", "hands", "feet"]),
        damage: z.number().int().min(1).max(10000),
        armor: z.number().min(0).max(80),
        length: z.number().min(0.2).max(2),
        grip: z.number().min(0).max(1),
        rotation: vec,
      })
      .strict()
      .optional(),
    heldWeapon: HeldWeaponSchema.optional(),
    spawn: SpawnSchema.optional(),
    moonDoor: MoonDoorSchema.optional(),
    moonOnly: z.boolean().optional(),
    book: BookSchema.optional(),
    itemOwner: id.nullable().optional(),
    startInInventory: z.boolean().optional(),
    behavior: z
      .object({
        faction: id,
        reaction: z.enum(["ignore", "flee", "fight"]),
        enemies: z.enum(["ignore", "flee", "fight"]),
        others: z.enum(["neutral", "hostile"]),
        assist: z.boolean(),
        invulnerable: z.boolean(),
        routine: z.enum(["stand", "wander"]),
        radius: z.number().min(1).max(50),
      })
      .strict()
      .optional(),
    inspection: z
      .object({ enabled: z.boolean(), description: z.string().max(4000) })
      .strict()
      .optional(),
    dialogue: z.string().max(4000).default(""),
    dialogueTree: DialogueSchema.optional(),
    npc: z
      .object({
        idle: z.string().nullable(),
        talk: z.string().nullable(),
        facing: z.number().finite(),
      })
      .strict()
      .optional(),
    motion: z
      .object({
        trigger: z.enum(["interact", "auto"]),
        condition: z.enum(["none", "quest", "item", "enemy"]),
        target: id.nullable(),
        offset: vec.refine(
          (v) => v.every((x) => Math.abs(x) <= 100),
          "Смещение до 100 м",
        ),
        rotation: vec.refine(
          (v) => v.every((x) => Math.abs(x) <= Math.PI * 2),
          "Поворот до 360°",
        ),
        pivot: z.enum(["origin", "left", "right"]),
        duration: z.number().min(0.1).max(60),
      })
      .strict()
      .optional(),
    enemy: z
      .object({
        ranged: RangedSchema.optional(),
        speed: z.number().min(0).max(10),
        notice: z.number().min(1).max(100),
        reach: z.number().min(0.5).max(5),
        damage: z.number().int().min(1).max(100),
        duration: z.number().min(0.3).max(5),
        cooldown: z.number().min(0.3).max(10),
        impact: z.number().min(0.1).max(0.9),
        facing: z.number().finite(),
        idle: z.string().nullable(),
        walk: z.string().nullable(),
        attack: z.string().nullable(),
        death: z.string().nullable().default(null),
        animationSources: z
          .object({
            idle: id.optional(),
            walk: id.optional(),
            attack: id.optional(),
            death: id.optional(),
          })
          .strict()
          .default({}),
        corpseAssetId: id.nullable().default(null),
        corpseScale: z.number().min(0.001).max(1000).default(1),
        corpseFacing: z.number().finite().default(0),
      })
      .strict()
      .optional(),
    health: z.number().int().min(1).max(10000).default(40),
  })
  .strict();
const ProjectSchema = z
  .object({
    format: z.literal("hearth-project"),
    schemaVersion: z.literal(FORMAT_VERSION),
    id,
    title: z.string().min(1).max(160),
    contentVersion: z.number().int().min(1),
    presentation: z
      .object({ theme: z.enum(["classic", "chronicle"]) })
      .strict()
      .optional(),
    weapon: z
      .object({
        assetId: id.nullable(),
        rotation: vec,
        length: z.number().min(0.2).max(2),
        grip: z.number().min(0).max(1),
      })
      .strict()
      .nullable(),
    world: z
      .object({
        size: z.number().min(20).max(2000),
        playBounds: PlayBoundsSchema.nullable().optional(),
        redMoon: RedMoonSchema.optional(),
        moonLand: MoonLandSchema.optional(),
        landscape: LandscapeSchema.optional(),
        dayNight: z
          .object({
            enabled: z.boolean(),
            dayMinutes: z.number().min(1).max(10080),
            startHour: z.number().min(0).lt(24),
          })
          .strict()
          .nullable()
          .default(null),
        sky: color,
        ground: color,
        spawn: vec,
        terrain: z
          .object({
            paint: z
              .array(z.number().int().min(0).max(4))
              .max(1050625)
              .optional(),
            resolution: z.number().int().min(16).max(1024),
            heights: z.array(z.number().finite().min(-80).max(80)).max(1050625),
            regions: z
              .array(
                z
                  .object({
                    id,
                    name: z.string().min(1).max(160),
                    min: z.tuple([z.number().finite(), z.number().finite()]),
                    max: z.tuple([z.number().finite(), z.number().finite()]),
                  })
                  .strict(),
              )
              .max(128),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    videos: z
      .array(
        z
          .object({ id, name: z.string().min(1).max(200), data: z.string() })
          .strict(),
      )
      .max(500)
      .optional(),
    audio: z
      .object({
        rpg: RPGSchema.optional(),
        assets: z
          .array(
            z
              .object({
                id,
                name: z.string().min(1).max(200),
                data: z.string(),
              })
              .strict(),
          )
          .max(500),
        sounds: z
          .object(
            Object.fromEntries(
              Object.keys(soundEvents).map((key) => [
                key,
                id.nullable().optional(),
              ]),
            ),
          )
          .strict(),
      })
      .strict()
      .optional(),
    rpg: RPGSchema.optional(),
    assets: z
      .array(
        z
          .object({
            id,
            name: z.string().max(200),
            data: z.string().startsWith("data:model/gltf-binary;base64,"),
          })
          .strict(),
      )
      .max(200),
    entities: z.array(EntitySchema).max(20000),
    quests: z
      .array(
        z
          .object({
            id,
            title: z.string().min(1).max(200),
            giver: id,
            target: id,
            targets: z.array(id).min(1).max(1000).optional(),
            required: z.number().int().min(1).max(10000),
            type: z.enum(["collect", "defeat"]),
            reward: z.number().int().min(0).max(100000),
            conditions: EventConditionsSchema.optional(),
            main: z.boolean().optional(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export function validateProject(input) {
  const p = ProjectSchema.parse(input);
  validateWorldBounds(p.world);
  for (const [label, list] of [
    ["entities", p.entities],
    ["assets", p.assets],
    ["quests", p.quests],
  ]) {
    if (new Set(list.map((v) => v.id)).size !== list.length)
      throw Error(`Повторяющиеся ID: ${label}`);
  }
  const entities = new Map(p.entities.map((e) => [e.id, e]));
  const assets = new Set(p.assets.map((a) => a.id));
  if (p.weapon?.assetId && !assets.has(p.weapon.assetId))
    throw Error("Не найдена модель оружия");
  for (const e of p.entities)
    if (e.shape === "model" && (!e.assetId || !assets.has(e.assetId)))
      throw Error(`Не найдена модель: ${e.name}`);
  for (const e of p.entities)
    if (e.enemy?.corpseAssetId && !assets.has(e.enemy.corpseAssetId))
      throw Error(`Не найдена модель трупа: ${e.name}`);
  for (const e of p.entities)
    for (const source of Object.values(e.enemy?.animationSources ?? {}))
      if (!assets.has(source))
        throw Error(`Не найден файл анимации: ${e.name}`);
  for (const e of p.entities) {
    const ranged = e.enemy?.ranged;
    if (ranged?.assetId && !assets.has(ranged.assetId)) throw Error(`Не найдена модель снаряда: ${e.name}`);
    if (ranged && !["enemy", "npc"].includes(e.kind)) throw Error("Дальний бой доступен только персонажам.");
  }
  if (p.world.moonLand) {
    const r = moonRegion(p.world), pos = p.world.moonLand.returnPosition;
    if (!r) throw Error("Выберите существующий участок для острова красной луны.");
    const water = p.rpg?.water.height ?? 0;
    if (p.world.moonLand.dormantHeight >= water - 0.2) throw Error("Высота дна временного участка должна быть ниже воды.");
    if (heightAt(p.world, pos[0], pos[2]) <= water + 0.2) throw Error("Точка возврата должна находиться на суше.");
    if (inMoonLand(p.world, pos, 1) || Math.abs(pos[0]) > p.world.size / 2 || Math.abs(pos[2]) > p.world.size / 2) throw Error("Точка возврата должна быть на берегу вне временного участка.");
  }
  for (const q of p.quests) {
    if (entities.get(q.giver)?.kind !== "npc")
      throw Error(`У квеста ${q.title} отсутствует NPC`);
    if (
      q.targets &&
      (q.target !== q.targets[0] ||
        new Set(q.targets).size !== q.targets.length)
    )
      throw Error(`Некорректный список целей квеста: ${q.title}`);
    if (
      questTargets(q).some(
        (target) =>
          entities.get(target)?.kind !==
          (q.type === "collect" ? "item" : "enemy"),
      )
    )
      throw Error(`Неверная цель квеста: ${q.title}`);
    if (q.required !== 1)
      throw Error(
        "required должен быть равен 1: для каждого выбранного ID требуется одна победа.",
      );
  }
  for (const e of p.entities) {
    if (e.npc && e.kind !== "npc")
      throw Error("Анимации NPC можно назначать только NPC");
    if (e.motion) {
      const m = e.motion;
      if (e.kind !== "prop")
        throw Error("Движение механизма доступно для объектов");
      if (m.condition === "quest" && !p.quests.some((q) => q.id === m.target))
        throw Error("Выберите существующий квест для механизма");
      if (
        ["item", "enemy"].includes(m.condition) &&
        entities.get(m.target)?.kind !== m.condition
      )
        throw Error("Неверная цель условия механизма");
      if (m.condition === "none" && m.target !== null)
        throw Error("Для свободного механизма цель не требуется");
    }
  }
  if (
    Math.abs(p.world.spawn[0]) > p.world.size / 2 ||
    Math.abs(p.world.spawn[2]) > p.world.size / 2
  )
    throw Error("Точка появления вне мира");
  for (const e of p.entities) if (e.patrol) {
    if (!["enemy", "npc"].includes(e.kind)) throw Error("Маршрут можно назначить только врагу или NPC.");
    for (const point of e.patrol.points) {
      if (point.some(v => Math.abs(v) > p.world.size / 2)) throw Error(`Маршрут «${e.name}» выходит за рельеф карты.`);
    }
  }
  const terrain = p.world.terrain;
  if (terrain) {
    const n = terrain.resolution,
      step = p.world.size / n,
      half = p.world.size / 2;
    if (terrain.paint && terrain.paint.length !== (n + 1) ** 2)
      throw Error("Неверный размер карты материалов");
    if (terrain.heights.length !== (n + 1) ** 2)
      throw Error("Неверный размер карты высот");
    if (
      new Set(terrain.regions.map((r) => r.id)).size !== terrain.regions.length
    )
      throw Error("Повторяющиеся ID участков");
    for (const r of terrain.regions)
      for (let axis = 0; axis < 2; axis++) {
        if (
          r.min[axis] < -half ||
          r.max[axis] > half ||
          r.max[axis] - r.min[axis] < step * 3 - 1e-7
        )
          throw Error("Некорректные границы участка");
        for (const coordinate of [r.min[axis], r.max[axis]])
          if (
            Math.abs(
              (coordinate + half) / step -
                Math.round((coordinate + half) / step),
            ) > 1e-6
          )
            throw Error("Граница участка должна совпадать с сеткой");
      }
    // Heightfield borders may lie below sea level. Forcing zero creates an artificial square shore.
  }
  for (const e of p.entities)
    if (e.inspection && !["item", "prop"].includes(e.kind))
      throw Error("Осмотр доступен для предметов и окружения");
  for (const e of p.entities) {
    if ((e.gear || e.itemOwner || e.startInInventory) && e.kind !== "item")
      throw Error("Экипировка и владелец доступны только предмету");
    if (
      e.itemOwner &&
      (!["npc", "enemy"].includes(entities.get(e.itemOwner)?.kind) ||
        e.startInInventory)
    )
      throw Error("Выберите одного владельца предмета");
    if (e.behavior && !["npc", "enemy"].includes(e.kind))
      throw Error("Поведение доступно только персонажам");
  }
  validateWorldEvents(p);
  validateRPG(p);
  validateDialogues(p);
  validateAudio(p);
  validateVideos(p);
  return p;
}
export function readProject(raw) {
  const input =
    typeof raw === "string" ? JSON.parse(raw) : structuredClone(raw);
  if (!input || input.format !== "hearth-project")
    throw Error("Это не проект Hearth");
  if (
    !Number.isInteger(input.schemaVersion) ||
    input.schemaVersion < 0 ||
    input.schemaVersion > FORMAT_VERSION
  )
    throw Error("Неподдерживаемая версия проекта. Исходный файл не изменён.");
  // The v0 fixture had no contentVersion or per-entity health/dialogue.
  if (input.schemaVersion === 0) {
    input.contentVersion = 1;
    input.schemaVersion = 1;
  }
  if (input.schemaVersion === 1) {
    if (!input.world || Object.hasOwn(input.world, "terrain"))
      throw Error("Некорректный проект v1");
    input.world.terrain = null;
    input.schemaVersion = 2;
  }
  if (input.schemaVersion === 2) {
    if (Object.hasOwn(input, "weapon")) throw Error("Некорректный проект v2");
    input.weapon = null;
    input.schemaVersion = 3;
  }
  if (input.schemaVersion === 3) input.schemaVersion = 4;
  if (input.schemaVersion === 4) input.schemaVersion = 5;
  if (input.schemaVersion === 5) input.schemaVersion = 6;
  if (input.schemaVersion === 6) input.schemaVersion = 7;
  if (input.schemaVersion === 7) input.schemaVersion = 8;
  if (input.schemaVersion === 8) input.schemaVersion = 9;
  if (input.schemaVersion === 9) input.schemaVersion = 10;
  if (input.schemaVersion === 10) input.schemaVersion = 11;
  if (input.schemaVersion === 11) input.schemaVersion = 12;
  if (input.schemaVersion === 12) input.schemaVersion = 13;
  if (input.schemaVersion === 13) input.schemaVersion = 14;
  if (input.schemaVersion === 14) input.schemaVersion = 15;
  if (input.schemaVersion === 15) input.schemaVersion = 16;
  if (input.schemaVersion === 16) input.schemaVersion = 17;
  if (input.schemaVersion === 17) input.schemaVersion = 18;
  if (input.schemaVersion === 18) input.schemaVersion = 19;
  if (input.schemaVersion === 19) input.schemaVersion = 20;
  if (input.schemaVersion === 20) input.schemaVersion = 21;
  if (input.schemaVersion === 21) input.schemaVersion = 22;
  if (input.schemaVersion === 22) input.schemaVersion = 23;
  if (input.schemaVersion === 23) input.schemaVersion = 24;
  if (input.schemaVersion === 24) input.schemaVersion = 25;
  return validateProject(input);
}
export function serializeProject(p) {
  return JSON.stringify(validateProject(p), null, 2);
}
export function createEntity(kind = "prop", shape = "box") {
  return EntitySchema.parse({
    id: crypto.randomUUID(),
    name: {
      prop: "Новый объект",
      npc: "Персонаж",
      item: "Предмет",
      enemy: "Противник",
    }[kind],
    kind,
    shape,
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: kind === "enemy" ? "#ab5746" : "#b5bb9f",
    solid: kind === "prop",
  });
}

// Rename references together; old released saves must not silently bind to a new ID.
export function renameEntity(project, oldId, newId) {
  id.parse(newId);
  if (oldId === newId) return;
  if (project.entities.some((e) => e.id === newId))
    throw Error("Этот ID уже занят другим объектом.");
  const entity = project.entities.find((e) => e.id === oldId);
  if (!entity) throw Error("Враг не найден.");
  entity.id = newId;
  for (const e of project.entities)
    if (e.itemOwner === oldId) e.itemOwner = newId;
  for (const q of project.quests) {
    if (q.target === oldId) q.target = newId;
    if (q.targets)
      q.targets = q.targets.map((target) =>
        target === oldId ? newId : target,
      );
    if (q.giver === oldId) q.giver = newId;
  }
  for (const e of project.entities)
    if (
      e.motion &&
      ["item", "enemy"].includes(e.motion.condition) &&
      e.motion.target === oldId
    )
      e.motion.target = newId;
  for (const e of project.entities)
    for (const node of e.dialogueTree?.nodes ?? [])
      for (const condition of [
        ...(node.conditions ?? []),
        ...node.choices.flatMap((choice) => choice.conditions),
      ])
        if (!condition.kind.startsWith("quest") && condition.target === oldId)
          condition.target = newId;
  if (project.rpg) {
    const c = project.rpg;
    for (const k of Object.keys(c.services))
      if (c.services[k] === oldId) c.services[k] = newId;
    if (c.ship.entity === oldId) c.ship.entity = newId;
    for (const r of Object.values(c.rewards))
      r.items = r.items.map((x) => (x === oldId ? newId : x));
    for (const r of Object.values(c.requirements)) {
      r.items = r.items.map((x) => (x === oldId ? newId : x));
      r.enemies = r.enemies.map((x) => (x === oldId ? newId : x));
    }
    for (const record of [c.requirements, c.enemyRewards, c.pickups])
      if (Object.hasOwn(record, oldId)) {
        record[newId] = record[oldId];
        delete record[oldId];
      }
  }
  for (const c of eventConditions(project))
    if (!c.kind.startsWith("quest") && c.target === oldId) c.target = newId;
  project.contentVersion++;
}
