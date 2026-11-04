import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { generatorEditor } from "../src/editor/generator-editor.js";
import { readProject } from "../src/core/project.js";

function setup(commit) {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const element = (tag, text = "", cls = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = cls;
    return e;
  };
  const modal = (_, content) => {
    const dialog = document.querySelector("#modal");
    dialog.replaceChildren(content);
    dialog.setAttribute("open", "");
  };
  generatorEditor({ modal, element, commit, seed: "ui-test" });
  return dom;
}
test("preview is staged, input invalidates it, and submit commits a complete editable project", async () => {
  const saved = [];
  const dom = setup(async (next) => {
    saved.push(readProject(next));
    return true;
  });
  try {
    document.querySelector("#generator-preview-button").click();
    const preview = document.querySelector("#generator-preview").textContent;
    assert.match(preview, /2 финала/);
    assert.equal(saved.length, 0);
    const story = document.querySelector("#generator-story");
    story.value = "roots";
    story.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(document.querySelector("#generator-preview").textContent, "");
    document.querySelector("#generator-create").click();
    await new Promise(setImmediate);
    assert.equal(saved.length, 1);
    assert.match(saved[0].title, /Право корней/);
    assert.equal(document.querySelector("#modal").hasAttribute("open"), false);
  } finally {
    dom.window.close();
    delete globalThis.document;
  }
});
test("failed commit stays open, invalid input cannot commit, repeated submission is guarded", async () => {
  let release,
    commits = 0;
  const dom = setup(async () => {
    commits++;
    return await new Promise((resolve) => {
      release = resolve;
    });
  });
  try {
    const form = document.querySelector("form"),
      seed = document.querySelector("#generator-seed");
    seed.value = " ";
    await form.onsubmit({ preventDefault() {} });
    assert.equal(commits, 0);
    assert.match(document.querySelector(".wizard-error").textContent, /Seed/);
    seed.value = "valid";
    const pending = form.onsubmit({ preventDefault() {} });
    await form.onsubmit({ preventDefault() {} });
    assert.equal(commits, 1);
    assert.equal(document.querySelector("#generator-create").disabled, true);
    release(false);
    await pending;
    assert.equal(document.querySelector("#modal").hasAttribute("open"), true);
    assert.equal(document.querySelector("#generator-create").disabled, false);
    assert.match(
      document.querySelector(".wizard-error").textContent,
      /Не удалось/,
    );
  } finally {
    dom.window.close();
    delete globalThis.document;
  }
});

test("maze mode previews real section and gate counts, disables unrelated story choice and commits a labyrinth", async () => {
  let project;
  const dom = setup(async (next) => {
    project = readProject(next);
    return true;
  });
  try {
    const mode = document.querySelector("#generator-mode");
    mode.value = "maze";
    mode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(document.querySelector("#generator-story").disabled, true);
    document.querySelector("#generator-preview-button").click();
    const text = document.querySelector("#generator-preview").textContent;
    assert.match(text, /4 секций/);
    assert.match(text, /11 дверей/);
    assert.match(text, /старт снаружи/);
    assert.doesNotMatch(text, /2 финала/);
    document.querySelector("#generator-create").click();
    await new Promise(setImmediate);
    assert.ok(project.id.startsWith("generated-maze-v1-"));
    assert.equal(
      project.quests.filter((q) => q.id.startsWith("maze-side-")).length,
      2,
    );
    assert.equal(document.querySelector("#modal").hasAttribute("open"), false);
  } finally {
    dom.window.close();
    delete globalThis.document;
  }
});

test("highlands mode exposes four cities, two endings and exports actual hills", async () => {
  let project;
  const dom = setup(async (next) => {
    project = readProject(next);
    return true;
  });
  try {
    const mode = document.querySelector("#generator-mode");
    mode.value = "highlands";
    mode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(document.querySelector("#generator-story").disabled, true);
    document.querySelector("#generator-preview-button").click();
    const preview = document.querySelector("#generator-preview").textContent;
    assert.match(preview, /3 города в долинах \+ 1 на вершине/);
    assert.match(preview, /2 финала/);
    document.querySelector("#generator-create").click();
    await new Promise(setImmediate);
    assert.ok(project.id.startsWith("generated-highlands-v1-"));
    assert.equal(
      project.entities.filter((e) => /^highland-town-\d$/.test(e.id)).length,
      4,
    );
    assert.ok(Math.max(...project.world.terrain.heights) >= 26);
    assert.equal(document.querySelector("#modal").hasAttribute("open"), false);
  } finally {
    dom.window.close();
    delete globalThis.document;
  }
});
