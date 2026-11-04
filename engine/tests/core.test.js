import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { demoProject } from "../src/core/demo.js";
import {
  readProject,
  serializeProject,
  createEntity,
} from "../src/core/project.js";
import { GameState, History } from "../src/core/game.js";

test("demo survives serialization without losing any fields", () => {
  const p = demoProject();
  assert.deepEqual(readProject(serializeProject(p)), p);
});
test("v0 fixture migrates without mutating source", async () => {
  const old = JSON.parse(
    await readFile(new URL("./fixtures/v0.json", import.meta.url), "utf8"),
  );
  const snapshot = structuredClone(old);
  const p = readProject(old);
  assert.equal(p.schemaVersion, 25);
  assert.equal(p.contentVersion, 1);
  assert.equal(p.entities[0].health, 40);
  assert.deepEqual(old, snapshot);
});
test("future schemas and unknown fields are rejected, not stripped", () => {
  const p = demoProject();
  p.schemaVersion = 99;
  assert.throws(() => readProject(p), /Неподдерживаемая/);
  p.schemaVersion = 2;
  p.unrecognized = "data";
  assert.throws(() => readProject(p));
});
test("invalid foreign keys and duplicate ids are rejected", () => {
  const p = demoProject();
  p.quests[0].target = "missing";
  assert.throws(() => readProject(p), /цель/);
  const q = demoProject();
  q.entities.push(q.entities[0]);
  assert.throws(() => readProject(q), /Повторяющиеся/);
});
test("invalid transform and model reference are rejected", () => {
  const p = demoProject();
  p.entities[0].position[0] = NaN;
  assert.throws(() => readProject(p));
  p.entities[0].position[0] = 0;
  p.entities[0].scale[0] = 0;
  assert.throws(() => readProject(p));
  const q = demoProject();
  q.entities[0].shape = "model";
  assert.throws(() => readProject(q), /модель/);
});
test("quest starts, item collected, rewards issued exactly once across save/load", () => {
  const p = demoProject(),
    g = new GameState(p);
  g.questAction("accept", "first-fire", "warden");
  assert.equal(g.state.quests["first-fire"], "active");
  assert.equal(g.collect("shard"), true);
  assert.equal(g.collect("shard"), false);
  g.questAction("complete", "first-fire", "warden");
  assert.equal(g.state.gold, 25);
  assert.equal(g.state.quests["first-fire"], "complete");
  const h = new GameState(p);
  h.load(g.save());
  h.questAction("complete", "first-fire", "warden");
  assert.equal(h.state.gold, 25);
});
test("collect before accepting quest is supported", () => {
  const g = new GameState(demoProject());
  g.collect("shard");
  g.questAction("accept", "first-fire", "warden");
  g.questAction("complete", "first-fire", "warden");
  assert.equal(g.state.quests["first-fire"], "complete");
  assert.equal(g.state.gold, 25);
});
test("defeat quest and dead player behavior", () => {
  const p = demoProject();
  p.quests[0].target = "sentinel";
  p.quests[0].type = "defeat";
  const g = new GameState(p);
  assert.equal(g.hit("sentinel"), false);
  assert.equal(g.hit("sentinel"), false);
  assert.equal(g.hit("sentinel"), true);
  assert.equal(g.hit("sentinel"), false);
  g.questAction("accept", "first-fire", "warden");
  g.questAction("complete", "first-fire", "warden");
  assert.equal(g.state.gold, 25);
  g.damage(500);
  assert.equal(g.alive, false);
  assert.equal(g.collect("shard"), false);
  assert.equal(g.state.health, 0);
});
test("wrong project/version saves cannot overwrite active state", () => {
  const g = new GameState(demoProject());
  for (const patch of [
    { projectId: "other" },
    { contentVersion: 2 },
    { schemaVersion: 99 },
    { inventory: ["missing"] },
    { quests: { unknown: "active" } },
    { position: [Infinity, 0, 0] },
    { health: 101 },
  ]) {
    const original = g.save();
    const invalid = { ...JSON.parse(original), ...patch };
    assert.throws(() => g.load(JSON.stringify(invalid)));
    assert.equal(g.save(), original);
  }
});
test("history is isolated and respects redo invalidation", () => {
  const h = new History(2),
    p = demoProject();
  h.push(p);
  p.title = "Changed";
  const old = h.undo(p);
  assert.notEqual(old.title, p.title);
  assert.equal(h.redo(old).title, "Changed");
  h.push(old);
  assert.equal(h.redo(p), null);
});
test("new entities have independent stable identifiers", () => {
  const a = createEntity(),
    b = createEntity();
  assert.notEqual(a.id, b.id);
  assert.equal(a.health, 40);
});

test("quest identifiers cannot collide with object prototype properties", () => {
  for (const id of ["__proto__", "constructor", "toString"]) {
    const p = demoProject();
    p.quests[0].id = id;
    assert.throws(() => readProject(p));
  }
});

test("enemy ID changes rewrite quest and mechanism references and invalidate old content saves", async () => {
  const { renameEntity } = await import("../src/core/project.js");
  const { defaultMotion } = await import("../src/core/mechanisms.js");
  const p = demoProject(),
    enemy = p.entities.find((e) => e.kind === "enemy"),
    giver = p.entities.find((e) => e.kind === "npc");
  p.quests = [
    {
      id: "hunt",
      title: "Hunt",
      giver: giver.id,
      target: enemy.id,
      type: "defeat",
      required: 1,
      reward: 10,
    },
  ];
  const door = createEntity("prop", "door");
  door.motion = {
    ...defaultMotion(true),
    condition: "enemy",
    target: enemy.id,
  };
  p.entities.push(door);
  const save = new GameState(p).save(),
    version = p.contentVersion;
  renameEntity(p, enemy.id, "ruin_guard");
  const validated = readProject(p);
  assert.equal(p.contentVersion, version + 1);
  assert.equal(p.quests[0].target, "ruin_guard");
  assert.equal(door.motion.target, "ruin_guard");
  assert.throws(() => new GameState(validated).load(save), /версии контента/);
  assert.throws(() => renameEntity(p, "ruin_guard", giver.id), /занят/);
  assert.throws(() => renameEntity(p, "ruin_guard", "bad id"));
  assert.throws(() => renameEntity(p, "ruin_guard", "__proto__"));
});

test("the actual 0.8 shipped v5 world opens as v6 without rewriting its content", async () => {
  const old = JSON.parse(
    await readFile(new URL("./fixtures/v5.json", import.meta.url), "utf8"),
  );
  const before = structuredClone(old),
    next = readProject(old);
  assert.equal(next.schemaVersion, 25);
  assert.deepEqual(
    next.entities,
    old.entities.map((e) => ({
      ...e,
      collision: "meshes",
      environment: false,
    })),
  );
  assert.deepEqual(next.quests, old.quests);
  assert.deepEqual(next.world, { ...old.world, dayNight: null });
  assert.deepEqual(old, before);
});

test("shipped v6 enemy configuration migrates with local clip assignments intact", async () => {
  const old = JSON.parse(
    await readFile(new URL("./fixtures/v6.json", import.meta.url), "utf8"),
  );
  const before = structuredClone(old),
    next = readProject(old);
  assert.equal(next.schemaVersion, 25);
  assert.deepEqual(old, before);
  for (const e of old.entities) {
    const migrated = next.entities.find((x) => x.id === e.id);
    assert.deepEqual(
      migrated.enemy,
      e.enemy ? { ...e.enemy, animationSources: {} } : undefined,
    );
  }
});
