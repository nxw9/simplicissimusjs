import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createMap } from "../src/core/create-map.js";
import { createMapEditor } from "../src/editor/create-map-editor.js";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { GameState, History } from "../src/core/game.js";
import { moveCharacter } from "../src/core/movement.js";
import { heightAt, moveGrounded, sculpt } from "../src/core/terrain.js";
import { worldBounds } from "../src/core/world-bounds.js";

test("new maps keep the exact requested size, a centered start and editable flat terrain", () => {
  for (const size of [20, 80, 123.45, 800, 2000]) {
    const p = createMap({ size, title: "  Моя карта  " });
    assert.equal(p.title, "Моя карта");
    assert.equal(p.world.size, size);
    assert.deepEqual(p.world.spawn, [0, 1.7, 0]);
    assert.deepEqual(p.entities, []);
    assert.deepEqual(p.quests, []);
    assert.deepEqual(p.assets, []);
    assert.equal(p.world.playBounds, null);
    assert.equal(p.world.terrain.heights.length, (p.world.terrain.resolution + 1) ** 2);
    assert.ok(p.world.terrain.heights.every(h => h === 0));
    const region = p.world.terrain.regions[0];
    assert.deepEqual(region.min, [-size / 2, -size / 2]);
    assert.deepEqual(region.max, [size / 2, size / 2]);
    assert.deepEqual(readProject(serializeProject(p)), p);
    assert.ok(sculpt(p.world, region, 0, 0, 8, 2, 1, "raise"));
    assert.ok(heightAt(p.world, 0, 0) > 0);
  }
  assert.notEqual(createMap().id, createMap().id);
});

test("invalid dimensions and empty titles cannot create a map", () => {
  for (const size of [0, -1, 19.99, 2000.01, NaN, Infinity, -Infinity, "800", null])
    assert.throws(() => createMap({ size }), /Размер стороны/);
  for (const title of ["", "   ", "a".repeat(161), null])
    assert.throws(() => createMap({ title }), /название/);
});

test("players and NPCs cross every map edge and saves retain positions outside the terrain", () => {
  const p = createMap({ size: 20 });
  assert.equal(worldBounds(p.world), null);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const start = [9 * dx, 1.7, 9 * dz];
    const positions = [
      moveCharacter(p.world, start, dx * 5, dz * 5, 1, {}, [], true),
      moveGrounded(p.world, start, dx * 5, dz * 5),
    ];
    for (const position of positions) {
      assert.ok(position[0] * dx + position[2] * dz > 13.9);
      const game = new GameState(p);
      game.state.position = position;
      const restored = new GameState(readProject(serializeProject(p)));
      restored.load(game.save());
      assert.deepEqual(restored.state.position, position);
    }
  }
});

function setup(commit, onCreated) {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const element = (tag, text = "", className = "") => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  };
  createMapEditor({
    modal: (_, form) => {
      const dialog = document.querySelector("#modal");
      dialog.replaceChildren(form);
      dialog.setAttribute("open", "");
    },
    element, commit, onCreated,
  });
  return {
    dom,
    form: document.querySelector("form"),
    size: document.querySelector("#new-map-size"),
    apply: document.querySelector("#new-map-create"),
    close() { dom.window.close(); delete globalThis.document; },
  };
}

test("dialog stages creation, rejects invalid size and cancellation keeps the current map", async () => {
  let commits = 0;
  const h = setup(async () => { commits++; return true; });
  try {
    assert.match(document.querySelector("#new-map-preview").textContent, /80 × 80/);
    for (const value of ["", "0", "2001"]) {
      h.size.value = value;
      h.size.dispatchEvent(new h.dom.window.Event("input"));
      assert.ok(h.apply.disabled);
      await h.form.onsubmit({ preventDefault() {} });
      assert.equal(commits, 0);
    }
    h.size.value = "350.5";
    h.size.dispatchEvent(new h.dom.window.Event("input"));
    assert.equal(h.apply.disabled, false);
    assert.match(document.querySelector("#new-map-preview").textContent, /350,5 × 350,5/);
    document.querySelector("#new-map-cancel").click();
    assert.equal(document.querySelector("#modal").open, false);
    assert.equal(commits, 0);
  } finally { h.close(); }
});

test("creating from a bounded project is one undo step and does not inherit its objects or borders", async () => {
  const original = demoProject();
  original.world.playBounds = { min: [-40, -40], max: [40, 40] };
  const before = structuredClone(original), history = new History();
  let current = original, created;
  const h = setup(async next => {
    history.push(current);
    current = readProject(next);
    return true;
  }, next => { created = next; });
  try {
    h.size.value = "800";
    document.querySelector("#new-map-title").value = "Новый мир";
    h.apply.click();
    await new Promise(setImmediate);
    assert.equal(current.title, "Новый мир");
    assert.equal(current.world.size, 800);
    assert.equal(current.world.playBounds, null);
    assert.equal(current.entities.length, 0);
    assert.equal(created.id, current.id);
    assert.equal(document.querySelector("#modal").open, false);
    assert.deepEqual(original, before);
    assert.equal(history.undoStack.length, 1);
    assert.deepEqual(history.undo(current), before);
    assert.deepEqual(history.redo(before), current);
  } finally { h.close(); }
});

test("failed commits remain retryable and repeated submission cannot create duplicate projects", async () => {
  let release, commits = 0, callbacks = 0;
  const h = setup(async () => {
    commits++;
    return new Promise(resolve => { release = resolve; });
  }, () => { callbacks++; });
  try {
    const pending = h.form.onsubmit({ preventDefault() {} });
    await h.form.onsubmit({ preventDefault() {} });
    assert.equal(commits, 1);
    assert.ok(h.apply.disabled);
    release(false);
    await pending;
    assert.ok(document.querySelector("#modal").open);
    assert.equal(h.apply.disabled, false);
    assert.match(document.querySelector(".wizard-error").textContent, /Не удалось/);
    assert.equal(callbacks, 0);
    const retry = h.form.onsubmit({ preventDefault() {} });
    release(true);
    await retry;
    assert.equal(commits, 2);
    assert.equal(callbacks, 1);
    assert.equal(document.querySelector("#modal").open, false);
  } finally { h.close(); }
});
