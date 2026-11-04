import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { JSDOM } from "jsdom";
import { demoProject } from "../src/core/demo.js";
import {
  readProject,
  validateProject,
  createEntity,
  renameEntity,
} from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
import {
  updateWorldEvents,
  advanceWorld,
  actorPresent,
  inTimeWindow,
  RED_MOON_DEFAULTS,
} from "../src/core/world-events.js";
import { createEntityObject, WorldView } from "../src/render/world.js";
import { entityColliders } from "../src/render/colliders.js";
import { WorldEvents } from "../src/render/world-events.js";
import {
  defaultHeldWeapon,
  attachHeldWeapon,
  detachHeldWeapon,
} from "../src/render/held-weapon.js";
import { EnemyController } from "../src/render/enemies.js";
import { mountBook } from "../src/render/book.js";
import {
  worldEventsEditor,
  spawnEditor,
  heldWeaponEditor,
  bookEditor,
  moonDoorEditor,
} from "../src/editor/world-events-editor.js";

const base = () => {
  const p = demoProject();
  p.world.dayNight = { enabled: true, startHour: 12, dayMinutes: 24 };
  return p;
};
test("red moon rolls once per night, survives save/load and midnight, ends at dawn", () => {
  const p = base();
  p.world.redMoon = { ...RED_MOON_DEFAULTS, enabled: true, chance: 0.3 };
  const g = new GameState(p);
  let calls = 0;
  const rand = () => {
    calls++;
    return 0.2;
  };
  g.state.worldTime = 18;
  updateWorldEvents(g, rand);
  assert.equal(g.state.events.moonActive, true);
  for (let i = 0; i < 20; i++) updateWorldEvents(g, rand);
  assert.equal(calls, 1);
  const restored = new GameState(p);
  restored.load(g.save());
  updateWorldEvents(restored, rand);
  assert.equal(calls, 1);
  g.state.worldTime = 23.99;
  advanceWorld(g, 1, rand);
  assert.equal(g.state.events.day, 1);
  assert.equal(calls, 1);
  g.state.worldTime = 6;
  updateWorldEvents(g, rand);
  assert.equal(g.state.events.moonActive, false);
  g.state.worldTime = 18;
  updateWorldEvents(g, () => {
    calls++;
    return 0.9;
  });
  assert.equal(g.state.events.moonActive, false);
  assert.equal(calls, 2);
});
test("condition / AND / OR moon modes react mid-night and latch until dawn", () => {
  for (const mode of ["conditions", "both", "either"]) {
    const p = base(),
      item = p.entities.find((e) => e.kind === "item");
    p.world.redMoon = {
      enabled: true,
      mode,
      chance: 0,
      match: "all",
      conditions: [{ kind: "itemOwned", target: item.id }],
    };
    const g = new GameState(p);
    g.state.worldTime = 22;
    updateWorldEvents(g, () => 1);
    assert.equal(g.state.events.moonActive, false);
    g.collect(item.id);
    updateWorldEvents(g);
    assert.equal(g.state.events.moonActive, mode !== "both");
    if (mode === "both") {
      g.state.events.moonRoll = true;
      updateWorldEvents(g);
      assert.equal(g.state.events.moonActive, true);
    }
    g.state.inventory = [];
    updateWorldEvents(g);
    assert.equal(g.state.events.moonActive, true);
    g.state.worldTime = 6;
    updateWorldEvents(g);
    assert.equal(g.state.events.moonActive, false);
    p.world.dayNight.enabled = false;
    g.state.worldTime = 22;
    g.state.inventory = [item.id];
    updateWorldEvents(g);
    assert.equal(g.state.events.moonActive, false);
  }
});
test("spawn windows wrap midnight, preserve failed rolls, retry next cycle and retain corpses", () => {
  assert.ok(inTimeWindow(0, 18, 6));
  assert.ok(!inTimeWindow(6, 18, 6));
  assert.ok(inTimeWindow(14, 0, 0));
  const p = base(),
    e = p.entities.find((e) => e.kind === "enemy");
  e.spawn = {
    enabled: true,
    match: "all",
    conditions: [],
    windows: [
      { from: 18, to: 6, chance: 0.5 },
      { from: 6, to: 18, chance: 0 },
    ],
  };
  const g = new GameState(p);
  g.state.worldTime = 18;
  let calls = 0;
  updateWorldEvents(g, () => {
    calls++;
    return 0.7;
  });
  assert.equal(actorPresent(e, g), false);
  updateWorldEvents(g, () => 0);
  assert.equal(actorPresent(e, g), false);
  assert.equal(calls, 1);
  const copy = new GameState(p);
  copy.load(g.save());
  updateWorldEvents(copy, () => 0);
  assert.equal(actorPresent(e, copy), false);
  g.state.worldTime = 23.99;
  advanceWorld(g, 1, () => 0);
  assert.equal(actorPresent(e, g), false);
  g.state.worldTime = 6;
  updateWorldEvents(g, () => 0);
  assert.equal(actorPresent(e, g), false);
  g.state.worldTime = 18;
  updateWorldEvents(g, () => 0);
  assert.equal(actorPresent(e, g), true);
  g.hit(e.id, 10000);
  g.state.worldTime = 8;
  updateWorldEvents(g);
  assert.equal(actorPresent(e, g), true);
});
test("conditions defer spawn roll until eligible; schema rejects overlaps, absent targets and wrong kinds", () => {
  const p = base(),
    e = p.entities.find((e) => e.kind === "enemy"),
    item = p.entities.find((e) => e.kind === "item");
  e.spawn = {
    enabled: true,
    match: "all",
    conditions: [{ kind: "itemOwned", target: item.id }],
    windows: [{ from: 0, to: 0, chance: 1 }],
  };
  const g = new GameState(p);
  assert.equal(g.state.events.spawns[e.id], undefined);
  g.collect(item.id);
  updateWorldEvents(g, () => 0);
  assert.ok(actorPresent(e, g));
  renameEntity(p, item.id, "renamed-item");
  assert.equal(e.spawn.conditions[0].target, "renamed-item");
  assert.doesNotThrow(() => validateProject(p));
  e.spawn.windows.push({ from: 1, to: 3, chance: 0.5 });
  assert.throws(() => validateProject(p), /пересекаются/);
  e.spawn.windows.pop();
  e.spawn.conditions[0].target = "missing";
  assert.throws(() => validateProject(p), /отсутствует/);
  delete e.spawn;
  e.heldWeapon = { ...defaultHeldWeapon(), assetId: "missing" };
  assert.throws(() => validateProject(p), /модель оружия/);
  delete e.heldWeapon;
  const prop = p.entities.find((e) => e.kind === "prop");
  prop.spawn = {
    enabled: true,
    match: "all",
    conditions: [],
    windows: [{ from: 0, to: 0, chance: 1 }],
  };
  assert.throws(() => validateProject(p), /только NPC/);
});
test("weapon follows animated right and left arms, sizes to world units and restores hidden parts", () => {
  const e = createEntity("npc", "humanoid");
  e.heldWeapon = defaultHeldWeapon();
  e.scale = [2, 2, 2];
  const obj = createEntityObject(e, new Map());
  const a = obj.userData.heldAttachment;
  assert.equal(a.socket, "ArmR");
  const old = a.group.getWorldPosition(new T.Vector3());
  obj.getObjectByName("ArmR").rotation.x = -1;
  obj.updateMatrixWorld(true);
  assert.ok(a.group.getWorldPosition(new T.Vector3()).distanceTo(old) > 0.1);
  e.heldWeapon.hand = "left";
  attachHeldWeapon(obj, e, new Map());
  assert.equal(obj.userData.heldAttachment.socket, "ArmL");
  const wrist = new T.Group();
  wrist.name = "mixamorigRightHand";
  obj.children[0].add(wrist);
  e.heldWeapon.hand = "right";
  e.heldWeapon.hideNodes = ["ArmL"];
  attachHeldWeapon(obj, e, new Map());
  assert.equal(obj.userData.heldAttachment.socket, "mixamorigRightHand");
  assert.equal(obj.getObjectByName("ArmL").visible, false);
  detachHeldWeapon(obj);
  assert.equal(obj.getObjectByName("ArmL").visible, true);
  assert.equal(obj.getObjectByName("HearthHeldWeapon"), undefined);
});
test("hidden scheduled enemies cannot notice or damage; moon door restores collision and permits escape after dawn", () => {
  const p = base(),
    enemy = p.entities.find((e) => e.kind === "enemy");
  enemy.position = [0, 0, 0];
  enemy.spawn = {
    enabled: true,
    match: "all",
    conditions: [],
    windows: [{ from: 18, to: 6, chance: 1 }],
  };
  const door = createEntity();
  door.id = "moon-door";
  door.position = [0, 1.5, -3];
  door.scale = [4, 3, 1];
  door.moonDoor = { duration: 1, refuge: [-2, -10, 2, -4] };
  p.entities.push(door);
  const view = Object.create(WorldView.prototype);
  view.scene = new T.Scene();
  view.objects = new Map(
    p.entities.map((e) => [e.id, createEntityObject(e, new Map())]),
  );
  view.assetModels = new Map();
  view.boxes = p.entities.flatMap((e) =>
    entityColliders(e, view.objects.get(e.id)),
  );
  view.invalidate = () => {};
  view.project = p;
  view.indexColliders();
  const g = new GameState(p),
    events = new WorldEvents(view, p, g),
    ai = new EnemyController(view, p, g),
    player = new T.Vector3(0, 1.7, 1);
  for (let i = 0; i < 100; i++) ai.update(0.1, player);
  assert.equal(g.state.health, 100);
  assert.equal(view.objects.get(enemy.id).visible, false);
  g.state.events.moonActive = true; // visual state is normally supplied by configured moon event
  p.world.redMoon = { ...RED_MOON_DEFAULTS, enabled: true, chance: 1 };
  g.state.worldTime = 22;
  g.state.events.moonNight = null;
  events.update(1, player);
  assert.equal(view.objects.get(door.id).visible, false);
  assert.ok(
    view.boxes.filter((b) => b.entityId === door.id).every((b) => b.isEmpty()),
  );
  g.state.worldTime = 8;
  player.set(0, 1.7, -6);
  events.update(1, player);
  assert.equal(g.state.events.doors[door.id], 1);
  const saved = new GameState(p);
  saved.load(g.save());
  assert.equal(saved.state.events.doors[door.id], 1);
  player.set(0, 1.7, 4);
  events.update(1, player);
  assert.equal(g.state.events.doors[door.id], 0);
  assert.ok(
    view.boxes.filter((b) => b.entityId === door.id).every((b) => !b.isEmpty()),
  );
  events.dispose();
  ai.dispose();
});
test("books paginate plain text, remember reading and survive save/load", () => {
  const dom = new JSDOM("<main></main>");
  const old = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const p = base(),
      e = p.entities.find((e) => e.kind === "prop");
    e.book = {
      author: "Летописец",
      pages: ["Первая <script>запись</script>", "Вторая запись"],
    };
    const g = new GameState(p);
    const frame = mountBook(document.querySelector("main"), e, g);
    assert.match(frame.querySelector(".book-page").textContent, /<script>/);
    assert.equal(frame.querySelector("script"), null);
    const [prev, next] = frame.querySelectorAll("button");
    assert.ok(prev.disabled);
    next.click();
    assert.match(frame.textContent, /Вторая запись/);
    assert.ok(next.disabled);
    prev.click();
    const copy = new GameState(p);
    copy.load(g.save());
    assert.deepEqual(copy.state.events.readBooks, [e.id]);
  } finally {
    globalThis.document = old;
    dom.window.close();
  }
});
test("event editor forms commit real schema data; cancelling leaves original untouched", async () => {
  const dom = new JSDOM('<dialog id="modal"><main></main></dialog>');
  const old = globalThis.document;
  globalThis.document = dom.window.document;
  document.querySelector("dialog").close = () => {};
  try {
    for (const fn of [
      worldEventsEditor,
      spawnEditor,
      heldWeaponEditor,
      bookEditor,
      moonDoorEditor,
    ]) {
      const p = base(),
        entity = p.entities.find((e) =>
          [spawnEditor, heldWeaponEditor].includes(fn)
            ? e.kind === "enemy"
            : e.kind === "prop",
        );
      const original = JSON.stringify(p);
      let saved;
      fn({
        project: p,
        entity,
        modal: (title, box) =>
          document.querySelector("main").replaceChildren(box),
        commit: async (next) => {
          saved = validateProject(next);
          return true;
        },
      });
      assert.equal(JSON.stringify(p), original);
      const check = document.querySelector('input[type="checkbox"]');
      check.checked = true;
      check.onchange();
      await document.querySelector("[data-event-save]").onclick();
      assert.ok(saved);
      const e = saved.entities.find((e) => e.id === entity.id);
      if (fn === worldEventsEditor) assert.ok(saved.world.redMoon.enabled);
      if (fn === spawnEditor) assert.ok(e.spawn.enabled);
      if (fn === heldWeaponEditor) assert.ok(e.heldWeapon);
      if (fn === bookEditor) assert.equal(e.book.pages.length, 1);
      if (fn === moonDoorEditor) assert.ok(e.moonDoor);
    }
  } finally {
    globalThis.document = old;
    dom.window.close();
  }
});
test("v18 project and v7 save migrate with no changed quest progress", () => {
  const p = base();
  p.schemaVersion = 18;
  const next = readProject(p);
  assert.equal(next.schemaVersion, 25);
  const g = new GameState(next),
    s = JSON.parse(g.save());
  s.schemaVersion = 7;
  delete s.events;
  g.load(JSON.stringify(s));
  assert.equal(g.state.schemaVersion, 8);
  assert.deepEqual(g.state.quests, s.quests);
});
