import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { demoProject } from "../src/core/demo.js";
import {
  createEntity,
  readProject,
  renameEntity,
} from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
import {
  gearConfig,
  behaviorConfig,
  reactionTo,
} from "../src/core/equipment.js";
import { EnemyController } from "../src/render/enemies.js";
import { createEntityObject } from "../src/render/world.js";
import { syncItems } from "../src/render/item-world.js";
function setup() {
  const p = demoProject();
  p.quests = [];
  const npc = createEntity("npc", "humanoid");
  npc.id = "citizen";
  npc.position = [0, 0, 0];
  npc.behavior = behaviorConfig(npc);
  const sword = createEntity("item");
  sword.id = "sword";
  sword.gear = { ...gearConfig(), slot: "weapon", damage: 47 };
  sword.startInInventory = true;
  const armor = createEntity("item");
  armor.id = "armor";
  armor.gear = { ...gearConfig(), slot: "body", armor: 30 };
  armor.itemOwner = npc.id;
  p.entities = [npc, sword, armor];
  return { p, npc, sword, armor, g: new GameState(p) };
}
test("equipment replaces a slot, changes stats, removes on drop and survives reload", () => {
  const { p, g, npc } = setup();
  assert.equal(g.equip("sword"), true);
  assert.equal(g.attackDamage, 47);
  g.hit(npc.id, 100);
  assert.equal(g.loot(npc.id, "armor"), true);
  assert.equal(g.equip("armor"), true);
  g.damage(10);
  assert.equal(g.state.health, 93);
  const loaded = new GameState(p);
  loaded.load(g.save());
  assert.equal(loaded.armor, 30);
  assert.equal(loaded.attackDamage, 47);
  loaded.drop("sword", [1, 0, 1]);
  assert.equal(loaded.state.equipped.weapon, undefined);
  assert.equal(loaded.state.defaultWeapon, false);
  loaded.unequip("body");
  assert.equal(loaded.armor, 0);
  assert.ok(loaded.state.inventory.includes("armor"));
});
test("loot is unavailable while alive, unique after death, and cannot duplicate after drop/reload", () => {
  const { p, g, npc } = setup();
  assert.equal(g.collect("armor"), false);
  assert.equal(g.loot(npc.id, "armor"), false);
  g.hit(npc.id, 100);
  assert.equal(g.loot(npc.id, "armor"), true);
  assert.equal(g.loot(npc.id, "armor"), false);
  g.drop("armor", [2, 0, 2]);
  const loaded = new GameState(p);
  loaded.load(g.save());
  assert.deepEqual(loaded.lootItems(npc.id), []);
  assert.equal(loaded.collect("armor"), true);
  assert.deepEqual(loaded.lootItems(npc.id), []);
});
test("owned and starting items stay hidden until dropped; editor restoration shows them", () => {
  const { p, g } = setup(),
    objects = new Map(
      p.entities.map((e) => [e.id, createEntityObject(e, new Map())]),
    );
  syncItems({ objects }, p, g.state);
  assert.equal(objects.get("armor").visible, false);
  assert.equal(objects.get("sword").visible, false);
  g.drop("sword", [1, 0, 1]);
  syncItems({ objects }, p, g.state);
  assert.equal(objects.get("sword").visible, true);
  syncItems({ objects }, p, {
    inventory: [],
    droppedItems: {},
    showOwned: true,
  });
  assert.equal(objects.get("armor").visible, true);
});
test("schema checks ownership and slots; renames owner references; old saves migrate", () => {
  const { p, g, npc } = setup();
  renameEntity(p, npc.id, "new-npc");
  assert.equal(p.entities.find((e) => e.id === "armor").itemOwner, "new-npc");
  assert.doesNotThrow(() => readProject(p));
  p.entities.find((e) => e.id === "armor").itemOwner = "missing";
  assert.throws(() => readProject(p));
  const old = JSON.parse(g.save());
  old.schemaVersion = 5;
  delete old.actorHealth;
  delete old.aggression;
  delete old.equipped;
  delete old.defaultWeapon;
  // Rename changes contentVersion intentionally; restore the matching fixture version.
  old.contentVersion = p.contentVersion;
  g.load(JSON.stringify(old));
  assert.equal(g.state.schemaVersion, 8);
  const bad = JSON.parse(g.save());
  bad.equipped.body = "sword";
  const before = g.save();
  assert.throws(() => g.load(JSON.stringify(bad)));
  assert.equal(g.save(), before);
});
function aiFixture(reaction = "fight") {
  const { p, g, npc } = setup();
  npc.behavior.reaction = reaction;
  const object = createEntityObject(npc, new Map());
  object.updateMatrixWorld(true);
  const view = {
    objects: new Map([[npc.id, object]]),
    boxes: [],
    assetModels: new Map(),
    invalidate() {},
    terrainHit() {
      return null;
    },
  };
  return { p, g, npc, object, view, ai: new EnemyController(view, p, g) };
}
test("NPC retaliation attacks player, fleeing increases distance, ignore stays still", () => {
  for (const reaction of ["fight", "flee", "ignore"]) {
    const { g, npc, object, ai } = aiFixture(reaction),
      player = new T.Vector3(0, 1.7, 1.2);
    g.hit(npc.id, 1);
    for (let i = 0; i < 50; i++) ai.update(0.05, player);
    if (reaction === "fight") assert.ok(g.state.health < 100);
    if (reaction === "flee") {
      assert.ok(object.position.z < -1);
      assert.equal(g.state.health, 100);
    }
    if (reaction === "ignore") {
      assert.equal(object.position.z, 0);
      assert.equal(g.state.health, 100);
    }
    ai.dispose();
  }
});
test("NPCs fight hostile groups, help allies and restore searchable corpses", () => {
  const { p, g, npc, view, ai } = aiFixture();
  ai.dispose();
  const foe = createEntity("npc", "humanoid");
  foe.id = "foe";
  foe.position = [0, 0, 1];
  foe.behavior = {
    ...behaviorConfig(foe),
    faction: "rivals",
    others: "hostile",
  };
  foe.health = 10;
  npc.behavior.others = "hostile";
  p.entities.push(foe);
  view.objects.set(foe.id, createEntityObject(foe, new Map()));
  const fight = new EnemyController(view, p, g);
  for (let i = 0; i < 50; i++) fight.update(0.05, new T.Vector3(0, 1.7, 30));
  assert.ok(g.state.defeated.includes("foe"));
  assert.ok(g.state.corpses.foe);
  assert.equal(view.objects.get("foe").visible, true);
  const save = g.save();
  g.load(save);
  fight.reset();
  fight.syncDeaths(true);
  assert.equal(view.objects.get("foe").userData.defeated, true);
  fight.dispose();
  assert.equal(
    reactionTo(npc, {
      ...foe,
      behavior: { ...foe.behavior, faction: npc.behavior.faction },
    }),
    "ignore",
  );
});
test("guard assists attacked ally and wander stays centered on authored home", () => {
  const { p, g, npc, view, ai } = aiFixture();
  ai.dispose();
  npc.behavior = {
    ...npc.behavior,
    assist: true,
    routine: "wander",
    radius: 3,
  };
  const ally = { ...structuredClone(npc), id: "ally", position: [2, 0, 0] };
  p.entities.push(ally);
  view.objects.set(ally.id, createEntityObject(ally, new Map()));
  const controller = new EnemyController(view, p, g);
  controller.update(0.05, new T.Vector3(0, 1.7, 30));
  assert.ok(controller.units[0].destination);
  g.hit(ally.id, 1);
  controller.chooseTargets(new T.Vector3(0, 1.7, 2));
  assert.equal(controller.units[0].target, "$player");
  controller.dispose();
});

test("editor presets and quick loot creation commit a valid project", async () => {
  const { JSDOM } = await import("jsdom");
  const { characterSettings, itemEditor } = await import(
    "../src/editor/character-settings.js"
  );
  const dom = new JSDOM('<dialog id="modal"><div id="body"></div></dialog>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  document.querySelector("dialog").close = () => {};
  const element = (tag, text = "", cls = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = cls;
    return e;
  };
  const field = (box, label, value, type, fn) => {
    const row = element("label", label),
      input = element("input");
    input.type = type;
    input.value = value;
    input.oninput = () => fn(input.value);
    row.append(input);
    box.append(row);
    return input;
  };
  const modal = (_, box) =>
    document.querySelector("#body").replaceChildren(box);
  let saved;
  const commit = async (p) => {
    saved = readProject(p);
    return true;
  };
  const { p, npc, sword } = setup();
  try {
    characterSettings({
      entity: npc,
      project: p,
      element,
      field,
      modal,
      commit,
    });
    const presets = document.querySelector("select");
    presets.value = "peaceful";
    presets.dispatchEvent(new dom.window.Event("change"));
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "＋ Меч")
      .click();
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "Сохранить поведение и добычу")
      .click();
    await Promise.resolve();
    assert.equal(
      saved.entities.find((e) => e.id === npc.id).behavior.reaction,
      "flee",
    );
    assert.ok(
      saved.entities.some(
        (e) => e.itemOwner === npc.id && e.gear.slot === "weapon",
      ),
    );
    itemEditor({
      entity: sword,
      project: saved,
      element,
      field,
      modal,
      commit,
    });
    document.querySelector("button.primary").click();
    await Promise.resolve();
    assert.equal(saved.schemaVersion, 25);
  } finally {
    globalThis.document = previous;
    dom.window.close();
  }
});
