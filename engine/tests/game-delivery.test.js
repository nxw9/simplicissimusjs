import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { PerspectiveCamera } from "three";
import { buildGameTemplate } from "../scripts/single-html.mjs";
import { exportGameHTML } from "../src/core/export-html.js";
import { demoProject } from "../src/core/demo.js";
import { GameState } from "../src/core/game.js";
import { GameMenu } from "../src/render/game-menu.js";
import { TouchControls } from "../src/render/touch-controls.js";
import { Session } from "../src/render/session.js";
import { MouseLook } from "../src/render/mouse-look.js";
import { animatedGLB } from "./animated-glb.js";

test("one HTML contains project, embedded GLB, CSS, four textures and parseable classic JS with safe JSON", async () => {
  const template = await buildGameTemplate(),
    p = demoProject();
  p.title = "Долина </script><b> & $&";
  p.entities[0].name = "</script><script>alert(1)</script>";
  p.assets.push({
    id: "embedded",
    name: "Model.glb",
    data:
      "data:model/gltf-binary;base64," +
      Buffer.from(animatedGLB()).toString("base64"),
  });
  const html = exportGameHTML(template, p),
    dom = new JSDOM(html),
    doc = dom.window.document;
  assert.equal(doc.querySelectorAll("script").length, 2);
  assert.equal(
    doc.querySelectorAll("script[src],link[href],script[type=module]").length,
    0,
  );
  assert.deepEqual(
    JSON.parse(doc.querySelector("#hearth-project").textContent),
    p,
  );
  const code = doc.scripts[1].textContent;
  assert.doesNotThrow(() => new Script(code));
  assert.ok(!code.includes("import.meta"));
  assert.equal((code.match(/data:image\/webp;base64/g) || []).length, 4);
  assert.ok(doc.querySelector("style").textContent.includes(".touch-controls"));
  assert.ok(!html.includes("__HEARTH_PROJECT_JSON__"));
  dom.window.close();
  // Execute the actual inline IIFE, not just its syntax. GPU is deliberately
  // stopped after URL initialization; an invalid base must fail this test.
  const errors = [],
    virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const offline = new JSDOM(html, {
    url: "file:///C:/game.html",
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      window.TextEncoder = globalThis.TextEncoder;
      window.TextDecoder = globalThis.TextDecoder;
      window.structuredClone = globalThis.structuredClone;
      window.HTMLCanvasElement.prototype.getContext = () => {
        throw Error("TEST_WEBGL_REACHED");
      };
    },
  });
  assert.deepEqual(errors, []);
  assert.match(
    offline.window.document.querySelector(".fatal")?.textContent ?? "",
    /TEST_WEBGL_REACHED/,
  );
  offline.window.close();
});
function environment(fn) {
  const dom = new JSDOM('<div id="host"></div>', { url: "https://test.local" }),
    previous = {};
  for (const k of ["window", "document", "localStorage"]) {
    previous[k] = globalThis[k];
    globalThis[k] = dom.window[k];
  }
  try {
    return fn(dom);
  } finally {
    for (const k of Object.keys(previous)) {
      if (previous[k] === undefined) delete globalThis[k];
      else globalThis[k] = previous[k];
    }
    dom.window.close();
  }
}
function fakeSession() {
  const project = demoProject(),
    host = document.querySelector("#host"),
    camera = new PerspectiveCamera(),
    messages = [];
  const s = {
    project,
    host,
    ui: document.createElement("div"),
    game: new GameState(project),
    keys: new Set(),
    settings: {},
    view: {
      camera,
      renderer: { domElement: {} },
      setQuality(q) {
        this.quality = q;
      },
    },
    notify: (m) => messages.push(m),
    onBlur() {
      this.keys.clear();
      this.touch?.reset();
    },
    lock() {
      this.locks = (this.locks ?? 0) + 1;
    },
    load(raw) {
      this.game.load(raw);
    },
    mouseReport: () => "{}",
    paused: false,
    yaw: 0,
    pitch: 0,
  };
  s.look = new MouseLook(camera);
  s.controlsActive = () => !s.paused && s.game.alive;
  s.attack = () => (s.attacks = (s.attacks ?? 0) + 1);
  s.interact = () => (s.interactions = (s.interactions ?? 0) + 1);
  host.append(s.ui);
  s.touch = new TouchControls(s);
  return { s, messages };
}
test("menu starts paused, supports three slots, confirms overwrite and loads compatible progress", () =>
  environment(() => {
    const { s } = fakeSession(),
      m = new GameMenu(s, { startPaused: true });
    assert.equal(s.paused, true);
    assert.equal(m.started, false);
    m.root.querySelector("[data-menu-action=new]").click();
    assert.equal(s.paused, false);
    s.game.state.gold = 23;
    m.open();
    m.render("saves");
    m.root.querySelector("[data-menu-action=save-2]").click();
    assert.equal(
      JSON.parse(localStorage.getItem(m.key + ":slot:2")).raw,
      s.game.save(),
    );
    s.game.state.gold = 99;
    m.root.querySelector("[data-menu-action=save-2]").click();
    assert.match(m.root.textContent, /Перезаписать слот 2/);
    assert.equal(
      JSON.parse(JSON.parse(localStorage.getItem(m.key + ":slot:2")).raw).gold,
      23,
    );
    m.render("loads");
    assert.equal(
      m.root.querySelector("[data-menu-action=load-1]").disabled,
      true,
    );
    m.root.querySelector("[data-menu-action=load-2]").click();
    assert.equal(s.game.state.gold, 23);
    assert.equal(s.paused, false);
    m.open();
    window.dispatchEvent(
      new window.KeyboardEvent("keydown", { code: "Escape" }),
    );
    assert.equal(s.paused, true);
    m.resume();
    window.dispatchEvent(new window.Event("blur"));
    assert.equal(s.paused, true);
    m.dispose();
    const reopened = new GameMenu(s, { startPaused: true });
    s.game.state.gold = 0;
    reopened.root.querySelector('[data-menu-action="continue-save"]').click();
    assert.equal(s.game.state.gold, 23);
    reopened.dispose();
    s.touch.dispose();
    assert.equal(document.querySelector(".game-menu"), null);
  }));
test("settings persist, touch can be forced, storage failure is recoverable", () =>
  environment(() => {
    const { s, messages } = fakeSession(),
      m = new GameMenu(s);
    m.open("settings");
    const input = m.root.querySelector("[data-setting=controls]");
    input.value = "touch";
    input.dispatchEvent(new window.Event("change"));
    assert.equal(s.touch.enabled, true);
    assert.equal(
      JSON.parse(localStorage.getItem(m.settingsKey)).controls,
      "touch",
    );
    const quality = m.root.querySelector("[data-setting=quality]");
    quality.value = "fast";
    quality.dispatchEvent(new window.Event("change"));
    assert.equal(s.view.quality, "fast");
    for(const value of ["low","minimum"]){quality.value=value;quality.dispatchEvent(new window.Event("change"));assert.equal(s.view.quality,value);assert.equal(JSON.parse(localStorage.getItem(m.settingsKey)).quality,value);}
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      setItem() {
        throw Error("Quota exceeded");
      },
      getItem() {
        throw Error("denied");
      },
    };
    try {
      m.save(1);
      assert.match(messages.at(-1), /Скачайте сейв/);
      m.render("loads");
      assert.equal(
        m.root.querySelector("[data-menu-action=load-1]").disabled,
        true,
      );
    } finally {
      globalThis.localStorage = original;
    }
    m.dispose();
    s.touch.dispose();
  }));
test("touch movement, look and action pointers coexist; cancel and pause release controls", () =>
  environment(() => {
    const { s } = fakeSession();
    s.touch.setEnabled(true);
    const stick = s.touch.root.querySelector(".touch-stick"),
      look = s.touch.root.querySelector(".touch-look");
    stick.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
    const e = (pointerId, x, y) => ({
      pointerId,
      clientX: x,
      clientY: y,
      timeStamp: 1,
      preventDefault() {},
      stopPropagation() {},
    });
    stick.onpointerdown(e(1, 85, 50));
    assert.equal(s.touch.move.x, 1);
    look.onpointerdown(e(2, 200, 100));
    look.onpointermove(e(2, 220, 110));
    assert.ok(s.yaw < 0);
    assert.ok(s.pitch < 0);
    assert.equal(s.touch.move.x, 1);
    s.touch.root.querySelector("[data-touch=attack]").onpointerdown(e(3, 0, 0));
    assert.equal(s.attacks, 1);
    s.touch.root.querySelector("[data-touch=jump]").onpointerdown(e(4, 0, 0));
    assert.equal(s.jumpRequested, true);
    const sprint = s.touch.root.querySelector("[data-touch=sprint]");
    sprint.onpointerdown(e(5, 0, 0));
    assert.equal(s.touch.sprint, true);
    sprint.onpointercancel(e(5, 0, 0));
    assert.equal(s.touch.sprint, false);
    stick.onpointercancel(e(1, 0, 0));
    assert.deepEqual(s.touch.move, { x: 0, z: 0 });
    s.touch.reset();
    const yaw = s.yaw;
    look.onpointermove(e(2, 1000, 1000));
    assert.equal(s.yaw, yaw);
    s.paused = true;
    s.touch.root.querySelector("[data-touch=attack]").onpointerdown(e(3, 0, 0));
    assert.equal(s.attacks, 1);
    s.touch.dispose();
  }));
test("touch drives actual Session movement without pointer lock and pause freezes the world", () =>
  environment(() => {
    const { s } = fakeSession();
    Object.setPrototypeOf(s, Session.prototype);
    s.project.world.terrain = null;
    s.game.state.position = [0, 1.7, 0];
    s.view.camera.position.set(0, 1.7, 0);
    s.touch.setEnabled(true);
    s.touch.move = { x: 1, z: 0 };
    s.attackCooldown = 0;
    s.motion = { velocity: 0, grounded: true };
    s.promptTimer = 10;
    s.update(1 / 60);
    assert.ok(s.view.camera.position.x > 0);
    const position = s.view.camera.position.toArray(),
      time = s.game.state.worldTime;
    s.paused = true;
    s.update(1);
    assert.deepEqual(s.view.camera.position.toArray(), position);
    assert.equal(s.game.state.worldTime, time);
    s.touch.dispose();
  }));
