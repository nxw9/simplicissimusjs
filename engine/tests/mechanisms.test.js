import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { demoProject } from "../src/core/demo.js";
import { createEntity, readProject } from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
import { defaultMotion } from "../src/core/mechanisms.js";
import { Mechanisms } from "../src/render/mechanisms.js";
import { WorldView } from "../src/render/world.js";
async function setup(motion = defaultMotion(true)) {
  const p = demoProject(),
    e = createEntity("prop", "door");
  e.id = "door";
  e.position = [0, 0, 0];
  e.motion = motion;
  p.entities.push(e);
  const v = Object.create(WorldView.prototype);
  Object.assign(v, {
    scene: new T.Scene(),
    root: new T.Group(),
    renderer: { shadowMap: {}, setPixelRatio(){} },
    camera:new T.PerspectiveCamera(),
    objects: new Map(),
    mixers: [],
  });
  v.scene.add(v.root);
  await v.load(p);
  const game = new GameState(p),
    controller = new Mechanisms(v, p, game);
  return { p, e, v, game, controller };
}
test("door toggles with interaction and its collider moves with geometry", async () => {
  const { v, controller, game } = await setup();
  const original = v.boxes.find((b) => b.entityId === "door").clone();
  assert.ok(controller.interact("door"));
  controller.update(1.1, new T.Vector3(5, 1.7, 5));
  assert.equal(game.state.mechanisms.door.progress, 1);
  assert.ok(!v.boxes.find((b) => b.entityId === "door").equals(original));
  assert.ok(Math.abs(v.objects.get("door").rotation.y) > 1);
  controller.interact("door");
  controller.update(1.1);
  assert.equal(game.state.mechanisms.door.progress, 0);
  assert.ok(v.boxes.find((b) => b.entityId === "door").equals(original));
});
test("condition locks E and item/quest/enemy conditions trigger automatic movement", async () => {
  for (const [condition, target] of [
    ["item", "shard"],
    ["quest", "first-fire"],
    ["enemy", "sentinel"],
  ]) {
    const cfg = { ...defaultMotion(), trigger: "auto", condition, target };
    const { controller, game } = await setup(cfg);
    assert.match(
      controller.interact("door"),
      condition === "quest"
        ? /квест/
        : condition === "item"
          ? /предмет/
          : /врага/,
    );
    controller.update(1);
    assert.equal(game.state.mechanisms.door.progress, 0);
    if (condition === "item") game.collect(target);
    else if (condition === "enemy") game.hit(target, 1000);
    else game.state.quests[target] = "complete";
    controller.update(1.1);
    assert.equal(game.state.mechanisms.door.progress, 1);
  }
});
test("moving solid stops before intersecting player and resumes when clear", async () => {
  const motion = { ...defaultMotion(), offset: [3, 0, 0], rotation: [0, 0, 0] };
  const { controller, game } = await setup(motion);
  controller.interact("door");
  controller.update(1, new T.Vector3(2, 1.7, 0));
  const progress = game.state.mechanisms.door.progress;
  assert.ok(progress > 0 && progress < 0.2);
  controller.update(1, new T.Vector3(2, 1.7, 0));
  assert.equal(game.state.mechanisms.door.progress, progress);
  controller.update(1, new T.Vector3(5, 1.7, 5));
  assert.equal(game.state.mechanisms.door.progress, 1);
});
test("partial motion survives save/load, dispose restores editor, old save migrates", async () => {
  const { controller, game, p, v } = await setup();
  controller.interact("door");
  controller.update(0.3);
  const progress = game.state.mechanisms.door.progress,
    raw = game.save();
  controller.update(1);
  game.load(raw);
  controller.restore();
  assert.equal(controller.units[0].progress, progress);
  controller.dispose();
  assert.deepEqual(v.objects.get("door").position.toArray(), [0, 0, 0]);
  assert.equal(v.objects.get("door").rotation.y, 0);
  const old = JSON.parse(new GameState(p).save());
  old.schemaVersion = 1;
  delete old.mechanisms;
  delete old.corpses;
  delete old.worldTime;
  delete old.droppedItems;
  game.load(JSON.stringify(old));
  assert.deepEqual(game.state.mechanisms, {});
  assert.equal(game.state.schemaVersion, 8);
  const invalid = JSON.parse(game.save());
  invalid.mechanisms.unknown = { open: true, progress: 1 };
  assert.throws(() => game.load(JSON.stringify(invalid)), /механизм/);
});
test("project rejects dangling mechanism conditions and migrates v4 unchanged", async () => {
  const { p } = await setup();
  const old = structuredClone(p);
  old.schemaVersion = 4;
  const snapshot = structuredClone(old);
  assert.equal(readProject(old).schemaVersion, 25);
  assert.deepEqual(old, snapshot);
  p.entities.find((e) => e.id === "door").motion.condition = "quest";
  p.entities.find((e) => e.id === "door").motion.target = "missing";
  assert.throws(() => readProject(p), /квест/);
});
