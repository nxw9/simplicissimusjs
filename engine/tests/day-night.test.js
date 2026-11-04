import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  advanceTime,
  skyState,
  timeLabel,
  DAY_NIGHT_DEFAULTS,
} from "../src/core/day-night.js";
import { DayNight } from "../src/render/day-night.js";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { GameState } from "../src/core/game.js";

test("full day duration is exact across frame rates, wraps midnight and stops when disabled", () => {
  const config = { ...DAY_NIGHT_DEFAULTS, dayMinutes: 2 };
  assert.ok(Math.abs(advanceTime(9, 120, config) - 9) < 1e-8);
  for (const hz of [30, 60, 120]) {
    let hour = 23.5;
    for (let i = 0; i < hz * 10; i++) hour = advanceTime(hour, 1 / hz, config);
    assert.ok(Math.abs(hour - 1.5) < 1e-8);
  }
  assert.equal(advanceTime(9, 60, { ...config, enabled: false }), 9);
  assert.equal(advanceTime(9, 0, config), 9);
  assert.equal(advanceTime(9, NaN, config), 9);
  assert.equal(timeLabel(23.5), "23:30");
  assert.equal(timeLabel(24), "00:00");
});
test("sun, twilight, moon and stars transition smoothly and repeat after 24 hours", () => {
  const noon = skyState(12),
    night = skyState(0);
  assert.ok(noon.sun > 3);
  assert.equal(noon.moon, 0);
  assert.equal(noon.stars, 0);
  assert.equal(night.sun, 0);
  assert.ok(night.moon > 0);
  assert.equal(night.stars, 1);
  assert.ok(night.ambient < noon.ambient);
  for (const t of [0, 6, 12, 18, 24]) {
    const a = skyState(t - 1e-5),
      b = skyState(t + 1e-5);
    for (const key of ["sun", "moon", "ambient", "dusk", "stars"])
      assert.ok(Math.abs(a[key] - b[key]) < 1e-4);
  }
  assert.ok(Math.abs(skyState(9).elevation - skyState(33).elevation) < 1e-10);
});
test("lighting restores legacy colors and limits moving-sun shadow updates", () => {
  const p = demoProject(),
    updates = [],
    view = {
      project: p,
      scene: new T.Scene(),
      camera: new T.PerspectiveCamera(),
      invalidate: (s) => updates.push(s),
    };
  view.scene.background = new T.Color(p.world.sky);
  view.scene.fog = new T.Fog(p.world.sky, 32, 100);
  const cycle = new DayNight(view);
  cycle.apply(12, DAY_NIGHT_DEFAULTS, true);
  assert.equal(cycle.sky.visible, true);
  assert.ok(cycle.sun.position.y > 40);
  const sun = cycle.sun,
    sky = cycle.sky;
  updates.length = 0;
  for (let i = 0; i < 60; i++)
    cycle.apply(12 + i / 60, DAY_NIGHT_DEFAULTS, false, 1 / 60);
  assert.ok(updates.filter(Boolean).length <= 4);
  assert.equal(cycle.sun, sun);
  assert.equal(cycle.sky, sky);
  cycle.apply(0, DAY_NIGHT_DEFAULTS, true);
  assert.ok(cycle.moon.intensity > 0);
  assert.equal(cycle.sun.intensity, 0);
  view.camera.position.set(30, 2, 15);
  cycle.followCamera();
  assert.deepEqual(sky.position.toArray(), [30, 2, 15]);
  cycle.apply(0, null, true);
  assert.equal(sky.visible, false);
  assert.equal(cycle.moon.intensity, 0);
  assert.equal(sun.intensity, 3.2);
  assert.equal(
    view.scene.fog.color.getHexString(),
    new T.Color(p.world.sky).getHexString(),
  );
  cycle.dispose();
  assert.equal(sky.parent, null);
  assert.equal(cycle.moon.parent, null);
});
test("cycle settings roundtrip, old worlds keep legacy light and saves preserve time", () => {
  const p = demoProject();
  const old = structuredClone(p);
  old.schemaVersion = 7;
  delete old.world.dayNight;
  const before = structuredClone(old);
  assert.equal(readProject(old).world.dayNight, null);
  assert.deepEqual(old, before);
  p.world.dayNight = { enabled: true, dayMinutes: 40, startHour: 18.5 };
  const q = readProject(serializeProject(p));
  assert.deepEqual(q.world.dayNight, p.world.dayNight);
  const game = new GameState(q);
  assert.equal(game.state.worldTime, 18.5);
  game.state.worldTime = 0.25;
  const raw = game.save();
  game.state.worldTime = 12;
  game.load(raw);
  assert.equal(game.state.worldTime, 0.25);
  const legacy = JSON.parse(raw);
  legacy.schemaVersion = 3;
  delete legacy.worldTime;
  delete legacy.droppedItems;
  game.load(JSON.stringify(legacy));
  assert.equal(game.state.worldTime, 18.5);
  assert.equal(game.state.schemaVersion, 8);
  for (const hour of [-1, 24, Infinity]) {
    const bad = JSON.parse(raw);
    bad.worldTime = hour;
    assert.throws(() => game.load(JSON.stringify(bad)));
  }
  for (const minutes of [0, -1, 10081]) {
    const bad = structuredClone(p);
    bad.world.dayNight.dayMinutes = minutes;
    assert.throws(() => readProject(bad));
  }
});
