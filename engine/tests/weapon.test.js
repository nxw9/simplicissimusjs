import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  WeaponView,
  IMPACT_TIME,
  SWING_DURATION,
} from "../src/render/weapon.js";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { Session } from "../src/render/session.js";
const config = { assetId: null, rotation: [0, 0, 0], length: 1.08, grip: 0.16 };
test("v2 projects migrate without mutation; equipment roundtrips and validates references", () => {
  const old = demoProject();
  old.schemaVersion = 2;
  delete old.weapon;
  const snapshot = structuredClone(old);
  const p = readProject(old);
  assert.equal(p.weapon, null);
  assert.equal(p.schemaVersion, 25);
  assert.deepEqual(old, snapshot);
  p.weapon = config;
  assert.deepEqual(readProject(serializeProject(p)).weapon, config);
  p.weapon = { ...config, assetId: "missing" };
  assert.throws(() => readProject(p), /оружия/);
  p.weapon = { ...config, length: 0 };
  assert.throws(() => readProject(p));
});
test("swing has one impact, blocks spam, returns to rest and can be cancelled", () => {
  const weapon = new WeaponView(config, new Map()),
    rest = weapon.pivot.quaternion.clone();
  assert.ok(weapon.attack());
  assert.equal(weapon.attack(), false);
  assert.equal(weapon.update(0.1), false);
  assert.ok(weapon.pivot.quaternion.angleTo(rest) > 0.01);
  assert.ok(weapon.update(IMPACT_TIME - 0.1 + 1e-5));
  assert.equal(weapon.update(0.01), false);
  assert.equal(weapon.update(SWING_DURATION), false);
  assert.ok(weapon.pivot.quaternion.angleTo(rest) < 1e-6);
  assert.ok(weapon.attack());
  weapon.cancel();
  assert.equal(weapon.update(1), false);
  weapon.dispose();
});
test("custom model is normalized, borrowed GPU resources survive weapon disposal", () => {
  const scene = new T.Group(),
    geometry = new T.BoxGeometry(10, 100, 3),
    material = new T.MeshStandardMaterial();
  scene.add(new T.Mesh(geometry, material));
  let disposals = 0;
  geometry.addEventListener("dispose", () => disposals++);
  material.addEventListener("dispose", () => disposals++);
  const weapon = new WeaponView(
    { ...config, assetId: "sword" },
    new Map([["sword", { scene }]]),
  );
  const model = weapon.pivot.children[0],
    bounds = new T.Box3().setFromObject(model);
  assert.ok(Math.abs(bounds.getSize(new T.Vector3()).y - 1.08) < 1e-6);
  assert.equal(scene.children[0].position.y, 0);
  weapon.dispose();
  assert.equal(disposals, 0);
});
test("strike resolves the current target at impact, not the target from mouse-down", () => {
  let target = "wall",
    hits = [];
  const session = Object.create(Session.prototype);
  Object.assign(session, {
    view: { target: () => target },
    entitiesById: new Map([
      ["enemy", { kind: "enemy", name: "Enemy" }],
      ["wall", { kind: "prop" }],
    ]),
    game: {
      collected: () => false,
      hit: (id) => {
        hits.push(id);
        return false;
      },
    },
    notify: () => {},
    sync: () => {},
  });
  session.strike();
  assert.equal(hits.length, 0);
  target = "enemy";
  session.strike();
  assert.deepEqual(hits, ["enemy"]);
});

test("cut travels from right shoulder through centre then down-left at impact time", () => {
  const w = new WeaponView(config, new Map());
  const tip = () => {
    w.pivot.updateMatrixWorld(true);
    return w.pivot.localToWorld(new T.Vector3(0, 0.92, 0));
  };
  w.pose(0.13 / SWING_DURATION);
  const wind = tip();
  w.pose(IMPACT_TIME / SWING_DURATION);
  const impact = tip();
  w.pose(0.34 / SWING_DURATION);
  const follow = tip();
  assert.ok(wind.x > impact.x && impact.x > follow.x);
  assert.ok(wind.y > impact.y && impact.y > follow.y);
  assert.ok(Math.abs(impact.x) < 0.2 && Math.abs(impact.y) < 0.2);
  assert.ok(impact.z < wind.z);
  w.dispose();
});
test("hilt-up imported model is flipped before grip normalization", () => {
  const scene = new T.Group(),
    tip = new T.Object3D();
  tip.name = "blade-tip";
  tip.position.y = -1;
  scene.add(
    new T.Mesh(new T.BoxGeometry(0.1, 2, 0.1), new T.MeshStandardMaterial()),
    tip,
  );
  const w = new WeaponView(
    { ...config, assetId: "sword" },
    new Map([["sword", { scene }]]),
  );
  const model = w.pivot.children[0];
  model.updateMatrixWorld(true);
  const transformed = model
    .getObjectByName("blade-tip")
    .getWorldPosition(new T.Vector3());
  w.pivot.worldToLocal(transformed);
  assert.ok(transformed.y > 0);
  assert.equal(tip.position.y, -1);
  w.dispose();
});
