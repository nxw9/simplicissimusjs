import { insideWorld } from "./world-bounds.js";
import { moonRuntimeProject, eventEntityPresent, syncMoonLand, evacuateMoonLand } from "./moon-land.js";
import {
  EventStateSchema,
  initialEvents,
  conditionsMatch,
  updateWorldEvents,
} from "./world-events.js";
import {
  initialRPG,
  RPGStateSchema,
  collectionBlocked,
  gainXP,
} from "./rpg.js";
import { SLOTS, gearConfig, behaviorConfig } from "./equipment.js";
import { questTargets } from "./quests.js";
import { z } from "zod";
import { mountConfig, mountEyeOffset } from "./mount.js";
import { heightAt, groundPosition } from "./terrain.js";
const StateSchema = z
  .object({
    format: z.literal("hearth-save"),
    schemaVersion: z.literal(8),
    events: EventStateSchema,
    worldTime: z.number().min(0).lt(24),
    projectId: z.string(),
    contentVersion: z.number().int(),
    position: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ]),
    health: z.number().min(0).max(10000),
    rpg: RPGStateSchema.optional(),
    gold: z.number().int().nonnegative(),
    inventory: z.array(z.string()),
    defeated: z.array(z.string()),
    defaultWeapon: z.boolean().default(true),
    equipped: z.record(z.string(), z.string()),
    actorHealth: z.record(z.string(), z.number().finite().nonnegative()),
    aggression: z.record(z.string(), z.string()),
    droppedItems: z.record(
      z.string(),
      z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    ),
    corpses: z.record(
      z.string(),
      z
        .object({
          position: z.tuple([
            z.number().finite(),
            z.number().finite(),
            z.number().finite(),
          ]),
          rotation: z.tuple([
            z.number().finite(),
            z.number().finite(),
            z.number().finite(),
          ]),
        })
        .strict(),
    ),
    mechanisms: z.record(
      z.string(),
      z
        .object({ open: z.boolean(), progress: z.number().min(0).max(1) })
        .strict(),
    ),
    quests: z.record(z.string(), z.enum(["active", "complete"])),
  })
  .strict();
export class GameState {
  constructor(project) {
    this.sourceWorld = project.world;
    this.project = moonRuntimeProject(project);
    project = this.project;
    this.state = {
      format: "hearth-save",
      schemaVersion: 8,
      events: initialEvents(),
      worldTime: project.world.dayNight?.startHour ?? 9,
      projectId: project.id,
      contentVersion: project.contentVersion,
      position: groundPosition(project.world, project.world.spawn),
      health: 100,
      gold: 0,
      inventory: project.entities
        .filter((e) => e.kind === "item" && e.startInInventory)
        .map((e) => e.id),
      defaultWeapon: true,
      equipped: {},
      actorHealth: {},
      aggression: {},
      defeated: [],
      droppedItems: {},
      corpses: {},
      quests: {},
      mechanisms: {},
    };
    if (project.rpg) this.state.rpg = initialRPG(project);
    this.hp = new Map();
    updateWorldEvents(this);
  }
  get maxHealth() {
    return 100 + ((this.state.rpg?.level ?? 1) - 1) * 20;
  }
  drink() {
    const r = this.state.rpg;
    if (!r || !this.alive || !r.potions || this.state.health >= this.maxHealth)
      return false;
    r.potions--;
    this.state.health = Math.min(
      this.maxHealth,
      this.state.health + this.project.rpg.potionHeal,
    );
    return true;
  }
  rest() {
    if (!this.alive || !this.state.rpg) return false;
    this.state.health = this.maxHealth;
    this.state.rpg.stamina = 100;
    this.state.rpg.potions = Math.max(2, this.state.rpg.potions);
    return true;
  }
  buyPotion() {
    if (
      !this.alive ||
      !this.state.rpg ||
      this.state.gold < this.project.rpg.potionCost
    )
      return false;
    this.state.gold -= this.project.rpg.potionCost;
    this.state.rpg.potions++;
    return true;
  }
  upgradeWeapon() {
    const r = this.state.rpg,
      cost = this.project.rpg?.upgradeCosts[r?.upgrade];
    if (!this.alive || cost === undefined || this.state.gold < cost)
      return false;
    this.state.gold -= cost;
    r.upgrade++;
    return true;
  }
  get alive() {
    return this.state.health > 0;
  }
  collected(id) {
    return (
      this.state.inventory.includes(id) || this.state.defeated.includes(id)
    );
  }
  questProgress(q) {
    const targets = questTargets(q),
      remaining = targets.filter((id) => !this.collected(id));
    return {
      done: targets.length - remaining.length,
      total: targets.length,
      ready: remaining.length === 0,
      remaining,
    };
  }
  canQuestAction(type, id, giver) {
    const q = this.project.quests.find((q) => q.id === id && q.giver === giver);
    if (!this.alive || !q || !conditionsMatch(q.conditions ?? [], "all", this))
      return false;
    return type === "accept"
      ? !this.state.quests[id]
      : type === "complete" &&
          this.state.quests[id] === "active" &&
          this.questProgress(q).ready;
  }
  questAction(type, id, giver) {
    if (!this.canQuestAction(type, id, giver)) return false;
    const q = this.project.quests.find((q) => q.id === id);
    this.state.quests[id] = type === "accept" ? "active" : "complete";
    if (type === "complete") {
      this.state.gold += q.reward;
      const r = this.project.rpg?.rewards[id];
      if (r) {
        gainXP(this, r.xp);
        this.state.rpg.potions += r.potions;
        for (const item of r.items)
          if (!this.state.inventory.includes(item))
            this.state.inventory.push(item);
      }
    }
    return true;
  }
  talk(id) {
    const npc = this.project.entities.find(
      (e) => e.id === id && e.kind === "npc",
    );
    if (!npc || !this.alive) return "";
    return [
      npc.dialogue,
      ...this.project.quests
        .filter((q) => q.giver === id)
        .map((q) => {
          const progress = this.questProgress(q);
          const names = (
            this.state.quests[q.id] ? progress.remaining : questTargets(q)
          )
            .map((id) => this.project.entities.find((e) => e.id === id)?.name)
            .join(", ");
          return `${q.title}: ${this.state.quests[q.id] === "complete" ? "задание сдано" : this.state.quests[q.id] === "active" ? `${progress.done}/${progress.total}${progress.ready ? " — можно сдать" : ""}` : `награда ${q.reward} золота`}${names ? `\n${q.type === "defeat" ? "Победить" : "Найти и забрать"}: ${names}` : ""}`;
        }),
    ].join("\n");
  }
  collect(id) {
    if (!this.alive) return false;
    const e = this.project.entities.find((e) => e.id === id);
    if (
      e?.kind !== "item" ||
      !eventEntityPresent(e, this.project.world, this.state) ||
      collectionBlocked(this.project, this.state, id) ||
      this.collected(id) ||
      (e.itemOwner && !this.state.droppedItems[id])
    )
      return false;
    delete this.state.droppedItems[id];
    this.state.inventory.push(id);
    if (
      this.state.rpg &&
      this.project.rpg.pickups[id] &&
      !this.state.rpg.usedPickups.includes(id)
    ) {
      this.state.rpg.potions += this.project.rpg.pickups[id];
      this.state.rpg.usedPickups.push(id);
    }
    return true;
  }
  drop(id, position) {
    if (
      !this.alive ||
      !this.state.inventory.includes(id) ||
      !Array.isArray(position) ||
      position.length !== 3 ||
      !position.every(Number.isFinite) ||
      !insideWorld(this.project.world,position[0],position[2],0)
    )
      return false;
    for (const slot of Object.keys(this.state.equipped))
      if (this.state.equipped[slot] === id) delete this.state.equipped[slot];
    this.state.inventory = this.state.inventory.filter((x) => x !== id);
    this.state.droppedItems[id] = [...position];
    return true;
  }
  lootItems(owner) {
    if (!this.state.defeated.includes(owner)) return [];
    return this.project.entities.filter(
      (e) =>
        e.kind === "item" &&
        e.itemOwner === owner &&
        !this.state.inventory.includes(e.id) &&
        !this.state.droppedItems[e.id],
    );
  }
  loot(owner, id) {
    if (!this.alive || !this.lootItems(owner).some((e) => e.id === id))
      return false;
    this.state.inventory.push(id);
    return true;
  }
  equip(id) {
    const e = this.project.entities.find((e) => e.id === id),
      slot = e?.gear?.slot;
    if (!this.alive || !this.state.inventory.includes(id) || !SLOTS[slot])
      return false;
    if (slot === "weapon") this.state.defaultWeapon = false;
    this.state.equipped[slot] = id;
    return true;
  }
  unequip(slot) {
    if (!SLOTS[slot]) return false;
    delete this.state.equipped[slot];
    if (slot === "weapon") this.state.defaultWeapon = false;
    return true;
  }
  get attackDamage() {
    const e = this.project.entities.find(
      (e) => e.id === this.state.equipped.weapon,
    );
    return (
      (e ? gearConfig(e).damage : this.state.rpg ? 22 : 20) +
      (this.state.rpg
        ? this.state.rpg.upgrade * 12 + this.state.rpg.level * 3
        : 0)
    );
  }
  get armor() {
    return Math.min(
      80,
      Object.entries(this.state.equipped).reduce(
        (n, [slot, id]) =>
          n +
          (slot === "weapon"
            ? 0
            : gearConfig(this.project.entities.find((e) => e.id === id)).armor),
        0,
      ),
    );
  }
  hit(id, damage = this.attackDamage, attacker = "$player") {
    if (
      !this.alive ||
      this.state.defeated.includes(id) ||
      !Number.isFinite(damage) ||
      damage <= 0
    )
      return false;
    const e = this.project.entities.find((e) => e.id === id);
    if (!["enemy", "npc"].includes(e?.kind) || behaviorConfig(e).invulnerable)
      return false;
    this.state.aggression[id] = attacker;
    const hp = Math.max(
      0,
      (this.state.actorHealth[id] ?? this.hp.get(id) ?? e.health) - damage,
    );
    this.hp.set(id, hp);
    this.state.actorHealth[id] = hp;
    if (hp === 0) {
      this.state.defeated.push(id);
      const reward = this.project.rpg?.enemyRewards[id];
      if (reward) {
        this.state.gold += reward.gold;
        gainXP(this, reward.xp);
      }
      return true;
    }
    return false;
  }
  damage(amount) {
    if (this.guarding && this.state.rpg?.stamina >= 18 && amount < 500) {
      amount = Math.max(1, Math.round(amount * 0.25));
      this.state.rpg.stamina -= 18;
    }
    if (Number.isFinite(amount) && amount > 0)
      this.state.health = Math.max(
        0,
        this.state.health -
          Math.max(1, Math.round(amount * (1 - this.armor / 100))),
      );
  }
  save() {
    return JSON.stringify(StateSchema.parse(this.state));
  }
  load(raw) {
    const input = JSON.parse(raw);
    if (input?.schemaVersion === 1) {
      if (Object.hasOwn(input, "mechanisms"))
        throw Error("Некорректный сейв v1");
      input.schemaVersion = 2;
      input.mechanisms = {};
    }
    if (input?.schemaVersion === 2) {
      if (Object.hasOwn(input, "corpses")) throw Error("Некорректный сейв v2");
      input.schemaVersion = 3;
      input.corpses = {};
    }
    if (input?.schemaVersion === 3) {
      if (Object.hasOwn(input, "worldTime"))
        throw Error("Некорректный сейв v3");
      input.schemaVersion = 4;
      input.worldTime = this.project.world.dayNight?.startHour ?? 9;
    }
    if (input?.schemaVersion === 4) {
      if (Object.hasOwn(input, "droppedItems"))
        throw Error("Некорректный сейв v4");
      input.schemaVersion = 5;
      input.droppedItems = {};
    }
    if (input?.schemaVersion === 5) {
      input.schemaVersion = 6;
      input.equipped ??= {};
      input.actorHealth ??= {};
      input.aggression ??= {};
    }
    if (input?.schemaVersion === 6) input.schemaVersion = 7;
    if (input?.schemaVersion === 7) {
      input.schemaVersion = 8;
      input.events ??= initialEvents();
    }
    const next = StateSchema.parse(input);
    if (
      next.projectId !== this.project.id ||
      next.contentVersion !== this.project.contentVersion
    )
      throw Error(
        "Сохранение относится к другому проекту или версии контента.",
      );
    if (this.project.rpg) {
      next.rpg ??= initialRPG(this.project);
      if (
        next.rpg.usedPickups.some((id) => !this.project.rpg.pickups[id]) ||
        new Set(next.rpg.usedPickups).size !== next.rpg.usedPickups.length
      )
        throw Error("Некорректные припасы");
      if (
        next.rpg.upgrade > this.project.rpg.upgradeCosts.length ||
        next.health > 100 + (next.rpg.level - 1) * 20
      )
        throw Error("Некорректные параметры RPG");

    } else if (next.rpg || next.health > 100)
      throw Error("Некорректное здоровье");
    const ids = new Map(this.project.entities.map((e) => [e.id, e.kind]));
    if (
      next.inventory.some((id) => ids.get(id) !== "item") ||
      next.defeated.some((id) => !["enemy", "npc"].includes(ids.get(id)))
    )
      throw Error("Сохранение ссылается на отсутствующие объекты.");
    if (
      Object.keys(next.mechanisms).some(
        (id) => !this.project.entities.some((e) => e.id === id && e.motion),
      )
    )
      throw Error("Неизвестный механизм в сохранении");
    for (const [id, corpse] of Object.entries(next.corpses)) {
      if (
        !next.defeated.includes(id) ||
        !["enemy", "npc"].includes(ids.get(id))
      )
        throw Error("Неизвестный труп в сохранении");

    }
    if (new Set(next.inventory).size !== next.inventory.length)
      throw Error("Повтор предмета в инвентаре");
    for (const [id, position] of Object.entries(next.droppedItems)) {
      if (
        ids.get(id) !== "item" ||
        next.inventory.includes(id)
      )
        throw Error("Некорректный выброшенный предмет");
    }
    for (const [slot, id] of Object.entries(next.equipped)) {
      if (
        !SLOTS[slot] ||
        !next.inventory.includes(id) ||
        this.project.entities.find((e) => e.id === id)?.gear?.slot !== slot
      )
        throw Error("Некорректная экипировка");
    }
    for (const [id, hp] of Object.entries(next.actorHealth)) {
      const e = this.project.entities.find((e) => e.id === id);
      if (
        !["enemy", "npc"].includes(e?.kind) ||
        hp > e.health ||
        (hp === 0) !== next.defeated.includes(id)
      )
        throw Error("Некорректное здоровье персонажа");
    }
    for (const [id, target] of Object.entries(next.aggression))
      if (
        !["enemy", "npc"].includes(ids.get(id)) ||
        (target !== "$player" && !["enemy", "npc"].includes(ids.get(target)))
      )
        throw Error("Некорректная цель персонажа");
    const quests = new Set(this.project.quests.map((q) => q.id));
    if (Object.keys(next.quests).some((id) => !quests.has(id)))
      throw Error("Неизвестный квест в сохранении.");

    for (const entityId of Object.keys(next.events.spawns))
      if (!this.project.entities.some((e) => e.id === entityId && e.spawn))
        throw Error("Неизвестная точка появления в сохранении");
    for (const entityId of Object.keys(next.events.doors))
      if (!this.project.entities.some((e) => e.id === entityId && e.moonDoor))
        throw Error("Неизвестная лунная дверь в сохранении");
    if (
      new Set(next.events.readBooks).size !== next.events.readBooks.length ||
      next.events.readBooks.some(
        (id) => !this.project.entities.some((e) => e.id === id && e.book),
      )
    )
      throw Error("Неизвестная книга в сохранении");
    this.state = next;
    this.moonLandActive = undefined;
    syncMoonLand(this);
    evacuateMoonLand(this);
    if (next.rpg?.mounted) {
      const horse = next.rpg.horsePosition;
      horse[1] = heightAt(this.project.world, horse[0], horse[2]);
      const offset = mountEyeOffset(mountConfig(this.project), next.rpg.horseYaw);
      next.position = horse.map((n, i) => n + offset[i]);
    } else next.position = groundPosition(this.project.world, next.position);
    // A saved character outside newly authored bounds returns to the valid start, not a locked corner.
    if (this.project.world.playBounds && !insideWorld(this.project.world,next.position[0],next.position[2])) {
      if(next.rpg)next.rpg.mounted=false;
      next.position=groundPosition(this.project.world,this.project.world.spawn);
    }
    this.hp.clear();
  }
}
export class History {
  constructor(limit = 40) {
    this.undoStack = [];
    this.redoStack = [];
    this.limit = limit;
  }
  push(p) {
    this.undoStack.push(structuredClone(p));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  undo(current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(structuredClone(current));
    return this.undoStack.pop();
  }
  redo(current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(structuredClone(current));
    return this.redoStack.pop();
  }
}
