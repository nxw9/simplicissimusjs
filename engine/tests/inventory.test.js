import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { JSDOM } from "jsdom";
import { demoProject } from "../src/core/demo.js";
import { GameState } from "../src/core/game.js";
import { readProject } from "../src/core/project.js";
import { conditionMet } from "../src/core/dialogue.js";
import { previewObject } from "../src/render/item-preview.js";
import { syncItems, dropPosition } from "../src/render/item-world.js";
import { ColliderIndex } from "../src/render/colliders.js";
import { InventoryUI } from "../src/render/inventory.js";
import { Session } from "../src/render/session.js";

test("pickup, drop, reload and repick preserve unique items and migrate v4 saves", () => {
  const p = demoProject(),
    g = new GameState(p);
  assert.equal(g.collect("shard"), true);
  assert.equal(g.collect("shard"), false);
  assert.equal(g.drop("shard", [2, 0.5, 3]), true);
  assert.equal(g.drop("shard", [3, 0.5, 3]), false);
  assert.deepEqual(g.state.inventory, []);
  const h = new GameState(p);
  h.load(g.save());
  assert.deepEqual(h.state.droppedItems.shard, [2, 0.5, 3]);
  assert.equal(h.collect("shard"), true);
  assert.deepEqual(h.state.droppedItems, {});
  const old = JSON.parse(h.save());
  old.schemaVersion = 4;
  delete old.droppedItems;
  h.load(JSON.stringify(old));
  assert.deepEqual(h.state.inventory, ["shard"]);
  assert.equal(h.state.schemaVersion, 8);
  const legacy = demoProject();
  legacy.schemaVersion = 15;
  assert.equal(readProject(legacy).schemaVersion, 25);
});
test("dropping an unfinished quest item removes readiness and item-owned condition", () => {
  const g = new GameState(demoProject());
  g.questAction("accept", "first-fire", "warden");
  g.collect("shard");
  assert.equal(g.questProgress(g.project.quests[0]).ready, true);
  g.drop("shard", [0, 0, 0]);
  assert.equal(g.questProgress(g.project.quests[0]).ready, false);
  assert.equal(conditionMet({ kind: "itemOwned", target: "shard" }, g), false);
  assert.equal(g.questAction("complete", "first-fire", "warden"), false);
  g.collect("shard");
  g.questAction("complete", "first-fire", "warden");
  g.drop("shard", [0, 0, 0]);
  g.collect("shard");
  assert.equal(g.questAction("complete", "first-fire", "warden"), false);
  assert.equal(g.state.gold, 25);
});
test("invalid drop saves and duplicate items reject atomically", () => {
  const g = new GameState(demoProject());
  g.collect("shard");
  const before = g.save();
  for (const mutate of [
    (s) => s.inventory.push("shard"),
    (s) => (s.droppedItems.shard = [0, 0, 0]),
    (s) => (s.droppedItems.missing = [0, 0, 0]),
    (s) => {
      s.inventory = [];
      s.droppedItems.shard = [NaN, 0, 0];
    },
  ]) {
    const bad = JSON.parse(before);
    mutate(bad);
    assert.throws(() => g.load(JSON.stringify(bad)));
    assert.equal(g.save(), before);
  }
  assert.equal(g.drop("shard", [Infinity, 0, 0]), false);
  g.project.world.playBounds={min:[-40,-40],max:[40,40]};
  assert.equal(g.drop("shard", [99999, 0, 0]), false);
  assert.equal(g.drop("missing", [0, 0, 0]), false);
});
test("preview clones transform and visibility without modifying or owning world resources", () => {
  const source = new T.Group(),
    mesh = new T.Mesh(new T.BoxGeometry(2, 3, 1), new T.MeshStandardMaterial());
  source.add(mesh);
  source.position.set(20, 7, -9);
  source.scale.set(2, 2, 2);
  source.visible = false;
  const before = source.position.clone(),
    preview = previewObject(source);
  preview.rotation.x = 1;
  preview.rotation.y = 2;
  assert.deepEqual(source.position, before);
  assert.equal(source.visible, false);
  assert.equal(source.rotation.x, 0);
  assert.equal(preview.children[0].visible, true);
  assert.equal(preview.children[0].children[0].geometry, mesh.geometry);
  assert.equal(preview.children[0].children[0].material, mesh.material);
});
test("item world updates dropped transforms and collected colliders; drop location avoids walls", () => {
  const p = demoProject(),
    e = p.entities.find((e) => e.id === "shard"),
    o = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3), new T.MeshBasicMaterial());
  o.position.fromArray(e.position);
  o.updateMatrixWorld(true);
  const b = new T.Box3().setFromObject(o);
  b.entityId = e.id;
  const view = {
    objects: new Map([[e.id, o]]),
    boxes: [b],
    colliderGroups: new Map([[e.id, [b]]]),
    collisionIndex: new ColliderIndex([b]),
    refreshColliders() {
      b.setFromObject(o);
      this.collisionIndex.update(b);
    },
    camera: { position: new T.Vector3(0, 1.7, 0) },
  };
  syncItems(view, p, { inventory: ["shard"], droppedItems: {} });
  assert.equal(o.visible, false);
  assert.equal(b.isEmpty(), true);
  assert.equal(view.collisionIndex.query(-100, -100, 100, 100).length, 0);
  syncItems(view, p, { inventory: [], droppedItems: { shard: [2, 0.2, 3] } });
  assert.deepEqual(o.position.toArray(), [2, 0.2, 3]);
  assert.equal(o.visible, true);
  assert.equal(b.isEmpty(), false);
  const position = dropPosition({ view, project: p, yaw: 0 }, "shard");
  assert.ok(position);
  assert.ok(position[1] >= 0.15);
  const wall = new T.Box3(new T.Vector3(-5, -1, -5), new T.Vector3(5, 5, 5));
  wall.entityId = "wall";
  view.collisionIndex.insert(wall);
  assert.equal(dropPosition({ view, project: p, yaw: 0 }, "shard"), null);
  syncItems(view, p, { inventory: [], droppedItems: {} });
  assert.deepEqual(o.position.toArray(), e.position);
});
test("inspect leaves item until Take, inventory can drop and ordinary props cannot be taken", () => {
  const dom = new JSDOM('<div id="host"></div>');
  globalThis.document = dom.window.document;
  const p = demoProject(),
    game = new GameState(p),
    s = {
      project: p,
      game,
      host: document.querySelector("#host"),
      entitiesById: new Map(p.entities.map((e) => [e.id, e])),
      view: { objects: new Map(), gamePaused: false },
      keys: new Set(),
      paused: false,
      lock() {},
      sync() {},
      dropPosition() {
        return [2, 0.5, 3];
      },
    };
  try {
    const ui = new InventoryUI(s);
    ui.open("shard");
    assert.deepEqual(game.state.inventory, []);
    assert.equal(s.paused, true);
    document.querySelector("#inventory-close").click();
    assert.deepEqual(game.state.inventory, []);
    ui.open("shard");
    document.querySelector("#inspect-take").click();
    assert.deepEqual(game.state.inventory, ["shard"]);
    assert.equal(s.paused, false);
    ui.open();
    ui.show("shard");
    document.querySelector("#inventory-drop").click();
    assert.deepEqual(game.state.inventory, []);
    assert.deepEqual(game.state.droppedItems.shard, [2, 0.5, 3]);
    assert.match(ui.root.textContent, /пуст/);
    ui.close();
    const prop = p.entities.find((e) => e.kind === "prop");
    ui.open(prop.id);
    assert.equal(document.querySelector("#inspect-take"), null);
    ui.close();
    const session = Object.assign(Object.create(Session.prototype), s, {
      inventoryUI: { open: (id) => (session.opened = id) },
      view: { target: () => "shard" },
    });
    session.interact();
    assert.equal(session.opened, "shard");
    assert.deepEqual(game.state.inventory, []);
  } finally {
    dom.window.close();
  }
});
