import { gameTemplatePlugin } from "../scripts/single-html.mjs";
/** DOM integration only: real scene/tool code, a stub renderer instead of WebGL. */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { JSDOM } from "jsdom";
import { animatedGLB } from "./animated-glb.js";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll(
  "\\",
  "/",
);
test("editor UI: catalog → placement → terrain area → sculpt → undo → play", async () => {
  const output = await build({
    configFile: false,
    root,
    logLevel: "silent",
    plugins: [
      gameTemplatePlugin(),
      {
        name: "renderer-test-double",
        enforce: "pre",
        resolveId(source, importer) {
          if (
            source === "../render/world.js" &&
            importer?.endsWith("/editor/main.js")
          )
            return "\0test-world";
        },
        load(id) {
          if (id === "\0test-world")
            return `
    import * as T from 'three';
    import {WorldView as RealView} from ${JSON.stringify(root + "src/render/world.js")};
    export class WorldView {
      constructor(host){
        const view=Object.create(RealView.prototype),canvas=document.createElement('canvas');host.append(canvas);
        const captures=new Set();canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
        Object.assign(view,{scene:new T.Scene(),root:new T.Group(),renderer:{domElement:canvas,info:{render:{triangles:0}}},camera:new T.PerspectiveCamera(55,4/3,0.1,250),orbit:{enabled:true,target:new T.Vector3()},objects:new Map(),mixers:[],playing:false,ray:new T.Raycaster(),grid:{visible:true}});
        view.setQuality=()=>{};view.scene.add(view.root);view.camera.position.set(24,23,29);
        view.groundHit=()=>new T.Vector3(...globalThis.__testHit);
        globalThis.__testView=view;return view;
      }
    }
  `;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      target: "esnext",
      rollupOptions: { input: root + "src/editor/main.js" },
    },
  });
  const chunk = output.output.find((x) => x.type === "chunk" && x.isEntry);
  const dom = new JSDOM('<!doctype html><div id="app"></div>', {
    url: "http://localhost/",
  });
  globalThis.FileReader = dom.window.FileReader;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.__testHit = [3, 0, 4];
  const previousSetInterval = globalThis.setInterval,
    previousSetTimeout = globalThis.setTimeout,
    previousCreate = URL.createObjectURL;
  const downloads = [];
  globalThis.setInterval = () => 0;
  globalThis.setTimeout = () => 0;
  URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return "blob:test";
  };
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  const tick = async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise(setImmediate);
      if (!document.body.classList.contains("busy")) return;
    }
    throw Error("UI transaction did not finish");
  };
  const click = (selector) => {
    const node = document.querySelector(selector);
    assert.ok(node, selector);
    node.click();
  };
  const pointer = (type) =>
    document.querySelector("canvas").dispatchEvent(
      new dom.window.MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 100,
      }),
    );
  const project = async () => {
    click("#export");
    return JSON.parse(await downloads.at(-1).text());
  };
  // Dialog methods are browser APIs absent from jsdom, not application behavior under test.
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  try {
    await new (Object.getPrototypeOf(async function () {}).constructor)(
      chunk.code.replaceAll(
        "import.meta.url",
        JSON.stringify("http://localhost/editor.js"),
      ),
    )();
    assert.equal(
      document.querySelector("#status").textContent,
      "● Готово к работе",
    );
    const beforeGeneration = await project();
    // Wall controls work on a map without any selected terrain region.
    click('[data-tool="wall"]');
    assert.ok(document.querySelector("#wall-model"));
    assert.equal(document.querySelector("#wall-straight-toggle").hidden,false);
    const wallModel = document.querySelector("#wall-model"); wallModel.value = "stone";
    wallModel.dispatchEvent(new window.Event("change"));
    const wallWidth = document.querySelector("#wall-width"); wallWidth.value = "3";
    wallWidth.dispatchEvent(new window.Event("input"));
    click("#wall-mode-line");click("#wall-angle-lock");
    const wallAngle = document.querySelector("#wall-angle");wallAngle.value = "37";
    wallAngle.dispatchEvent(new window.Event("change"));
    globalThis.__testHit = [-8,0,-8];pointer("pointerdown");
    globalThis.__testHit = [8,0,8];pointer("pointermove");pointer("pointerup");await tick();
    const withWall = await project(), sections = withWall.entities.slice(beforeGeneration.entities.length);
    assert.ok(sections.length > 1);
    for (const e of sections) {assert.equal(e.scale[2],3);assert.ok(Math.abs(e.rotation[1]+37*Math.PI/180)<1e-8);}
    click("#undo");await tick();assert.deepEqual(await project(),beforeGeneration);
    click("#redo");await tick();assert.deepEqual(await project(),withWall);
    click("#undo");await tick();
    click("#wall-straight-toggle");assert.equal(document.querySelector("#wall-mode-free").getAttribute("aria-pressed"),"true");
    globalThis.__testHit = [3,0,4];
    click("#generate-adventure");
    document.querySelector("#generator-seed").value = "integration-test";
    click("#generator-preview-button");
    assert.equal((await project()).id, beforeGeneration.id);
    click("#generator-create");
    await tick();
    const generated = await project();
    assert.ok(generated.id.startsWith("generated-v1-"));
    assert.equal(generated.quests.length, 6);
    assert.ok(generated.entities.some((e) => e.id === "guide"));
    click("#undo");
    await tick();
    assert.deepEqual(await project(), beforeGeneration);
    click("#generate-adventure");
    const mazeMode = document.querySelector("#generator-mode");
    mazeMode.value = "maze";
    mazeMode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    click("#generator-create");
    await tick();
    const maze = await project();
    assert.ok(maze.id.startsWith("generated-maze-v1-"));
    assert.ok(maze.entities.some((e) => e.id === "maze-entrance" && e.solid));
    click("#undo");
    await tick();
    assert.deepEqual(await project(), beforeGeneration);
    click("#generate-adventure");
    const hillsMode = document.querySelector("#generator-mode");
    hillsMode.value = "highlands";
    hillsMode.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    click("#generator-create");
    await tick();
    const hills = await project();
    assert.ok(hills.id.startsWith("generated-highlands-v1-"));
    assert.ok(globalThis.__testView.camera.far >= hills.world.size * 2);
    assert.ok(globalThis.__testView.scene.fog.far > hills.world.size);
    click("#undo");
    await tick();
    assert.deepEqual(await project(), beforeGeneration);

    click("#build");
    const exportedHTML = await downloads.at(-1).text();
    const exportedDOM = new JSDOM(exportedHTML);
    assert.equal(
      JSON.parse(
        exportedDOM.window.document.querySelector("#hearth-project")
          .textContent,
      ).id,
      (await project()).id,
    );
    assert.equal(
      exportedDOM.window.document.querySelectorAll("script[src],link[href]")
        .length,
      0,
    );
    exportedDOM.window.close();
    click("#landscape-open");
    assert.ok(document.querySelector("#landscape-full"));
    click("#landscape-full");
    await tick();
    assert.equal((await project()).world.terrain.regions[0].name, "Весь мир");
    const beforeFill = await project();
    click('#terrain-materials [data-material="3"]');
    click("#terrain-fill-material");
    await tick();
    assert.ok((await project()).world.terrain.paint.every((id) => id === 3));
    assert.deepEqual(
      (await project()).world.terrain.heights,
      beforeFill.world.terrain.heights,
    );
    click("#undo");
    await tick();
    assert.equal((await project()).world.terrain.paint, undefined);
    click('[data-landscape-brush="flatten"]');
    assert.match(document.querySelector("#tool-title").textContent, /площадку/);
    click("#undo");
    await tick();
    click("#landscape-done");
    click("#environment-open");
    assert.ok(document.querySelector("#environment-import"));
    assert.ok(document.querySelector("#environment-drop"));
    click("#close-modal");
    click("#add-top");
    [...document.querySelectorAll(".catalog-card")]
      .find((b) => b.textContent.includes("Дверь"))
      .click();
    pointer("pointermove");
    pointer("pointerdown");
    pointer("pointerup");
    await tick();
    assert.ok(document.querySelector("#modal[open] #door-model"));
    click('[data-motion-preset="Опустить"]');
    click("#motion-save");
    await tick();
    assert.deepEqual(
      (await project()).entities.at(-1).motion.offset,
      [0, -2.5, 0],
    );
    const beforeCycle = await project();
    click("#day-night-settings");
    click('[data-hour="0"]');
    assert.equal(globalThis.__testView.dayNight.sun.intensity, 0);
    assert.deepEqual(await project(), beforeCycle);
    click("#close-modal");
    document.querySelector("#modal").dispatchEvent(new window.Event("close"));
    assert.equal(globalThis.__testView.dayNight.sky.visible, false);
    click("#day-night-settings");
    const cycleDuration = document.querySelector("#day-night-duration");
    cycleDuration.value = "0";
    click("#day-night-save");
    await tick();
    assert.deepEqual(await project(), beforeCycle);
    cycleDuration.value = "1";
    document.querySelector("#day-night-start").value = "23:59";
    click("#day-night-save");
    await tick();
    assert.equal((await project()).world.dayNight.dayMinutes, 1);
    const initial = await project();
    click("#add-top");
    assert.ok(document.querySelector("#modal[open]"));
    click(".catalog-card");
    assert.equal(
      document.querySelector("#tool-title").textContent,
      "Установите объект",
    );
    click('#placement-materials [data-material="4"]');
    pointer("pointermove");
    pointer("pointerdown");
    pointer("pointerup");
    await tick();
    const placed = await project();
    assert.equal(placed.entities.length, initial.entities.length + 1);
    assert.deepEqual(placed.entities.at(-1).position, [3, 0.5, 4]);
    assert.equal(placed.entities.at(-1).surface, 4);
    assert.ok(document.querySelector("#object-materials"));
    assert.ok(document.querySelector("#snap-ground"));
    assert.ok(document.querySelector(".ground-button"));
    click('[data-tool="area"]');
    globalThis.__testHit = [-8, 0, -8];
    pointer("pointerdown");
    globalThis.__testHit = [8, 0, 8];
    pointer("pointermove");
    pointer("pointerup");
    await tick();
    const area = await project();
    assert.equal(area.world.terrain.regions.length, 1);
    assert.equal(
      document
        .querySelector('[data-tool="raise"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    click('#terrain-materials [data-material="2"]');
    const paintTogether = document.querySelector("#paint-with-sculpt");
    paintTogether.checked = true;
    paintTogether.dispatchEvent(new window.Event("change"));
    globalThis.__testHit = [0, 0, 0];
    pointer("pointermove");
    pointer("pointerdown");
    for (let i = 0; i < 10; i++) globalThis.__testView.editorTick(0.05);
    pointer("pointerup");
    await tick();
    assert.ok((await project()).world.terrain.heights.some((h) => h > 0));
    click("#undo");
    await tick();
    assert.ok((await project()).world.terrain.heights.every((h) => h === 0));
    click("#redo");
    await tick();
    assert.ok((await project()).world.terrain.heights.some((h) => h > 0));
    assert.ok((await project()).world.terrain.paint.some((id) => id === 2));
    const sculptHeights = (await project()).world.terrain.heights;
    click('[data-landscape-brush="paint"]');
    click('#terrain-materials [data-material="3"]');
    pointer("pointerdown");
    globalThis.__testView.editorTick(0.05);
    pointer("pointerup");
    await tick();
    assert.deepEqual((await project()).world.terrain.heights, sculptHeights);
    assert.ok((await project()).world.terrain.paint.some((id) => id === 3));
    click('[data-tool="cliff"]');
    const beforeCliff=(await project()).world.terrain.heights;
    pointer("pointerdown");pointer("pointerup");await tick();
    const afterCliff=(await project()).world.terrain.heights;
    assert.ok(afterCliff.some((v,i)=>v>beforeCliff[i]+2));
    click("#undo");await tick();assert.deepEqual((await project()).world.terrain.heights,beforeCliff);
    click('[data-tool="road"]');assert.ok(document.querySelector("#road-grade"));
    globalThis.__testHit=[-6,0,0];pointer("pointerdown");
    globalThis.__testHit=[6,0,0];pointer("pointermove");pointer("pointerup");await tick();
    click("#undo");await tick();assert.deepEqual((await project()).world.terrain.heights,beforeCliff);
    click("#place-player");
    globalThis.__testHit = [12, 0, 8];
    pointer("pointermove");
    pointer("pointerdown");
    pointer("pointerup");
    await tick();
    assert.equal((await project()).world.spawn[0], 12);
    assert.ok(
      document.querySelector("#spawn-coordinates").textContent.includes("12.0"),
    );
    click("#find-player");
    assert.equal(globalThis.__testView.orbit.target.x, 12);
    click("#weapon-settings");
    document.querySelector("#weapon-asset").value = "builtin";
    click("#weapon-save");
    await tick();
    assert.equal((await project()).weapon.assetId, null);
    click("#add-enemy");
    globalThis.__testHit = [-12, 0, -12];
    pointer("pointermove");
    pointer("pointerdown");
    pointer("pointerup");
    await tick();
    assert.ok(document.querySelector("#modal[open] #enemy-id"));
    document.querySelector("#enemy-id").value = "ruin_guard";
    document.querySelector("#enemy-health").value = "80";
    const damage = document.querySelector("#enemy-damage");
    damage.value = "17";
    damage.dispatchEvent(new window.Event("change"));
    assert.ok(document.querySelector("#enemy-death-source"));
    assert.ok(document.querySelector("#enemy-corpse"));
    click("#enemy-save");
    await tick();
    const addedEnemy = (await project()).entities.find(
      (e) => e.id === "ruin_guard",
    );
    assert.equal(addedEnemy.health, 80);
    assert.equal(addedEnemy.enemy.damage, 17);
    assert.equal(addedEnemy.kind, "enemy");
    click("#patrol-edit");
    globalThis.__testHit=[-8,0,-12];pointer("pointerdown");pointer("pointerup");await tick();
    globalThis.__testHit=[-8,0,-8];pointer("pointerdown");pointer("pointerup");await tick();
    const routeOf=async()=> (await project()).entities.find(e=>e.id==="ruin_guard").patrol;
    assert.deepEqual((await routeOf()).points,[[-12,-12],[-8,-12],[-8,-8]]);
    assert.equal(document.querySelectorAll(".patrol-label").length,3);
    const routeMode=document.querySelector("#patrol-mode");routeMode.value="loop";routeMode.dispatchEvent(new window.Event("change"));await tick();
    const routePause=document.querySelector("#patrol-pause");routePause.value="2";routePause.dispatchEvent(new window.Event("change"));await tick();
    assert.equal((await routeOf()).mode,"loop");assert.equal((await routeOf()).pause,2);
    click('[data-patrol-point="1"] button[title="Перенести точку щелчком"]');
    globalThis.__testHit=[-6,0,-12];pointer("pointerdown");pointer("pointerup");await tick();
    assert.deepEqual((await routeOf()).points[1],[-6,-12]);
    click("#undo");await tick();assert.deepEqual((await routeOf()).points[1],[-8,-12]);
    click("#patrol-done");assert.ok(document.querySelector("#enemy-settings"));
    click("#enemy-settings");
    click("#enemy-import");
    await new Promise(setImmediate);
    const fileInput = document.querySelector("#model-file");
    assert.equal(fileInput.multiple, true);
    const upload = async (names) => {
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: names.map(
          (name, i) =>
            new dom.window.File([animatedGLB("Action", i + 1)], name, {
              type: "model/gltf-binary",
            }),
        ),
      });
      const pending = fileInput.onchange({ target: fileInput });
      click("#model-import-confirm");
      await pending;
      await tick();
    };
    await upload(["Actor.glb", "Walk.glb", "Attack.glb"]);
    let imported = await project(),
      actor = imported.entities.find((e) => e.id === "ruin_guard"),
      mainId = actor.assetId;
    assert.equal(imported.assets.length, 3);
    const choose = (selector, value) => {
      const control = document.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new window.Event("change"));
    };
    const walkId = imported.assets.find((a) => a.name === "Walk.glb").id;
    const attackId = imported.assets.find((a) => a.name === "Attack.glb").id;
    choose("#enemy-walk-source", walkId);
    choose("#enemy-attack-source", attackId);
    click("#enemy-save");
    await tick();
    click("#enemy-settings");
    assert.equal(document.querySelector("#enemy-walk-source").value, walkId);
    click("#enemy-import");
    await new Promise(setImmediate);
    await upload(["Death.glb"]);
    imported = await project();
    actor = imported.entities.find((e) => e.id === "ruin_guard");
    assert.equal(imported.assets.length, 4);
    assert.equal(actor.assetId, mainId);
    assert.equal(actor.enemy.animationSources.walk, walkId);
    assert.equal(actor.enemy.animationSources.attack, attackId);
    assert.equal(actor.enemy.damage, 17);
    assert.equal(actor.health, 80);
    choose(
      "#enemy-death-source",
      imported.assets.find((a) => a.name === "Death.glb").id,
    );
    click("#enemy-save");
    await tick();
    click("#enemy-settings");
    click("#enemy-import");
    await new Promise(setImmediate);
    const beforeBadImport = await project();
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [
        new dom.window.File([animatedGLB()], "Valid.glb"),
        new dom.window.File(["not a GLB"], "Broken.glb"),
      ],
    });
    const pendingBad = fileInput.onchange({ target: fileInput });
    click("#model-import-confirm");
    await pendingBad;
    await tick();
    assert.deepEqual(await project(), beforeBadImport);
    click("#close-modal");
    click("#environment-open");
    document.querySelector(`[data-environment-asset="${mainId}"]`).click();
    assert.equal(document.querySelector("#environment-collision").value, "box");
    choose("#environment-collision", "trunk");
    click("#environment-place");
    globalThis.__testHit = [20, 0, 20];
    pointer("pointermove");
    pointer("pointerdown");
    pointer("pointerup");
    await tick();
    const decoration = (await project()).entities.at(-1);
    assert.equal(decoration.kind, "prop");
    assert.equal(decoration.assetId, mainId);
    assert.equal(decoration.environment, true);
    assert.equal(decoration.collision, "trunk");
    assert.equal(
      globalThis.__testView.colliderGroups.get(decoration.id).length,
      1,
    );
    choose("#object-collision", "none");
    await tick();
    assert.equal((await project()).entities.at(-1).solid, false);
    assert.ok(!globalThis.__testView.colliderGroups.has(decoration.id));
    click("#play-player");
    assert.ok(globalThis.__testView.weapon);
    assert.ok(document.body.classList.contains("playing"));
    assert.ok(document.querySelector(".game-overlay"));
    assert.ok(globalThis.__testView.camera.position.y > 1.7 - 1e-6);
    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      value: globalThis.__testView.renderer.domElement,
    });
    globalThis.__testView.tick(0.1);
    assert.match(document.querySelector(".world-clock").textContent, /^00:/);
    const beforeJump = globalThis.__testView.camera.position.y;
    window.dispatchEvent(
      new window.KeyboardEvent("keydown", { code: "Space" }),
    );
    globalThis.__testView.tick(1 / 60);
    assert.ok(globalThis.__testView.camera.position.y > beforeJump);
    for (let i = 0; i < 80; i++) globalThis.__testView.tick(1 / 60);
    assert.ok(
      Math.abs(globalThis.__testView.camera.position.y - beforeJump) < 1e-6,
    );
    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      value: null,
    });

    const pausedTime = document.querySelector(".world-clock").textContent;
    globalThis.__testView.tick(10);
    assert.equal(
      document.querySelector(".world-clock").textContent,
      pausedTime,
    );
    click("#play");
    assert.equal(document.body.classList.contains("playing"), false);
    assert.equal(globalThis.__testView.dayNight.sun.intensity, 0);
    assert.equal(document.querySelector(".game-overlay"), null);
    assert.equal(globalThis.__testView.weapon, null);
  } finally {
    globalThis.setInterval = previousSetInterval;
    globalThis.setTimeout = previousSetTimeout;
    URL.createObjectURL = previousCreate;
    dom.window.close();
    delete globalThis.__testView;
    delete globalThis.FileReader;
  }
});
