import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as T from "three";
import {
  createTerrain,
  createRegion,
  sculpt,
  heightAt,
  groundPosition,
  moveGrounded,
} from "../src/core/terrain.js";
import { terrainGeometry } from "../src/render/surface.js";
import { WorldView } from "../src/render/world.js";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
const makeWorld = () => ({ size: 32, terrain: createTerrain(32) });
const close = (a, b, epsilon = 1e-5) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test("previously shipped v1 migrates to v2 without changing its source or entities", async () => {
  const raw = await readFile(
    new URL("./fixtures/v1.json", import.meta.url),
    "utf8",
  );
  const old = JSON.parse(raw),
    before = structuredClone(old),
    p = readProject(old);
  assert.equal(p.schemaVersion, 25);
  assert.equal(p.world.terrain, null);
  assert.deepEqual(p.entities, readProject(before).entities);
  assert.deepEqual(old, before);
});
test("terrain roundtrip preserves heights and areas; corrupt grids are rejected", () => {
  const p = demoProject();
  p.world.terrain = createTerrain();
  p.world.terrain.regions.push(
    createRegion(p.world, [-12, -12], [12, 12], "test-area"),
  );
  sculpt(p.world, p.world.terrain.regions[0], 0, 0, 4, 2, 0.5, "raise");
  assert.deepEqual(readProject(serializeProject(p)), p);
  for (const mutate of [
    (t) => t.heights.pop(),
    (t) => (t.heights[0] = 81),
    (t) => (t.heights[500] = NaN),
    (t) => (t.regions[0].max[0] = 1000),
    (t) => t.regions.push(t.regions[0]),
  ]) {
    const bad = structuredClone(p);
    mutate(bad.world.terrain);
    assert.throws(() => readProject(bad));
  }
});
test("dragged area is ordered and snapped; tiny selections are rejected", () => {
  const world = makeWorld(),
    r = createRegion(world, [5.1, 4.3], [-5.2, -4.1], "area");
  assert.deepEqual(r.min, [-5, -4]);
  assert.deepEqual(r.max, [5, 4]);
  assert.throws(() => createRegion(world, [0, 0], [1, 1], "small"));
});
test("raise/lower and smoothing only edit inside the selected region", () => {
  const world = makeWorld(),
    r = createRegion(world, [-8, -8], [8, 8], "area");
  sculpt(world, r, 0, 0, 4, 2, 0.5, "raise");
  close(heightAt(world, 0, 0), 1);
  close(heightAt(world, 8, 0), 0);
  close(heightAt(world, 9, 0), 0);
  const peak = heightAt(world, 0, 0);
  sculpt(world, r, 0, 0, 4, 2, 0.3, "smooth");
  assert.ok(heightAt(world, 0, 0) < peak);
  sculpt(world, r, 0, 0, 4, 4, 1, "lower");
  assert.ok(heightAt(world, 0, 0) < 0);
  sculpt(world, r, 7, 0, 8, 2, 1, "raise");
  close(heightAt(world, 8, 0), 0);
  close(heightAt(world, 9, 0), 0);
});
test("height sampling agrees with actual raycast triangles, not bilinear interpolation", () => {
  const world = makeWorld(),
    n = 33;
  world.terrain.heights[16 * n + 16] = 1;
  world.terrain.heights[16 * n + 17] = 3;
  world.terrain.heights[17 * n + 16] = -2;
  world.terrain.heights[17 * n + 17] = 5;
  const mesh = new T.Mesh(terrainGeometry(world), new T.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  for (const [x, z] of [
    [0.2, 0.3],
    [0.8, 0.7],
    [0.5, 0.5],
    [0, 0],
    [0.999, 0.999],
  ]) {
    const ray = new T.Raycaster(
      new T.Vector3(x, 100, z),
      new T.Vector3(0, -1, 0),
    );
    close(ray.intersectObject(mesh)[0].point.y, heightAt(world, x, z));
  }
  mesh.geometry.dispose();
  mesh.material.dispose();
});
test("walking follows uphill, downhill and negative terrain across triangle borders", () => {
  const world = makeWorld(),
    r = createRegion(world, [-12, -12], [12, 12], "area");
  for (let i = 0; i < 50; i++) sculpt(world, r, 0, 0, 8, 2, 0.05, "raise");
  for (let i = 0; i < 40; i++) sculpt(world, r, 8, 0, 5, 1, 0.05, "lower");
  let pos = groundPosition(world, [-10, 0, 0]);
  let highest = pos[1],
    lowest = pos[1];
  for (let i = 0; i < 210; i++) {
    pos = moveGrounded(world, pos, 0.1, 0);
    close(pos[1], heightAt(world, pos[0], pos[2]) + 1.7);
    highest = Math.max(highest, pos[1]);
    lowest = Math.min(lowest, pos[1]);
  }
  assert.ok(pos[0] > 10);
  assert.ok(highest > 6);
  assert.ok(lowest < 1.7);
});
test("steep climbs, elevated obstacles and explicit bounds block movement", () => {
  const world = makeWorld(),
    stride = 33;
  world.playBounds={min:[-16,-16],max:[16,16]};
  for (let z = 1; z < 32; z++) world.terrain.heights[z * stride + 17] = 6;
  let pos = moveGrounded(world, groundPosition(world, [0.1, 0, 0]), 1, 0);
  assert.ok(pos[0] < 0.2);
  pos = moveGrounded(world, groundPosition(world, [15, 0, 0]), 20, 0);
  assert.ok(pos[0] <= 15.6);
  const view = Object.create(WorldView.prototype);
  view.project = { world };
  view.boxes = [new T.Box3(new T.Vector3(-1, 5, -1), new T.Vector3(1, 7, 1))];
  assert.equal(view.blocked(0, 0, 0), false);
  assert.equal(view.blocked(0, 0, 5), true);
});
test("spawn and old saves reconcile their Y position with terrain", () => {
  const project = demoProject();
  project.world.terrain = createTerrain();
  const r = createRegion(project.world, [-10, -10], [10, 10], "r");
  project.world.terrain.regions.push(r);
  sculpt(project.world, r, 0, 0, 6, 4, 1, "raise");
  project.world.spawn = [0, 1.7, 0];
  const game = new GameState(project);
  close(game.state.position[1], 5.7);
  const raw = JSON.parse(game.save());
  raw.position = [0, -999, 0];
  game.load(JSON.stringify(raw));
  close(game.state.position[1], 5.7);
});

test("ground occludes interaction with objects buried below the surface", () => {
  const world = makeWorld(),
    view = Object.create(WorldView.prototype);
  view.surfaceWorld = world;
  view.camera = new T.PerspectiveCamera(55, 1, 0.1, 100);
  view.camera.position.set(0, 1.7, 0);
  view.camera.lookAt(0, -1, 0);
  view.camera.updateMatrixWorld(true);
  view.ray = new T.Raycaster();
  view.ground = new T.Mesh(terrainGeometry(world), new T.MeshBasicMaterial());
  const item = new T.Mesh(
    new T.BoxGeometry(0.5, 0.5, 0.5),
    new T.MeshBasicMaterial(),
  );
  item.userData.id = "buried";
  item.position.y = -1;
  item.updateMatrixWorld(true);
  view.objects = new Map([["buried", item]]);
  assert.equal(view.target(), null);
  item.position.y = 0.5;
  item.updateMatrixWorld(true);
  assert.equal(view.target(), "buried");
  view.ground.geometry.dispose();
  view.ground.material.dispose();
  item.geometry.dispose();
  item.material.dispose();
});

test("flatten brush converges to sampled level without deforming region borders", () => {
  const world = makeWorld();
  world.terrain = createTerrain(32);
  const r = createRegion(world, [-10, -10], [10, 10]);
  for (let i = 0; i < 80; i++)
    sculpt(world, r, 0, 0, 6, 8, 0.05, "flatten", {}, 2);
  assert.ok(Math.abs(heightAt(world, 0, 0) - 2) < 0.01);
  assert.equal(heightAt(world, 10, 0), 0);
  assert.equal(heightAt(world, -15, 0), 0);
  for (let i = 0; i < 80; i++)
    sculpt(world, r, 0, 0, 6, 8, 0.05, "flatten", {}, -0.5);
  assert.ok(Math.abs(heightAt(world, 0, 0) + 0.5) < 0.01);
});
