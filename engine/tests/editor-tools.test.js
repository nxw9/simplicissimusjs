import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import * as T from "three";
import { SceneTools } from "../src/editor/tools.js";
import { WorldView, createEntityObject } from "../src/render/world.js";
import { terrainGeometry } from "../src/render/surface.js";
import { demoProject } from "../src/core/demo.js";
import { createEntity, readProject } from "../src/core/project.js";
import { createTerrain, createRegion, heightAt } from "../src/core/terrain.js";

function harness() {
  const dom = new JSDOM("<!doctype html><canvas></canvas>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const canvas = document.querySelector("canvas"),
    captures = new Set();
  canvas.setPointerCapture = (id) => captures.add(id);
  canvas.hasPointerCapture = (id) => captures.has(id);
  canvas.releasePointerCapture = (id) => captures.delete(id);
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  });
  let project = demoProject(),
    selected = null,
    regionId = null,
    commits = 0;
  project.entities = [];
  project.quests = [];
  const view = Object.create(WorldView.prototype);
  Object.assign(view, {
    renderer: { domElement: canvas },
    camera: new T.PerspectiveCamera(),
    scene: new T.Scene(),
    objects: new Map(),
    assetModels: new Map(),
    orbit: { enabled: true },
    grid: { visible: true },
    project,
    playing: false,
  });
  view.root=new T.Group();
  view.ground = new T.Mesh(
    terrainGeometry(project.world),
    new T.MeshBasicMaterial(),
  );
  view.scene.add(view.ground);
  view.groundHit = (e) =>
    new T.Vector3(e.wx, heightAt(project.world, e.wx, e.wz), e.wz);
  view.pick = (e) => e.entityId;
  const messages = [];
  const tools = new SceneTools(view, {
    getProject: () => project,
    getSelected: () => selected,
    getRegion: () =>
      project.world.terrain?.regions.find((r) => r.id === regionId),
    setRegion: (id) => (regionId = id),
    select: (id) => (selected = id),
    notify: (text) => messages.push(text),
    isBusy: () => false,
    snap: () => true,
    brush: () => ({ radius: 4, strength: 2 }),
    modeChanged: () => {},
    gestureChanged: () => {},
    transformPreview: () => {},
    commit: async (next) => {
      project = readProject(next);
      view.project = project;
      commits++;
      return true;
    },
  });
  return {
    view,
    tools,
    messages,
    get project() {
      return project;
    },
    get commits() {
      return commits;
    },
    setTerrain() {
      project.world.terrain = createTerrain();
      const r = createRegion(project.world, [-10, -10], [10, 10], "region");
      project.world.terrain.regions.push(r);
      regionId = r.id;
      view.updateTerrain(project.world);
    },
    addEntity() {
      const e = createEntity();
      e.id = "box";
      project.entities.push(e);
      view.objects.set(e.id, createEntityObject(e, new Map()));
      view.scene.add(view.objects.get(e.id));
      return e;
    },
    close() {
      tools.cancel();
      tools.gizmo.dispose();
      dom.window.close();
    },
  };
}
function event(wx, wz, extra = {}) {
  return {
    wx,
    wz,
    button: 0,
    pointerId: 1,
    clientX: wx * 10,
    clientY: wz * 10,
    preventDefault() {},
    stopImmediatePropagation() {},
    ...extra,
  };
}

test("wall drag previews without terrain regions and commits all sections exactly once", async () => {
  const h = harness();
  try {
    h.tools.cb.wallBrush = () => ({model:"stone",width:2,height:4,straight:true});
    h.tools.setMode("wall");
    h.tools.pointerDown(event(-8,-6)); h.tools.pointerMove(event(8,6));
    assert.equal(h.project.entities.length,0); assert.equal(h.project.world.terrain,null);
    assert.ok(h.tools.wallPreview.visible); assert.ok(h.tools.wallPreview.count > 1);
    await h.tools.pointerUp(event(10,8)); // final release position matters
    assert.equal(h.commits,1); assert.equal(h.tools.mode,"wall");
    assert.equal(h.tools.wallPreview.visible,false); assert.equal(h.view.orbit.enabled,true);
    assert.ok(h.project.entities.length > 1);
    for (const e of h.project.entities) assert.ok(Math.abs(e.rotation[1]+Math.atan2(14,18)) < 1e-8);
    assert.equal(h.project.world.terrain,null);
  } finally {h.close();}
});
test("wall cancel, pointer cancellation, mode changes and camera gestures never commit previews", async () => {
  const h = harness();
  try {
    h.tools.cb.wallBrush = () => ({model:"stone",width:2,height:4});
    for (const cancel of [()=>h.tools.cancel(),()=>h.tools.cancelPointer(),()=>h.tools.setMode("move")]) {
      h.tools.setMode("wall");h.tools.pointerDown(event(0,0));h.tools.pointerMove(event(8,4));
      cancel(); assert.equal(h.tools.wallPreview.visible,false);assert.equal(h.commits,0);
      assert.equal(h.view.orbit.enabled,true);
    }
    h.tools.setMode("wall");h.tools.pointerDown(event(0,0,{button:2}));await h.tools.pointerUp(event(8,4,{button:2}));
    assert.equal(h.commits,0);assert.equal(h.project.entities.length,0);
  } finally {h.close();}
});
test("freehand follows corners, Shift draws a temporary straight wall and locked angles remain exact", async () => {
  const h = harness();
  try {
    let settings = {model:"stone",width:1,height:3,straight:false,lockAngle:false};
    h.tools.cb.wallBrush = () => settings;h.tools.setMode("wall");
    h.tools.pointerDown(event(-8,-8));h.tools.pointerMove(event(8,-8));h.tools.pointerMove(event(8,8));
    await h.tools.pointerUp(event(8,8));
    assert.ok(h.project.entities.some(e=>Math.abs(e.rotation[1])<1e-8));
    assert.ok(h.project.entities.some(e=>Math.abs(e.rotation[1]+Math.PI/2)<1e-8));
    const previous = h.project.entities.length;
    settings = {...settings,lockAngle:true,angle:37};
    h.tools.pointerDown(event(-8,-8,{shiftKey:true}));h.tools.pointerMove(event(8,-8));await h.tools.pointerUp(event(8,8));
    for (const e of h.project.entities.slice(previous)) assert.ok(Math.abs(e.rotation[1]+37*Math.PI/180)<1e-8);
    assert.equal(h.commits,2); assert.equal(settings.straight,false);
  } finally {h.close();}
});

test("instant cliff clicks each grow terrain; road drag cuts continuously; cancel rolls back", async () => {
  const h=harness();
  try {
    h.setTerrain();h.tools.setMode("cliff");
    h.tools.pointerDown(event(0,0));await h.tools.pointerUp(event(0,0));
    const first=heightAt(h.project.world,0,0);assert.ok(first>3);assert.equal(h.commits,1);
    h.tools.pointerDown(event(0,0));await h.tools.pointerUp(event(0,0));
    assert.ok(heightAt(h.project.world,0,0)>first*1.9);assert.equal(h.commits,2);
    h.tools.pointerDown(event(0,0));h.tools.cancel();assert.equal(h.commits,2);
    h.tools.setMode("road");h.tools.pointerDown(event(-8,0));h.tools.pointerMove(event(8,0));
    await h.tools.pointerUp(event(8,0));assert.equal(h.commits,3);
    for(let x=-7;x<=7;x+=.5)assert.ok(Math.abs(heightAt(h.project.world,x,0))<1e-8);
  } finally {h.close();}
});
test("route clicks append or move waypoints without moving the enemy, drag and cancel do not edit",async()=>{
  const h=harness();
  try {
    const e=h.addEntity();e.kind="enemy";e.position=[0,0,0];
    h.tools.cb.select(e.id);h.tools.setMode("patrol");
    h.tools.pointerDown(event(4,0));await h.tools.pointerUp(event(4,0));
    assert.deepEqual(h.project.entities[0].patrol.points,[[0,0],[4,0]]);
    h.tools.pointerDown(event(4,4));await h.tools.pointerUp(event(4,4));
    assert.equal(h.project.entities[0].patrol.points.length,3);
    h.tools.patrolPointIndex=1;h.tools.pointerDown(event(6,0));await h.tools.pointerUp(event(6,0));
    assert.deepEqual(h.project.entities[0].patrol.points,[[0,0],[6,0],[4,4]]);
    h.tools.pointerDown(event(6,6));h.tools.cancel();assert.equal(h.commits,3);
    h.tools.pointerDown(event(6,6));h.tools.pointerMove(event(10,10));await h.tools.pointerUp(event(10,10));assert.equal(h.commits,3);
    assert.deepEqual(h.project.entities[0].position,[0,0,0]);
    assert.ok(h.tools.patrolGuide.line.visible);h.view.playing=true;h.tools.playChanged();assert.equal(h.tools.patrolGuide.line.visible,false);
  } finally {h.close();}
});

test("stretching a terrain region commits once and selects the raise brush", async () => {
  const h = harness();
  try {
    h.tools.setMode("area");
    h.tools.pointerDown(event(-8, -8));
    h.tools.pointerMove(event(8, 8));
    await h.tools.pointerUp(event(8, 8));
    assert.equal(h.project.world.terrain.regions.length, 1);
    assert.equal(h.commits, 1);
    assert.equal(h.tools.mode, "raise");
    assert.equal(h.view.orbit.enabled, true);
  } finally {
    h.close();
  }
});
test("one continuous brush stroke commits once, previews do not mutate saved data", async () => {
  const h = harness();
  try {
    h.setTerrain();
    h.tools.setMode("raise");
    h.tools.pointerDown(event(0, 0));
    for (let i = 0; i < 10; i++) h.tools.tick(0.05);
    assert.equal(heightAt(h.project.world, 0, 0), 0);
    assert.ok(h.view.ground.geometry.attributes.position.getY(8320) > 0);
    await h.tools.pointerUp(event(0, 0));
    assert.equal(h.commits, 1);
    assert.ok(heightAt(h.project.world, 0, 0) > 0);
  } finally {
    h.close();
  }
});
test("Escape/cancel restores a sculpt preview and does not create undo history", () => {
  const h = harness();
  try {
    h.setTerrain();
    h.tools.setMode("raise");
    h.tools.pointerDown(event(0, 0));
    h.tools.tick(0.05);
    h.tools.cancel();
    assert.equal(h.commits, 0);
    assert.equal(heightAt(h.project.world, 0, 0), 0);
    assert.equal(h.view.ground.geometry.attributes.position.getY(8320), 0);
    assert.equal(h.view.orbit.enabled, true);
  } finally {
    h.close();
  }
});
test("placing an object requires a scene click and uses the terrain height", async () => {
  const h = harness();
  try {
    const e = createEntity();
    h.tools.place(e);
    h.tools.pointerMove(event(3, 4));
    assert.equal(h.project.entities.length, 0);
    assert.equal(h.tools.ghost.visible, true);
    h.tools.pointerDown(event(3, 4));
    await h.tools.pointerUp(event(3, 4));
    assert.equal(h.commits, 1);
    assert.deepEqual(h.project.entities[0].position, [3, 0.5, 4]);
    assert.equal(h.tools.mode, "move");
    assert.equal(h.tools.ghost, null);
  } finally {
    h.close();
  }
});
test("direct drag saves the final position once; cancelled drag restores it", async () => {
  const h = harness();
  try {
    h.addEntity();
    h.tools.pointerDown(event(0, 0, { entityId: "box" }));
    h.tools.pointerMove(event(4, 5));
    assert.deepEqual(h.project.entities[0].position, [0, 0.5, 0]);
    await h.tools.pointerUp(event(4, 5));
    assert.deepEqual(h.project.entities[0].position, [4, 0.5, 5]);
    assert.equal(h.commits, 1);
    h.tools.pointerDown(event(4, 5, { entityId: "box" }));
    h.tools.pointerMove(event(7, 7));
    h.tools.cancel();
    assert.deepEqual(h.view.objects.get("box").position.toArray(), [4, 0.5, 5]);
    assert.equal(h.commits, 1);
  } finally {
    h.close();
  }
});
test("spawn tool changes spawn only after click and returns to move mode", async () => {
  const h = harness();
  try {
    h.tools.setMode("spawn");
    h.tools.pointerDown(event(5, 6));
    await h.tools.pointerUp(event(5, 6));
    assert.deepEqual(h.project.world.spawn, [5, 1.7, 6]);
    assert.equal(h.tools.mode, "move");
    assert.equal(h.commits, 1);
  } finally {
    h.close();
  }
});
test("right mouse camera gestures never edit the scene", async () => {
  const h = harness();
  try {
    h.tools.setMode("area");
    h.tools.pointerDown(event(-8, -8, { button: 2 }));
    h.tools.pointerMove(event(8, 8, { button: 2 }));
    await h.tools.pointerUp(event(8, 8, { button: 2 }));
    assert.equal(h.commits, 0);
    assert.equal(h.project.world.terrain, null);
  } finally {
    h.close();
  }
});

test("player preview is separate from saved start, cancel restores marker, play hides it", () => {
  const h = harness();
  try {
    const before = [...h.project.world.spawn];
    h.tools.setMode("spawn");
    h.tools.pointerMove(event(5, 6));
    assert.equal(h.tools.spawnPreview.visible, true);
    assert.deepEqual(h.tools.spawnPreview.position.toArray(), [5, 0, 6]);
    assert.deepEqual(h.project.world.spawn, before);
    h.tools.cancel();
    assert.equal(h.tools.spawnPreview.visible, false);
    assert.equal(h.tools.spawnMarker.visible, true);
    h.view.playing = true;
    h.tools.playChanged();
    assert.equal(h.tools.spawnMarker.visible, false);
    h.view.playing = false;
    h.tools.playChanged();
    assert.equal(h.tools.spawnMarker.visible, true);
  } finally {
    h.close();
  }
});
test("occupied player start is rejected without a commit", async () => {
  const h = harness();
  try {
    h.view.boxes = [new T.Box3(new T.Vector3(4, 0, 5), new T.Vector3(6, 3, 7))];
    h.tools.setMode("spawn");
    h.tools.pointerMove(event(5, 6));
    assert.equal(
      h.tools.spawnPreview.userData.material.color.getHexString(),
      "ff6262",
    );
    h.tools.pointerDown(event(5, 6));
    await h.tools.pointerUp(event(5, 6));
    assert.equal(h.commits, 0);
    assert.equal(h.tools.mode, "spawn");
  } finally {
    h.close();
  }
});

test("placement controls change preview and repeated placement creates independent objects", async () => {
  const h = harness();
  try {
    h.tools.cb.repeatPlacement = () => true;
    h.tools.place(createEntity("prop", "box"));
    h.tools.pointerMove(event(2, 3));
    h.tools.configurePlacement(2, Math.PI / 2);
    h.tools.pointerDown(event(2, 3));
    await h.tools.pointerUp(event(2, 3));
    assert.deepEqual(h.project.entities[0].scale, [2, 2, 2]);
    assert.equal(h.project.entities[0].position[1], 1);
    assert.equal(h.tools.mode, "place");
    h.tools.pointerDown(event(5, 6));
    await h.tools.pointerUp(event(5, 6));
    assert.equal(h.project.entities.length, 2);
    assert.notEqual(h.project.entities[0].id, h.project.entities[1].id);
    assert.equal(h.commits, 2);
    h.tools.cancel();
    assert.equal(h.tools.ghost, null);
  } finally {
    h.close();
  }
});
