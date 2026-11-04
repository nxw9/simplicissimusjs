import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { EnemyController } from "../src/render/enemies.js";
import { createEntityObject } from "../src/render/world.js";
import { enemyConfig, suggestClips } from "../src/core/enemy.js";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
function setup() {
  const project = demoProject(),
    e = project.entities.find((e) => e.kind === "enemy");
  e.position = [0, 0, 0];
  e.scale = [1, 1, 1];
  project.entities = [e];
  project.quests = [];
  const o = createEntityObject(e, new Map());
  o.updateMatrixWorld(true);
  const view = {
    objects: new Map([[e.id, o]]),
    boxes: [],
    invalidate: () => {},
    terrainHit: () => null,
  };
  const game = new GameState(project),
    ai = new EnemyController(view, project, game);
  return { ai, e, o, view, game, project };
}
test("enemy notices nearby player, walks toward them, stops to wind up and hits once", () => {
  const { ai, o, game } = setup();
  const player = new T.Vector3(0, 1.7, 6);
  ai.update(0.05, new T.Vector3(0, 1.7, 30));
  assert.equal(o.position.z, 0);
  for (let i = 0; i < 50; i++) ai.update(0.05, player);
  assert.ok(o.position.z > 4 && o.position.z < 4.5);
  assert.equal(ai.units[0].state, "attack");
  const startHealth = game.state.health;
  // Observe exactly one impact in a single new attack.
  ai.units[0].attack = 0;
  ai.units[0].cooldown = 2;
  for (let i = 0; i < 19; i++) ai.update(0.05, player);
  assert.equal(game.state.health, startHealth - 10);
});
test("walls block awareness and hits; moving away during wind-up avoids damage", () => {
  const { ai, view, game, o } = setup(),
    player = new T.Vector3(0, 1.7, 1.5);
  view.boxes = [
    new T.Box3(new T.Vector3(-2, 0, 0.5), new T.Vector3(2, 3, 0.8)),
  ];
  for (let i = 0; i < 40; i++) ai.update(0.05, player);
  assert.equal(game.state.health, 100);
  assert.equal(o.position.z, 0);
  view.boxes = [];
  ai.update(0.05, player);
  assert.equal(ai.units[0].state, "attack");
  for (let i = 0; i < 20; i++) ai.update(0.05, new T.Vector3(0, 1.7, 10));
  assert.equal(game.state.health, 100);
});
test("defeated enemies stop; reset restores editor transforms and does not mutate project", () => {
  const { ai, e, o, game } = setup(),
    snapshot = structuredClone(e);
  for (let i = 0; i < 20; i++) ai.update(0.05, new T.Vector3(0, 1.7, 6));
  const z = o.position.z;
  game.hit(e.id, 1000);
  for (let i = 0; i < 30; i++) ai.update(0.05, new T.Vector3(0, 1.7, 1));
  assert.equal(o.position.z, z);
  ai.dispose();
  assert.deepEqual(o.position.toArray(), e.position);
  assert.deepEqual(e, snapshot);
});
test("named GLB actions transition to walk and one-shot attack with configured timing", () => {
  const { project, e, view, game } = setup();
  e.shape = "model";
  e.assetId = "model";
  e.enemy = { ...enemyConfig(e), walk: "Walk", attack: "Attack", idle: "Idle" };
  const model = new T.Group();
  model.name = "Character";
  model.add(
    new T.Mesh(new T.BoxGeometry(0.5, 1.8, 0.3), new T.MeshBasicMaterial()),
  );
  const clips = ["Idle", "Walk", "Attack"].map(
    (name) =>
      new T.AnimationClip(name, 1, [
        new T.NumberKeyframeTrack("Character.rotation[x]", [0, 1], [0, 0.1]),
      ]),
  );
  const o = createEntityObject(
    e,
    new Map([["model", { scene: model, animations: clips }]]),
  );
  view.objects.set(e.id, o);
  const ai = new EnemyController(view, project, game);
  ai.update(0.05, new T.Vector3(0, 1.7, 6));
  assert.equal(ai.units[0].action.getClip().name, "Walk");
  ai.update(0.05, new T.Vector3(0, 1.7, 1));
  assert.equal(ai.units[0].action.getClip().name, "Attack");
  assert.equal(ai.units[0].action.loop, T.LoopOnce);
  ai.dispose();
  assert.equal(model.rotation.x, 0);
});
test("enemy configuration survives serialization; v3 upgrades without changing source", () => {
  const p = demoProject(),
    old = structuredClone(p);
  old.schemaVersion = 3;
  const before = structuredClone(old);
  assert.equal(readProject(old).schemaVersion, 25);
  assert.deepEqual(old, before);
  const e = p.entities.find((e) => e.kind === "enemy");
  e.enemy = enemyConfig(e);
  assert.deepEqual(
    readProject(serializeProject(p)).entities.find((x) => x.id === e.id).enemy,
    e.enemy,
  );
  e.enemy.speed = -1;
  assert.throws(() => readProject(p));
  assert.equal(
    suggestClips([{ name: "Walk" }, { name: "Attack" }]).walk,
    "Walk",
  );
});

test("enemy follows sculpted terrain and cannot climb a cliff", async () => {
  const { createTerrain, heightAt } = await import("../src/core/terrain.js");
  const { ai, project, o } = setup();
  project.world.terrain = createTerrain(32);
  const t = project.world.terrain;
  for (let z = 0; z <= 32; z++)
    for (let x = 0; x <= 32; x++)
      t.heights[z * 33 + x] = z > 16 ? (z - 16) * 0.2 : 0;
  for (let i = 0; i < 30; i++) ai.update(0.05, new T.Vector3(0, 2.2, 8));
  assert.ok(o.position.z > 0);
  assert.ok(
    Math.abs(
      o.position.y -
        ai.units[0].offset -
        heightAt(project.world, 0, o.position.z),
    ) < 1e-6,
  );
  ai.reset();
  for (let z = 17; z <= 32; z++)
    for (let x = 0; x <= 32; x++) t.heights[z * 33 + x] = 20;
  for (let i = 0; i < 30; i++) ai.update(0.05, new T.Vector3(0, 21.7, 8));
  assert.ok(o.position.z < 0.1);
});

test("death cancels attack, leaves a corpse at the kill location and survives save/load", () => {
  const { ai, e, o, game } = setup(),
    player = new T.Vector3(0, 1.7, 6);
  for (let i = 0; i < 20; i++) ai.update(0.05, player);
  const deathZ = o.position.z;
  ai.units[0].attack = 0.2;
  game.hit(e.id, 1000);
  ai.syncDeaths();
  const savedDuringDeath = game.save();
  for (let i = 0; i < 30; i++)
    ai.update(0.05, new T.Vector3(0, 1.7, deathZ + 1));
  assert.equal(game.state.health, 100);
  assert.equal(ai.units[0].state, "death");
  assert.equal(ai.units[0].attack, null);
  assert.equal(o.visible, true);
  assert.equal(o.userData.defeated, true);
  assert.equal(o.position.z, deathZ);
  assert.equal(game.hit(e.id, 1000), false);
  assert.deepEqual(game.state.defeated, [e.id]);
  game.load(savedDuringDeath);
  ai.reset();
  ai.syncDeaths(true);
  assert.equal(o.position.z, deathZ);
  assert.equal(ai.units[0].deathTime, 1);
  assert.ok(Math.abs(ai.units[0].visual.rotation.x + Math.PI / 2) < 1e-8);
  ai.dispose();
  assert.equal(o.userData.defeated, undefined);
  assert.equal(o.visible, true);
  assert.deepEqual(o.position.toArray(), e.position);
  assert.equal(o.children.length, 1);
});

test("death GLB is one-shot, then swaps to a static corpse; reset removes it", () => {
  const { project, e, view, game } = setup();
  const model = new T.Group();
  model.name = "Actor";
  model.add(
    new T.Mesh(new T.BoxGeometry(0.5, 1.8, 0.3), new T.MeshBasicMaterial()),
  );
  const death = new T.AnimationClip("Death", 0.8, [
    new T.NumberKeyframeTrack("Actor.rotation[x]", [0, 0.8], [0, -Math.PI / 2]),
  ]);
  const corpse = new T.Group();
  corpse.add(
    new T.Mesh(new T.BoxGeometry(0.5, 0.3, 1.8), new T.MeshBasicMaterial()),
  );
  view.assetModels = new Map([
    ["actor", { scene: model, animations: [death] }],
    ["body", { scene: corpse, animations: [] }],
  ]);
  e.shape = "model";
  e.assetId = "actor";
  e.enemy = {
    ...enemyConfig(e),
    death: "Death",
    corpseAssetId: "body",
    corpseScale: 2,
  };
  const o = createEntityObject(e, view.assetModels);
  view.objects.set(e.id, o);
  const ai = new EnemyController(view, project, game);
  game.hit(e.id, 1000);
  ai.syncDeaths();
  const u = ai.units[0];
  assert.equal(u.action.loop, T.LoopOnce);
  assert.equal(u.action.clampWhenFinished, true);
  ai.update(0.4, new T.Vector3());
  assert.equal(u.corpse, null);
  ai.update(0.4, new T.Vector3());
  assert.ok(u.corpse);
  assert.equal(u.visual.visible, false);
  const first = u.corpse;
  ai.update(3, new T.Vector3());
  assert.equal(u.corpse, first);
  assert.equal(u.corpse.scale.x, 2);
  const bounds = new T.Box3().setFromObject(u.corpse);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  const raw = game.save();
  game.load(raw);
  ai.reset();
  ai.syncDeaths(true);
  assert.ok(u.corpse);
  ai.dispose();
  assert.equal(o.children.length, 1);
  assert.equal(o.children[0].visible, true);
  assert.equal(corpse.parent, null);
  assert.equal(model.rotation.x, 0);
});

test("v5 enemy projects and v2 saves migrate without mutation; corpse references are validated", () => {
  const p = demoProject(),
    e = p.entities.find((e) => e.kind === "enemy");
  e.enemy = enemyConfig(e);
  for (const key of ["death", "corpseAssetId", "corpseScale", "corpseFacing"])
    delete e.enemy[key];
  p.schemaVersion = 5;
  const before = structuredClone(p);
  const current = readProject(p);
  assert.equal(current.schemaVersion, 25);
  assert.deepEqual(p, before);
  const enemy = current.entities.find((x) => x.id === e.id);
  assert.equal(enemy.enemy.corpseAssetId, null);
  const game = new GameState(current),
    old = JSON.parse(game.save());
  old.schemaVersion = 2;
  delete old.corpses;
  delete old.worldTime;
  delete old.droppedItems;
  old.defeated = [e.id];
  game.load(JSON.stringify(old));
  assert.equal(game.state.schemaVersion, 8);
  assert.deepEqual(game.state.corpses, {});
  const bad = JSON.parse(game.save());
  bad.corpses.unknown = { position: [0, 0, 0], rotation: [0, 0, 0] };
  assert.throws(() => game.load(JSON.stringify(bad)), /труп/);
  enemy.enemy.corpseAssetId = "missing";
  assert.throws(() => readProject(current), /трупа/);
});

test("separate GLBs with duplicate clip names animate the main actor and survive roundtrip", async () => {
  const { animatedGLB } = await import("./animated-glb.js");
  const { parseGLB } = await import("../src/render/world.js");
  const { project, e, view } = setup();
  project.assets = ["main", "walking", "attacking", "dying"].map((id, i) => ({
    id,
    name: id + ".glb",
    data:
      "data:model/gltf-binary;base64," +
      animatedGLB("Action", i + 1).toString("base64"),
  }));
  view.assetModels = new Map(
    await Promise.all(
      project.assets.map(async (a) => [a.id, await parseGLB(a.data)]),
    ),
  );
  e.shape = "model";
  e.assetId = "main";
  e.enemy = {
    ...enemyConfig(e),
    idle: "Action",
    walk: "Action",
    attack: "Action",
    death: "Action",
    animationSources: { walk: "walking", attack: "attacking", death: "dying" },
  };
  const p = readProject(serializeProject(project));
  assert.deepEqual(
    p.entities[0].enemy.animationSources,
    e.enemy.animationSources,
  );
  const o = createEntityObject(e, view.assetModels);
  view.objects.set(e.id, o);
  const game = new GameState(p),
    ai = new EnemyController(view, p, game),
    u = ai.units[0];
  ai.update(0.1, new T.Vector3(0, 1.7, 6));
  assert.equal(
    u.action.getClip(),
    view.assetModels.get("walking").animations[0],
  );
  const actor = o.userData.enemyModel;
  assert.ok(actor.getObjectByName("Actor").position.x > 0);
  ai.update(0.1, new T.Vector3(0, 1.7, 1));
  assert.equal(
    u.action.getClip(),
    view.assetModels.get("attacking").animations[0],
  );
  game.hit(e.id, 1000);
  ai.syncDeaths();
  assert.equal(u.action.getClip(), view.assetModels.get("dying").animations[0]);
  assert.equal(o.userData.enemyModel, actor);
  assert.equal(
    view.assetModels.get("walking").scene.getObjectByName("Actor").position.x,
    0,
  );
  ai.update(1, new T.Vector3());
  assert.equal(u.action.paused, true);
  ai.dispose();
  p.entities[0].enemy.animationSources.walk = "missing";
  assert.throws(() => readProject(p), /файл анимации/);
});

test("external clips reject missing target nodes without mutating source GLB", async () => {
  const { clipFits } = await import("../src/render/enemy-clips.js");
  const model = new T.Group();
  model.name = "Actor";
  const clip = new T.AnimationClip("Walk", 1, [
    new T.NumberKeyframeTrack("OtherBone.rotation[x]", [0, 1], [0, 1]),
  ]);
  assert.equal(clipFits(clip, model), false);
  assert.equal(clip.tracks[0].name, "OtherBone.rotation[x]");
});
