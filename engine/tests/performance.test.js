import { GameState } from "../src/core/game.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { terrainHit } from "../src/render/terrain-ray.js";
import { terrainGeometry, updateSurface } from "../src/render/surface.js";
import { createTerrain, createRegion, sculpt } from "../src/core/terrain.js";
import { WorldView } from "../src/render/world.js";
import { demoProject } from "../src/core/demo.js";
import { Session } from "../src/render/session.js";
test("cell traversal matches mesh raycasting including edges and rays from below", () => {
  const world = { size: 80, terrain: createTerrain(32) };
  world.terrain.heights = world.terrain.heights.map(
    (_, i) => Math.sin(i % 33) * 4 + Math.cos(Math.floor(i / 33)) * 3,
  );
  const mesh = new T.Mesh(terrainGeometry(world), new T.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  let seed = 19;
  const rand = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < 600; i++) {
    const origin = new T.Vector3(
      (rand() - 0.5) * 120,
      (rand() - 0.4) * 80,
      (rand() - 0.5) * 120,
    );
    const direction = new T.Vector3(
      (rand() - 0.5) * 80,
      (rand() - 0.5) * 8,
      (rand() - 0.5) * 80,
    )
      .sub(origin)
      .normalize();
    if (i % 10 === 0) {
      origin.x = 0;
      origin.z = 0;
      direction.set(0, -1, 0);
    }
    const ray = new T.Raycaster(origin, direction),
      expected = ray.intersectObject(mesh)[0],
      actual = terrainHit(ray.ray, world);
    assert.equal(Boolean(actual), Boolean(expected), `ray ${i}`);
    if (actual)
      assert.ok(
        Math.abs(actual.distance - expected.distance) < 1e-5,
        `distance ${i}`,
      );
  }
});
test("partial surface updates preserve full recomputed positions and normals", () => {
  const world = { size: 80, terrain: createTerrain(64) },
    region = createRegion(world, [-30, -30], [30, 30]);
  const mesh = new T.Mesh(terrainGeometry(world));
  for (const mode of ["raise", "lower", "smooth"])
    for (let i = 0; i < 5; i++) {
      const dirty = {};
      sculpt(world, region, i, 1, 4, 3, 0.05, mode, dirty);
      updateSurface(mesh, world, dirty);
      const expected = terrainGeometry(world);
      for (const key of ["position", "normal"]) {
        const a = mesh.geometry.attributes[key].array,
          b = expected.attributes[key].array;
        for (let j = 0; j < a.length; j++)
          assert.ok(Math.abs(a[j] - b[j]) < 2e-6, `${key} ${j}`);
      }
      assert.equal(mesh.geometry.attributes.position.updateRanges.length, 1);
    }
});
test("transform edits reuse geometry and update visible instance matrices", async () => {
  const view = Object.create(WorldView.prototype);
  Object.assign(view, {
    scene: new T.Scene(),
    root: new T.Group(),
    renderer: { shadowMap: {}, setPixelRatio(){} },
    camera:new T.PerspectiveCamera(),
    objects: new Map(),
    mixers: [],
  });
  view.scene.add(view.root);
  const p = demoProject();
  await view.load(p);
  const e = p.entities.find((e) => e.kind === "prop" && e.shape === "tree"),
    object = view.objects.get(e.id),
    ground = view.ground;
  const next = structuredClone(p);
  next.entities.find((x) => x.id === e.id).position[0] += 10;
  await view.syncProject(next);
  assert.equal(view.objects.get(e.id), object);
  assert.equal(view.ground, ground);
  const ref = view.batchState.refs.get(e.id)[0],
    matrix = new T.Matrix4();
  ref.batch.getMatrixAt(ref.index, matrix);
  assert.ok(
    Math.abs(matrix.elements[12] - ref.m.matrixWorld.elements[12]) < 1e-5,
  );
  assert.equal(
    view.terrainHit(new T.Ray(new T.Vector3(0, 20, 0), new T.Vector3(0, -1, 0)))
      .point.y,
    0,
  );
});
test("HUD performs one target query, throttled independently of entity count", () => {
  const original = globalThis.document,
    canvas = {};
  globalThis.document = { pointerLockElement: canvas };
  try {
    let calls = 0;
    const prompt = { textContent: "" },
      s = Object.create(Session.prototype),
      p = demoProject();
    Object.assign(s, {
      project: p,
      entitiesById: new Map(p.entities.map((e) => [e.id, e])),
      promptTimer: 0,
      attackCooldown: 0,
      enemyTimer: 0,
      keys: new Set(),
      yaw: 0,
      game: new GameState(p),
      view: {
        renderer: { domElement: canvas },
        camera: new T.PerspectiveCamera(),
        blocked: () => false,
        target: () => {
          calls++;
          return null;
        },
      },
      ui: {
        querySelector: (selector) => (selector === ".prompt" ? prompt : null),
      },
    });
    for (let i = 0; i < 6; i++) s.update(1 / 60);
    assert.equal(calls, 1);
  } finally {
    globalThis.document = original;
  }
});
