import test from "node:test";
import assert from "node:assert/strict";
import { moveCharacter, JUMP_SPEED } from "../src/core/movement.js";
import { createTerrain, heightAt } from "../src/core/terrain.js";
const world = { size: 80, terrain: null };
test("jump rises, lands once, and cannot jump again in midair", () => {
  const state = { velocity: 0, grounded: true };
  let p = [0, 1.7, 0],
    peak = 0;
  for (let i = 0; i < 120; i++) {
    p = moveCharacter(world, p, 0, 0, 1 / 120, state, [], i === 0 || i === 20);
    peak = Math.max(peak, p[1] - 1.7);
    if (i === 20) assert.ok(state.velocity < JUMP_SPEED - 1);
  }
  assert.ok(peak > 1.2 && peak < 1.25);
  assert.equal(p[1], 1.7);
  assert.ok(state.grounded);
});
test("jump remains stable across frame rates and allows air movement", () => {
  const run = (hz) => {
    let p = [0, 1.7, 0],
      s = {};
    for (let i = 0; i < hz; i++)
      p = moveCharacter(world, p, 2 / hz, 0, 1 / hz, s, [], i === 0);
    return p;
  };
  const a = run(30),
    b = run(120);
  assert.ok(Math.abs(a[0] - 2) < 1e-8);
  assert.ok(Math.abs(a[1] - b[1]) < 1e-8);
});
test("ceilings stop ascent, platforms support landing, walls stop horizontal movement", () => {
  const ceiling = { min: { x: -2, y: 2, z: -2 }, max: { x: 2, y: 3, z: 2 } };
  let p = [0, 1.7, 0],
    s = {};
  for (let i = 0; i < 30; i++) {
    p = moveCharacter(world, p, 0, 0, 1 / 120, s, [ceiling], i === 0);
    assert.ok(p[1] <= 2 + 1e-6);
  }
  const platform = { min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 0.5, z: 2 } };
  p = [0, 4, 0];
  s = { grounded: false, velocity: 0 };
  for (let i = 0; i < 120; i++)
    p = moveCharacter(world, p, 0, 0, 1 / 120, s, [platform]);
  assert.equal(p[1], 2.2);
  assert.ok(s.grounded);
  const wall = { min: { x: 0.5, y: 0, z: -2 }, max: { x: 1, y: 8, z: 2 } };
  p = [0, 1.7, 0];
  s = {};
  for (let i = 0; i < 30; i++)
    p = moveCharacter(world, p, 0.1, 0, 1 / 60, s, [wall], i === 0);
  assert.ok(p[0] < 0.19);
});
test("landing matches uneven terrain and stepping off a platform falls", () => {
  const w = { size: 80, terrain: createTerrain(32) };
  w.terrain.heights = w.terrain.heights.map((_, i) => Math.sin(i % 33) * 0.5);
  let p = [0, 5, 0],
    s = { grounded: false };
  for (let i = 0; i < 120; i++) p = moveCharacter(w, p, 0, 0, 1 / 120, s);
  assert.equal(p[1], heightAt(w, 0, 0) + 1.7);
  const box = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  p = [0, 2.7, 0];
  s = {};
  for (let i = 0; i < 120; i++)
    p = moveCharacter(world, p, 0.025, 0, 1 / 120, s, [box]);
  assert.equal(p[1], 1.7);
});
