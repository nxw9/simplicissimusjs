import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { demoProject } from "../src/core/demo.js";
import { createEntityObject } from "../src/render/world.js";
import { NPCs } from "../src/render/npcs.js";
test("NPC plays idle then talk during dialogue and returns to idle without touching project", () => {
  const p = demoProject(),
    e = p.entities.find((e) => e.kind === "npc");
  e.shape = "model";
  e.assetId = "actor";
  e.npc = { idle: "Idle", talk: "Talk", facing: 0 };
  p.entities = [e];
  const model = new T.Group();
  model.name = "Actor";
  model.add(
    new T.Mesh(new T.BoxGeometry(0.4, 1.8, 0.3), new T.MeshStandardMaterial()),
  );
  const animations = ["Idle", "Talk"].map(
    (name) =>
      new T.AnimationClip(name, 1, [
        new T.NumberKeyframeTrack("Actor.rotation[x]", [0, 1], [0, 0.2]),
      ]),
  );
  const object = createEntityObject(
      e,
      new Map([["actor", { scene: model, animations }]]),
    ),
    view = { objects: new Map([[e.id, object]]), invalidate: () => {} },
    snapshot = structuredClone(p);
  const controller = new NPCs(view, p);
  controller.update(0.1, null);
  assert.equal(controller.units[0].action.getClip().name, "Idle");
  controller.update(0.1, e.id);
  assert.equal(controller.units[0].action.getClip().name, "Talk");
  controller.update(0.1, null);
  assert.equal(controller.units[0].action.getClip().name, "Idle");
  controller.dispose();
  assert.deepEqual(p, snapshot);
  assert.equal(model.rotation.x, 0);
});
test("built-in NPC has talk gestures and no weapon mesh", () => {
  const p = demoProject(),
    npc = p.entities.find((e) => e.kind === "npc"),
    enemy = p.entities.find((e) => e.kind === "enemy");
  const a = createEntityObject(npc, new Map()),
    b = createEntityObject(enemy, new Map());
  let npcMeshes = 0,
    enemyMeshes = 0;
  a.traverse((o) => (npcMeshes += Number(o.isMesh ?? false)));
  b.traverse((o) => (enemyMeshes += Number(o.isMesh ?? false)));
  assert.equal(enemyMeshes, npcMeshes + 1);
  const before = a.children[0].children.map((o) => o.rotation.x);
  a.userData.npcPose("talk", 0.5);
  assert.notDeepEqual(
    a.children[0].children.map((o) => o.rotation.x),
    before,
  );
  a.userData.npcPose("idle", 0);
  assert.ok(
    a.children[0].children.every(
      (o, i) => Math.abs(o.rotation.x - before[i]) < 1e-9,
    ),
  );
});
