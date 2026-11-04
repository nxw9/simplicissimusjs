import test from "node:test";
import assert from "node:assert/strict";
import {
  Box3,
  Vector3,
  Group,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
} from "three";
import {
  ColliderIndex,
  entityColliders,
  refreshBounds,
} from "../src/render/colliders.js";
import {
  createEntity,
  readProject,
  serializeProject,
} from "../src/core/project.js";
import { demoProject } from "../src/core/demo.js";
import { moveCharacter } from "../src/core/movement.js";
import { createEntityObject } from "../src/render/world.js";
const box = (x, z, w = 1) =>
  new Box3(new Vector3(x, 0, z), new Vector3(x + w, 3, z + w));
test("spatial index equals exhaustive overlap, handles negative cells, giant bounds and moving doors", () => {
  const boxes = Array.from({ length: 2000 }, (_, i) =>
    box((i % 50) * 6 - 150, Math.floor(i / 50) * 6 - 120),
  );
  boxes.push(box(-1000, -1000, 2000));
  const index = new ColliderIndex(boxes);
  for (let i = 0; i < 300; i++) {
    const x = ((i * 17) % 300) - 150,
      z = ((i * 29) % 240) - 120;
    const expected = boxes.filter(
      (b) =>
        b.max.x >= x - 0.33 &&
        b.min.x <= x + 0.33 &&
        b.max.z >= z - 0.33 &&
        b.min.z <= z + 0.33,
    );
    assert.deepEqual(
      new Set(index.query(x - 0.33, z - 0.33, x + 0.33, z + 0.33)),
      new Set(expected),
    );
  }
  const moving = boxes[0];
  moving.translate(new Vector3(160, 0, 130));
  index.update(moving);
  assert.ok(!index.query(-151, -121, -148, -118).includes(moving));
  assert.ok(index.query(9, 9, 12, 12).includes(moving));
  assert.equal(index.query(-2000, -2000, 2000, 2000).length, boxes.length);
});
test("indexed movement matches full collision list, including jumping and floor support", () => {
  const boxes = Array.from({ length: 2000 }, (_, i) => box(20 + i * 3, 20));
  boxes.push(box(1, -1, 2));
  const index = new ColliderIndex(boxes),
    world = { size: 2000, terrain: null };
  let full = [0, 1.7, 0],
    near = [...full];
  const a = {},
    b = {};
  for (let i = 0; i < 240; i++) {
    const dx = 0.04,
      dz = i > 120 ? 0.02 : 0;
    const candidates = index.query(
      Math.min(near[0], near[0] + dx) - 0.33,
      Math.min(near[2], near[2] + dz) - 0.33,
      Math.max(near[0], near[0] + dx) + 0.33,
      Math.max(near[2], near[2] + dz) + 0.33,
    );
    assert.ok(candidates.length < 3);
    full = moveCharacter(world, full, dx, dz, 1 / 60, a, boxes, i === 50);
    near = moveCharacter(world, near, dx, dz, 1 / 60, b, candidates, i === 50);
    assert.deepEqual(near, full);
  }
});
test("environment collision presets preserve openings, narrow trunks and update transformed bounds", () => {
  const g = new Group();
  for (const x of [-2, 2]) {
    const m = new Mesh(new BoxGeometry(1, 4, 1), new MeshBasicMaterial());
    m.position.set(x, 2, 0);
    g.add(m);
  }
  g.updateMatrixWorld(true);
  const e = createEntity();
  assert.equal(entityColliders(e, g).length, 2);
  e.collision = "box";
  let bounds = entityColliders(e, g);
  assert.equal(bounds.length, 1);
  assert.equal(bounds[0].max.x, 2.5);
  e.collision = "trunk";
  bounds = entityColliders(e, g);
  assert.equal(bounds.length, 1);
  assert.equal(bounds[0].max.x, 0.1);
  g.position.x = 8;
  g.updateMatrixWorld(true);
  refreshBounds(bounds[0]);
  assert.equal(bounds[0].max.x, 8.1);
  e.solid = false;
  assert.equal(entityColliders(e, g).length, 0);
});
test("v8 projects retain legacy colliders and animations, new static environment roundtrips", () => {
  const old = demoProject();
  old.schemaVersion = 8;
  for (const e of old.entities) {
    delete e.collision;
    delete e.environment;
  }
  const before = structuredClone(old),
    migrated = readProject(old);
  assert.deepEqual(old, before);
  assert.equal(migrated.schemaVersion, 25);
  for (const e of migrated.entities) {
    assert.equal(e.collision, "meshes");
    assert.equal(e.environment, false);
  }
  const e = migrated.entities[0];
  e.collision = "trunk";
  e.environment = true;
  assert.deepEqual(readProject(serializeProject(migrated)), migrated);
  const source = new Group();
  source.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  const model = {
    ...createEntity("prop", "model"),
    assetId: "test",
    environment: true,
  };
  const mixers = [];
  createEntityObject(
    model,
    new Map([["test", { scene: source, animations: [{}] }]]),
    mixers,
  );
  assert.equal(mixers.length, 0);
});
