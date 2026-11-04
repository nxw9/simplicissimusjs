import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import * as T from "three";
import { questWizard } from "../src/editor/quest-editor.js";
import { enemyEditor, stopEnemyPreview } from "../src/editor/enemy-editor.js";
import { demoProject } from "../src/core/demo.js";
import { readProject } from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
import { createEntityObject } from "../src/render/world.js";
function domSetup() {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const element = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  const modal = (_, box) => {
    document.querySelector("#modal").replaceChildren(box);
  };
  const click = (id) => {
    const e = document.querySelector(id);
    assert.ok(e, id);
    e.click();
  };
  return { dom, element, modal, click };
}
test("quest wizard creates a complete defeat quest with missing NPC and enemy atomically", async () => {
  const h = domSetup();
  try {
    const p = demoProject();
    p.entities = [];
    p.quests = [];
    let saved = null;
    questWizard({
      project: p,
      ...h,
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
    });
    h.click("#quest-next");
    h.click("#quest-next");
    assert.match(document.querySelector(".wizard-error").textContent, /NPC/);
    h.click("#quest-create-giver");
    h.click("#quest-next");
    h.click("#quest-create-target");
    h.click("#quest-next");
    assert.equal(p.entities.length, 0);
    assert.equal(saved, null);
    assert.match(document.querySelector("#modal").textContent, /Вернуться/);
    h.click("#quest-next");
    await Promise.resolve();
    assert.equal(saved.quests.length, 1);
    assert.equal(saved.entities.length, 2);
    const q = saved.quests[0],
      g = new GameState(saved);
    g.questAction("accept", q.id, q.giver);
    g.hit(q.target, 1000);
    g.questAction("complete", q.id, q.giver);
    assert.equal(g.state.gold, 25);
    g.questAction("complete", q.id, q.giver);
    assert.equal(g.state.gold, 25);
  } finally {
    h.dom.window.close();
  }
});
test("quest wizard cancellation never inserts staged entities and type change filters targets", () => {
  const h = domSetup();
  try {
    const p = demoProject(),
      before = structuredClone(p);
    questWizard({
      project: p,
      ...h,
      commit: async () => {
        throw Error("unexpected");
      },
    });
    h.click('[data-quest-type="collect"]');
    h.click("#quest-next");
    h.click("#quest-create-giver");
    h.click("#quest-next");
    const names = [...document.querySelectorAll("#quest-targets label")].map(
      (o) => o.textContent,
    );
    assert.ok(names.some((n) => n.startsWith("Солнечный осколок · ID:")));
    assert.ok(!names.some((n) => n.startsWith("Страж руин · ID:")));
    document.querySelector("#modal").close();
    assert.deepEqual(p, before);
  } finally {
    h.dom.window.close();
  }
});
test("enemy editor assigns named GLB clips, saves behavior and restores preview", async () => {
  const h = domSetup();
  try {
    const p = demoProject(),
      e = p.entities.find((e) => e.kind === "enemy");
    p.assets.push({
      id: "actor",
      name: "Actor.glb",
      data: "data:model/gltf-binary;base64,AAAA",
    });
    const o = createEntityObject(e, new Map()),
      view = {
        objects: new Map([[e.id, o]]),
        assetModels: new Map([
          [
            "actor",
            {
              animations: [
                { name: "Idle", duration: 1 },
                { name: "Walk", duration: 1 },
                { name: "Attack", duration: 0.8 },
              ],
            },
          ],
        ]),
        orbit: { target: new T.Vector3() },
        camera: new T.PerspectiveCamera(),
        invalidate: () => {},
      };
    const field = (parent, label, value, type, change) => {
      const i = h.element("input");
      i.type = type;
      i.value = value;
      i.onchange = () => change(i.value);
      parent.append(i);
      return i;
    };
    let saved;
    enemyEditor({
      entity: e,
      project: p,
      view,
      ...h,
      field,
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
      importModel: () => {},
    });
    const preview = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "▶ Проверить: ходьба",
    );
    preview.click();
    assert.equal(typeof view.editorPreview, "function");
    view.editorPreview(0.1);
    stopEnemyPreview(view);
    assert.equal(view.editorPreview, null);
    const model = document.querySelector("#enemy-model");
    model.value = "actor";
    model.dispatchEvent(new h.dom.window.Event("change"));
    assert.equal(document.querySelector("#enemy-walk").value, "Walk");
    assert.equal(document.querySelector("#enemy-attack").value, "Attack");
    h.click("#enemy-save");
    await new Promise(setImmediate);
    const actor = saved.entities.find((x) => x.id === e.id);
    assert.equal(actor.assetId, "actor");
    assert.equal(actor.enemy.attack, "Attack");
    assert.equal(actor.shape, "model");
  } finally {
    h.dom.window.close();
  }
});

test("NPC editor assigns dialogue animations and saves NPC-specific settings", async () => {
  const { npcEditor } = await import("../src/editor/npc-editor.js"),
    h = domSetup();
  try {
    const p = demoProject(),
      e = p.entities.find((e) => e.kind === "npc");
    p.assets.push({
      id: "npcasset",
      name: "NPC.glb",
      data: "data:model/gltf-binary;base64,AAAA",
    });
    const view = {
      objects: new Map([[e.id, createEntityObject(e, new Map())]]),
      assetModels: new Map([
        [
          "npcasset",
          {
            animations: [
              { name: "Idle", duration: 1 },
              { name: "Talk", duration: 2 },
            ],
          },
        ],
      ]),
      orbit: { target: new T.Vector3() },
      camera: new T.PerspectiveCamera(),
      invalidate: () => {},
    };
    const field = (parent, label, value, type, change) => {
      const i = h.element(type === "textarea" ? "textarea" : "input");
      i.value = value;
      i.onchange = () => change(i.value);
      parent.append(i);
      return i;
    };
    let saved;
    npcEditor({
      entity: e,
      project: p,
      view,
      ...h,
      field,
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
      importModel: () => {},
    });
    const model = document.querySelector("#npc-model");
    model.value = "npcasset";
    model.dispatchEvent(new h.dom.window.Event("change"));
    assert.equal(document.querySelector("#npc-talk").value, "Talk");
    h.click("#npc-save");
    await Promise.resolve();
    const npc = saved.entities.find((x) => x.id === e.id);
    assert.equal(npc.assetId, "npcasset");
    assert.equal(npc.npc.talk, "Talk");
    assert.equal(npc.kind, "npc");
  } finally {
    h.dom.window.close();
  }
});
test("motion editor validates condition, saves quest trigger and cancels preview transforms", async () => {
  const { motionEditor } = await import("../src/editor/motion-editor.js"),
    h = domSetup();
  try {
    const p = demoProject(),
      e = p.entities.find((e) => e.kind === "prop"),
      o = createEntityObject(e, new Map());
    const view = {
      objects: new Map([[e.id, o]]),
      orbit: { target: new T.Vector3() },
      camera: new T.PerspectiveCamera(),
      invalidate: () => {},
    };
    const field = (parent, label, value, type, change) => {
      const i = h.element("input");
      i.value = value;
      i.onchange = () => change(i.value);
      parent.append(i);
      return i;
    };
    let saved;
    motionEditor({
      entity: e,
      project: p,
      view,
      ...h,
      field,
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
    });
    h.click("#motion-preview");
    view.editorPreview(1);
    assert.ok(o.position.y > e.position[1]);
    stopEnemyPreview(view);
    assert.deepEqual(o.position.toArray(), e.position);
    let select = document.querySelector("#motion-condition");
    select.value = "quest";
    select.dispatchEvent(new h.dom.window.Event("change"));
    h.click("#motion-save");
    assert.equal(saved, undefined);
    assert.match(document.querySelector(".wizard-error").textContent, /цель/);
    select = document.querySelector("#motion-target");
    select.value = p.quests[0].id;
    select.dispatchEvent(new h.dom.window.Event("change"));
    select = document.querySelector("#motion-trigger");
    select.value = "auto";
    select.dispatchEvent(new h.dom.window.Event("change"));
    h.click("#motion-save");
    await Promise.resolve();
    assert.equal(
      saved.entities.find((x) => x.id === e.id).motion.target,
      p.quests[0].id,
    );
    assert.equal(
      saved.entities.find((x) => x.id === e.id).motion.trigger,
      "auto",
    );
  } finally {
    h.dom.window.close();
  }
});

test("enemy form rejects duplicate ID and preserves combat settings when importing a corpse", async () => {
  const h = domSetup();
  try {
    const p = demoProject(),
      e = p.entities.find((e) => e.kind === "enemy");
    const original = structuredClone(p);
    const view = { assetModels: new Map(), invalidate: () => {} };
    const field = (parent, label, value, type, change) => {
      const i = h.element("input");
      i.type = type;
      i.value = value;
      i.onchange = () => change(i.value);
      parent.append(i);
      return i;
    };
    let saved, imported;
    enemyEditor({
      entity: e,
      project: p,
      view,
      ...h,
      field,
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
      importModel: (id, slot) => {
        imported = { id, slot };
      },
    });
    const id = document.querySelector("#enemy-id");
    id.value = "warden";
    h.click("#enemy-save");
    await new Promise(setImmediate);
    assert.equal(saved, undefined);
    assert.match(document.querySelector("#enemy-error").textContent, /занят/);
    id.value = "bandit_01";
    const damage = document.querySelector("#enemy-damage");
    damage.value = "23";
    damage.dispatchEvent(new h.dom.window.Event("change"));
    const speed = document.querySelector("#enemy-speed");
    speed.value = "3.5";
    speed.dispatchEvent(new h.dom.window.Event("change"));
    document.querySelector("#enemy-health").value = "140";
    h.click("#enemy-corpse-import");
    await new Promise(setImmediate);
    assert.deepEqual(imported, { id: "bandit_01", slot: "corpse" });
    const enemy = saved.entities.find((x) => x.id === "bandit_01");
    assert.equal(enemy.enemy.damage, 23);
    assert.equal(enemy.enemy.speed, 3.5);
    assert.equal(enemy.health, 140);
    assert.deepEqual(p, original);
  } finally {
    h.dom.window.close();
  }
});

test("every action lists every asset; single clips need no second selector", async () => {
  const h = domSetup();
  try {
    const p = demoProject(),
      e = p.entities.find((e) => e.kind === "enemy");
    const scene = new T.Group();
    scene.name = "Actor";
    const single = new T.AnimationClip("Action", 1, []),
      multi = [
        new T.AnimationClip("Walk", 1, []),
        new T.AnimationClip("Run", 1, []),
      ];
    const incompatible = new T.AnimationClip("Other", 1, [
      new T.NumberKeyframeTrack("Missing.rotation[x]", [0, 1], [0, 1]),
    ]);
    const models = new Map([
      ["body", { scene, animations: [single] }],
      ["walk", { scene, animations: multi }],
      ["static", { scene, animations: [] }],
      ["other", { scene, animations: [incompatible] }],
    ]);
    p.assets = [...models.keys()].map((id) => ({
      id,
      name: id + ".glb",
      data: "data:model/gltf-binary;base64,AAAA",
    }));
    e.shape = "model";
    e.assetId = "body";
    const view = { assetModels: models, invalidate: () => {} };
    const field = (parent, label, value, type, change) => {
      const i = h.element("input");
      i.type = type;
      i.value = value;
      i.onchange = () => change(i.value);
      parent.append(i);
      return i;
    };
    let saved;
    enemyEditor({
      entity: e,
      project: p,
      view,
      ...h,
      field,
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
      importModel: () => {},
    });
    for (const key of ["idle", "walk", "attack", "death"]) {
      const select = document.querySelector("#enemy-" + key + "-source");
      assert.deepEqual(
        [...select.options].slice(1).map((o) => o.value),
        p.assets.map((a) => a.id),
      );
      assert.match(select.options[3].textContent, /нет анимаций/);
      assert.equal(select.options[3].disabled, true);
      assert.match(select.options[4].textContent, /не подходит/);
    }
    const choose = (id, value) => {
      const s = document.querySelector(id);
      s.value = value;
      s.dispatchEvent(new h.dom.window.Event("change"));
    };
    choose("#enemy-idle-source", "body");
    assert.equal(document.querySelector("#enemy-idle"), null);
    choose("#enemy-walk-source", "walk");
    assert.ok(document.querySelector("#enemy-walk"));
    choose("#enemy-walk", "Run");
    h.click("#enemy-save");
    await new Promise(setImmediate);
    const config = saved.entities.find((x) => x.id === e.id).enemy;
    assert.equal(config.idle, "Action");
    assert.equal(config.walk, "Run");
    assert.equal(config.animationSources.walk, "walk");
  } finally {
    h.dom.window.close();
  }
});

test("door model and opening presets preview without changing project and save together", async () => {
  const { motionEditor } = await import("../src/editor/motion-editor.js");
  const { createEntity } = await import("../src/core/project.js");
  const h = domSetup();
  try {
    const p = demoProject(),
      e = createEntity("prop", "door");
    e.position = [0, 0, 0];
    e.rotation = [0, Math.PI / 2, 0];
    p.entities.push(e);
    p.assets.push({
      id: "doorAsset",
      name: "Gate.glb",
      data: "data:model/gltf-binary;base64,AAAA",
    });
    const source = new T.Group(),
      geometry = new T.BoxGeometry(1, 2, 0.1);
    source.add(new T.Mesh(geometry, new T.MeshBasicMaterial()));
    const object = createEntityObject(e, new Map()),
      scene = new T.Scene();
    scene.add(object);
    const view = {
      objects: new Map([[e.id, object]]),
      assetModels: new Map([["doorAsset", { scene: source, animations: [] }]]),
      scene,
      orbit: { target: new T.Vector3() },
      camera: new T.PerspectiveCamera(),
      invalidate: () => {},
    };
    const field = (parent, label, value, type, change) => {
      const i = h.element("input");
      i.value = value;
      i.onchange = () => change(i.value);
      parent.append(i);
      return i;
    };
    let saved;
    motionEditor({
      entity: e,
      project: p,
      view,
      ...h,
      field,
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
    });
    const select = document.querySelector("#door-model");
    select.value = "doorAsset";
    select.dispatchEvent(new h.dom.window.Event("change"));
    h.click('[data-motion-preset="Опустить"]');
    h.click("#motion-preview");
    view.editorPreview(1);
    assert.equal(object.visible, false);
    assert.equal(scene.children.length, 2);
    assert.ok(scene.children[1].position.y < 0);
    assert.equal(e.shape, "door");
    stopEnemyPreview(view);
    assert.equal(object.visible, true);
    assert.equal(scene.children.length, 1);
    assert.equal(source.parent, null);
    h.click('[data-motion-preset="Вправо"]');
    h.click("#motion-save");
    await new Promise(setImmediate);
    const door = saved.entities.find((x) => x.id === e.id);
    assert.equal(door.shape, "model");
    assert.equal(door.assetId, "doorAsset");
    assert.equal(door.solid, true);
    assert.ok(Math.abs(door.motion.offset[2] + 2) < 1e-8);
    assert.deepEqual(door.motion.rotation, [0, 0, 0]);
  } finally {
    h.dom.window.close();
  }
});

test("quest wizard selects and retains multiple enemies, adds new ones and versions changed objectives", async () => {
  const h = domSetup();
  try {
    const p = demoProject();
    let saved;
    const commit = async (next) => {
      saved = readProject(next);
      return true;
    };
    questWizard({ project: p, ...h, commit });
    h.click("#quest-next");
    const giver = document.querySelector("#quest-giver");
    giver.value = "warden";
    giver.dispatchEvent(new h.dom.window.Event("change"));
    h.click("#quest-next");
    h.click("#quest-next");
    assert.match(document.querySelector(".wizard-error").textContent, /цель/);
    h.click('#quest-targets input[value="sentinel"]');
    h.click("#quest-create-target");
    assert.equal(
      document.querySelectorAll("#quest-targets input:checked").length,
      2,
    );
    const search = document.querySelector("#quest-target-search");
    search.value = "sentinel";
    search.dispatchEvent(new h.dom.window.Event("input"));
    assert.equal(
      document.querySelectorAll("#quest-targets label:not([hidden])").length,
      1,
    );
    h.click("#quest-next");
    h.click("#quest-next");
    await Promise.resolve();
    const q = saved.quests.at(-1);
    assert.equal(q.targets.length, 2);
    assert.equal(saved.entities.length, p.entities.length + 1);
    assert.equal(saved.contentVersion, p.contentVersion);
    const initial = saved;
    questWizard({ project: initial, existing: q, ...h, commit });
    h.click("#quest-next");
    h.click("#quest-next");
    assert.equal(
      document.querySelectorAll("#quest-targets input:checked").length,
      2,
    );
    h.click('#quest-targets input[value="sentinel"]');
    h.click("#quest-next");
    assert.match(document.querySelector("#modal").textContent, /прежние сейвы/);
    h.click("#quest-next");
    await Promise.resolve();
    assert.equal(saved.quests.at(-1).targets.length, 1);
    assert.equal(saved.contentVersion, initial.contentVersion + 1);
    assert.throws(
      () => new GameState(saved).load(new GameState(initial).save()),
      /версии контента/,
    );
  } finally {
    h.dom.window.close();
  }
});
