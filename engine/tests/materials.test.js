import test from "node:test";
import assert from "node:assert/strict";
import { Mesh, Group, MeshStandardMaterial, ShaderLib } from "three";
import { createTerrain } from "../src/core/terrain.js";
import { paintTerrain } from "../src/core/materials.js";
import { demoProject } from "../src/core/demo.js";
import {
  readProject,
  serializeProject,
  createEntity,
} from "../src/core/project.js";
import { terrainGeometry, updateSurface } from "../src/render/surface.js";
import { groundMaterial } from "../src/render/materials.js";
import { createEntityObject } from "../src/render/world.js";
import { batchProps } from "../src/render/batches.js";
const setup = () => ({
  size: 32,
  ground: "#567845",
  terrain: createTerrain(16),
});
const region = { min: [-4, -4], max: [4, 4] };
test("paint brush clips to region, fills and erases without touching heights", () => {
  const world = setup(),
    before = [...world.terrain.heights];
  assert.ok(paintTerrain(world, region, 0, 0, 3, 1));
  const at = (x, z) => world.terrain.paint[((z + 16) / 2) * 17 + (x + 16) / 2];
  assert.equal(at(0, 0), 1);
  assert.equal(at(4, 4), 0);
  assert.equal(at(6, 0), 0);
  assert.equal(paintTerrain(world, region, 0, 0, 3, 1), false);
  assert.ok(paintTerrain(world, region, 0, 0, 0, 3, true));
  assert.equal(at(4, 4), 3);
  assert.equal(at(6, 0), 0);
  assert.ok(paintTerrain(world, region, 0, 0, 3, 0));
  assert.equal(at(0, 0), 0);
  assert.equal(at(4, 4), 3);
  assert.deepEqual(world.terrain.heights, before);
});
test("paint-only preview updates weights without modifying positions or normals and can be reverted", () => {
  const world = setup(),
    mesh = new Mesh(
      terrainGeometry(world),
      groundMaterial(world.ground, false),
    );
  const position = mesh.geometry.attributes.position,
    normal = mesh.geometry.attributes.normal;
  const originalP = position.version,
    originalN = normal.version;
  paintTerrain(world, region, 0, 0, 3, 4);
  updateSurface(mesh, world, { paintOnly: true });
  assert.equal(position.version, originalP);
  assert.equal(normal.version, originalN);
  const index = 8 * 17 + 8;
  assert.equal(mesh.geometry.attributes.surfaceWeights.getW(index), 1);
  assert.equal(mesh.material.userData.hearthPaint, true);
  delete world.terrain.paint;
  updateSurface(mesh, world);
  assert.equal(mesh.material.userData.hearthPaint, false);
  assert.ok(
    mesh.geometry.attributes.surfaceWeights.array.every((x) => x === 0),
  );
});
test("v9 migration preserves blank surfaces; painted project roundtrips and rejects malformed maps", () => {
  const old = demoProject();
  old.schemaVersion = 9;
  const before = structuredClone(old),
    p = readProject(old);
  assert.deepEqual(old, before);
  assert.equal(p.schemaVersion, 25);
  assert.equal(p.world.terrain?.paint, undefined);
  p.world.terrain = createTerrain(16);
  paintTerrain(p.world, region, 0, 0, 4, 2);
  p.entities[0].surface = 4;
  assert.deepEqual(readProject(serializeProject(p)), p);
  p.world.terrain.paint.pop();
  assert.throws(() => serializeProject(p), /материалов/);
  p.world.terrain.paint = Array(289).fill(5);
  assert.throws(() => serializeProject(p));
});
test("terrain shader keeps Three lighting and four shared texture uniforms", () => {
  const m = groundMaterial("#ffffff"),
    s = {
      vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
  m.onBeforeCompile(s);
  assert.ok(s.vertexShader.includes("hearthWeights = surfaceWeights"));
  assert.ok(s.fragmentShader.includes("diffuseColor.rgb = hearthGround"));
  assert.ok(s.fragmentShader.includes("#include <lights_fragment_begin>"));
  assert.equal(Object.keys(s.uniforms).length, 5);
  assert.ok(s.uniforms.hearthTex1.value.userData.hearthBuiltin);
});
test("block textures share resources and masonry derives UV scale per instance", () => {
  const root = new Group(),
    objects = new Map(),
    entities = [];
  for (const [surface, scale] of [
    [3, [1, 1, 1]],
    [3, [1, 1, 1]],
    [4, [1, 1, 1]],
    [3, [2, 1, 1]],
  ]) {
    const e = createEntity();
    e.surface = surface;
    e.scale = scale;
    const o = createEntityObject(e, new Map());
    root.add(o);
    objects.set(e.id, o);
    entities.push(e);
  }
  const first = objects.get(entities[0].id).children[0],
    second = objects.get(entities[1].id).children[0];
  assert.equal(first.material.map, second.material.map);
  assert.equal(first.material.color.getHex(), 0xffffff);
  const batches = batchProps(root, objects, entities).batches;
  assert.equal(batches.length, 2);
  assert.equal(
    batches.reduce((n, b) => n + b.count, 0),
    4,
  );
});
