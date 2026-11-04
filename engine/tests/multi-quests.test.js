import test from "node:test";
import assert from "node:assert/strict";
import { demoProject } from "../src/core/demo.js";
import {
  createEntity,
  readProject,
  serializeProject,
  renameEntity,
} from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
function setup() {
  const p = demoProject();
  const second = createEntity("enemy", "humanoid");
  second.id = "second";
  p.entities.push(second);
  p.quests = [
    {
      ...p.quests[0],
      type: "defeat",
      target: "sentinel",
      targets: ["sentinel", "second"],
    },
  ];
  return p;
}
test("multi-enemy quest counts unique defeats, resumes partial saves, rewards all targets only once", () => {
  const p = setup(),
    q = p.quests[0],
    g = new GameState(p);
  g.hit("second", 10000);
  g.questAction("accept", q.id, q.giver);
  assert.equal(g.state.gold, 0);
  assert.equal(g.questProgress(q).done, 1);
  assert.equal(g.questProgress(q).ready, false);
  assert.match(g.talk(q.giver), /1\/2/);
  const restored = new GameState(p);
  restored.load(g.save());
  assert.equal(restored.questProgress(q).done, 1);
  assert.equal(restored.hit("second", 10000), false);
  restored.hit("sentinel", 10000);
  assert.equal(restored.questProgress(q).ready, true);
  assert.equal(restored.state.gold, 0);
  restored.questAction("complete", q.id, q.giver);
  assert.equal(restored.state.gold, q.reward);
  restored.load(restored.save());
  restored.questAction("complete", q.id, q.giver);
  assert.equal(restored.state.gold, q.reward);
});
test("all quest target references are validated and remapped when a secondary enemy is renamed", () => {
  const p = setup();
  assert.deepEqual(readProject(serializeProject(p)), p);
  renameEntity(p, "second", "renamed");
  assert.deepEqual(p.quests[0].targets, ["sentinel", "renamed"]);
  assert.doesNotThrow(() => serializeProject(p));
  for (const ids of [
    [],
    ["sentinel", "sentinel"],
    ["sentinel", "missing"],
    ["sentinel", "warden"],
    ["renamed", "sentinel"],
  ]) {
    const bad = structuredClone(p);
    bad.quests[0].targets = ids;
    assert.throws(() => serializeProject(bad));
  }
  const removed = structuredClone(p);
  removed.entities = removed.entities.filter((e) => e.id !== "renamed");
  assert.throws(() => serializeProject(removed));
});
test("v10 quests and old saves migrate without content changes", () => {
  const old = demoProject();
  old.schemaVersion = 10;
  const before = structuredClone(old);
  const g = new GameState(old);
  g.questAction("accept", old.quests[0].id, old.quests[0].giver);
  const migrated = readProject(old);
  assert.equal(migrated.schemaVersion, 25);
  assert.deepEqual(migrated.quests, old.quests);
  assert.deepEqual(old, before);
  assert.equal(migrated.contentVersion, old.contentVersion);
  const restored = new GameState(migrated);
  restored.load(g.save());
  assert.equal(restored.state.quests[old.quests[0].id], "active");
});
