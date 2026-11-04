import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { MouseLook } from "../src/render/mouse-look.js";
import { WorldView } from "../src/render/world.js";

test("pointer relock ignores transition motion, preserves heading, rejects invalid events", () => {
  const c = new T.PerspectiveCamera(),
    look = new MouseLook(c);
  look.setActive(true);
  assert.equal(look.move(900, 300), false);
  assert.equal(look.yaw, 0);
  look.move(40, 20);
  const q = c.quaternion.clone(),
    yaw = look.yaw;
  look.setActive(false);
  look.move(500, 500);
  assert.ok(q.equals(c.quaternion));
  look.setActive(true);
  look.move(-900, -300);
  assert.equal(look.yaw, yaw);
  for (const [x, y] of [
    [NaN, 0],
    [Infinity, 0],
    [0, 5000],
  ])
    assert.equal(look.move(x, y), false);
  assert.ok(q.equals(c.quaternion));
  look.move(20, 0);
  assert.ok(Math.abs(look.yaw - yaw + 0.04) < 1e-10);
});
test("normal mouse turns have no inertia, roll or event-rate dependence", () => {
  const a = new MouseLook(new T.PerspectiveCamera()),
    b = new MouseLook(new T.PerspectiveCamera());
  for (const look of [a, b]) {
    look.setActive(true);
    look.move(0, 0);
  }
  a.move(100, 50);
  for (let i = 0; i < 100; i++) b.move(1, 0.5);
  assert.ok(a.camera.quaternion.angleTo(b.camera.quaternion) < 1e-6);
  for (let i = 0; i < 10000; i++) a.move(50, 50);
  assert.ok(a.yaw >= -Math.PI && a.yaw <= Math.PI);
  assert.equal(a.pitch, -1.45);
  assert.equal(a.camera.rotation.z, 0);
  assert.equal(a.camera.rotation.order, "YXZ");
});
test("aim uses current mouse orientation and short range without restricting editor picking", () => {
  const v = Object.create(WorldView.prototype);
  v.camera = new T.PerspectiveCamera();
  v.ray = new T.Raycaster();
  v.ground = new T.Group();
  v.terrainHit = () => null;
  v.playing = true;
  const mesh = new T.Mesh(
    new T.SphereGeometry(0.25),
    new T.MeshBasicMaterial(),
  );
  mesh.position.set(2, 0, 0);
  mesh.userData.id = "near";
  mesh.updateMatrixWorld(true);
  v.objects = new Map([["near", mesh]]);
  v.camera.rotation.set(0, -Math.PI / 2, 0, "YXZ");
  assert.equal(v.target(), "near");
  assert.equal(v.ray.far, Infinity);
  mesh.position.x = 20;
  mesh.updateMatrixWorld(true);
  assert.equal(v.target(), null);
  assert.equal(v.visibleObjectHit()?.object.userData.id, "near");
  const wall = new T.Mesh(
    new T.BoxGeometry(0.1, 2, 2),
    new T.MeshBasicMaterial(),
  );
  wall.position.x = 1;
  wall.userData.id = "wall";
  wall.updateMatrixWorld(true);
  v.objects.set("wall", wall);
  assert.equal(v.target(), "wall");
  mesh.geometry.dispose();
  mesh.material.dispose();
  wall.geometry.dispose();
  wall.material.dispose();
});

test("isolated phantom delta and inverse warp do not move camera or leave deferred motion", () => {
  const look = new MouseLook(new T.PerspectiveCamera());
  look.setActive(true);
  look.move(0, 0, 0);
  for (let i = 1; i <= 12; i++) look.move(2, 1, i * 8);
  const yaw = look.yaw;
  assert.equal(look.move(300, 80, 104), false);
  assert.equal(look.yaw, yaw);
  look.move(2, 1, 112);
  assert.ok(Math.abs(look.yaw - yaw + 0.004) < 1e-8);
  const before = look.yaw;
  look.move(400, 0, 120);
  look.move(-400, 0, 128);
  look.move(2, 1, 136);
  assert.ok(Math.abs(look.yaw - before + 0.004) < 1e-8);
  assert.ok(look.report().events.some((e) => e.result === "rejected-spike"));
});
test("sustained fast flick is accepted after confirmation and recapture drops pending spike", () => {
  const look = new MouseLook(new T.PerspectiveCamera());
  look.setActive(true);
  look.move(0, 0, 0);
  for (let i = 1; i <= 12; i++) look.move(2, 0, i * 8);
  const yaw = look.yaw;
  look.move(180, 0, 104);
  look.move(200, 0, 112);
  assert.ok(Math.abs(look.yaw - yaw + 380 * 0.002) < 1e-8);
  look.move(2000, 0, 120);
  const before = look.yaw;
  look.setActive(false);
  look.setActive(true);
  look.move(0, 0, 128);
  look.move(1, 0, 136);
  assert.ok(Math.abs(look.yaw - before + 0.002) < 1e-8);
});
test("raw movement request falls back only when unsupported", async () => {
  const { requestMouseLock } = await import("../src/render/mouse-look.js");
  const calls = [];
  const canvas = {
    requestPointerLock: async (options) => {
      calls.push(options);
      if (options)
        throw Object.assign(new Error(), { name: "NotSupportedError" });
    },
  };
  assert.equal(await requestMouseLock(canvas), "normal-fallback");
  assert.deepEqual(calls, [{ unadjustedMovement: true }, undefined]);
  let denied = 0;
  await assert.rejects(() =>
    requestMouseLock({
      requestPointerLock: () => {
        denied++;
        throw Object.assign(new Error(), { name: "NotAllowedError" });
      },
    }),
  );
  assert.equal(denied, 1);
});
