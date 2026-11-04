import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import {
  generateAdventure,
  normalizeOptions,
} from "../src/generation/adventure.js";
import { createMazeLayout } from "../src/generation/maze-layout.js";
import { GameState } from "../src/core/game.js";
import { Conversation } from "../src/core/dialogue.js";
import { conditionMet } from "../src/core/mechanisms.js";
import {
  mazeMap,
  mazeCell,
  mazeRoute,
  mazeNavigation,
} from "../src/core/maze-navigation.js";
import { navigationTarget } from "../src/core/navigation.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { moveCharacter } from "../src/core/movement.js";
import { createEntityObject } from "../src/render/world.js";
import { entityColliders, refreshBounds } from "../src/render/colliders.js";
import { Mechanisms } from "../src/render/mechanisms.js";

function act(game, id, type) {
  const q = game.project.quests.find((q) => q.id === id),
    talk = new Conversation(game, q.giver);
  const choice = talk
    .screen()
    ?.choices.find(
      (c) => c.enabled && c.action?.quest === id && c.action.type === type,
    );
  assert.ok(choice, `${id}: ${type} not offered`);
  assert.equal(talk.choose(choice.id), true);
  return talk;
}
function canReach(game, id, from = "outside") {
  const map = mazeMap(game.project),
    entity = map.entities.get(id);
  return (
    mazeRoute(
      map,
      from,
      mazeCell(map, entity.position),
      (edge) => !edge.gate || conditionMet(edge.gate.motion, game.state),
    ) !== null
  );
}
function complete(game, qid) {
  const q = game.project.quests.find((q) => q.id === qid);
  act(game, qid, "accept");
  assert.ok(canReach(game, q.target), qid);
  assert.ok(game.collect(q.target));
  act(game, qid, "complete");
}

test("maze mode is explicit, deterministic, standard v17, while old adventure seeds are unchanged", () => {
  const options = { mode: "maze", seed: "камень-42", sideQuests: 3 };
  const p = generateAdventure(options);
  assert.deepEqual(generateAdventure(options), p);
  assert.deepEqual(readProject(serializeProject(p)), p);
  assert.deepEqual(
    generateAdventure({ seed: "old" }),
    generateAdventure({ seed: "old", mode: "adventure" }),
  );
  assert.notEqual(p.id, generateAdventure({ ...options, sideQuests: 2 }).id);
  assert.throws(() => normalizeOptions({ mode: "bad" }));
  assert.equal(mazeCell(mazeMap(p), p.world.spawn), "outside");
  assert.equal(mazeMap(generateAdventure()), null);
  const fallback = createMazeLayout("small", () => 0, 3);
  assert.equal(fallback.optional.length, 3);
  assert.ok(fallback.path.length >= 14);
});

test("150 seeds: each main key is reachable before its lock, future sections are blocked, side wings are optional", () => {
  for (let i = 0; i < 150; i++) {
    const p = generateAdventure({
      mode: "maze",
      seed: `locks-${i}`,
      size: ["small", "medium", "large"][i % 3],
      sideQuests: i % 4,
    });
    const game = new GameState(p),
      map = mazeMap(p),
      stages = p.quests.filter((q) => /^maze-stage-/.test(q.id));
    assert.equal(stages.length, [3, 4, 5][i % 3]);
    assert.equal(canReach(game, "maze-key-1"), false);
    assert.ok(
      p.entities
        .filter((e) => e.kind === "enemy")
        .every((e) => e.id.startsWith("maze-side-")),
    );
    complete(game, "maze-entry");
    for (const [index, q] of stages.entries()) {
      assert.ok(canReach(game, q.giver), `giver ${i}/${index}`);
      assert.ok(canReach(game, q.target), `key ${i}/${index}`);
      assert.equal(
        canReach(game, "maze-chronicle"),
        false,
        `bypass ${i}/${index}`,
      );
      if (index + 1 < stages.length)
        assert.equal(
          canReach(game, stages[index + 1].target),
          false,
          `future key ${i}/${index}`,
        );
      act(game, q.id, "accept");
      game.collect(q.target);
      // A key alone does not remove the quest seal.
      assert.equal(canReach(game, "maze-chronicle"), false);
      act(game, q.id, "complete");
    }
    assert.ok(canReach(game, "maze-chronicle"));
    for (let side = 1; side <= i % 4; side++) {
      assert.ok(canReach(game, `maze-side-key-${side}`));
      assert.equal(canReach(game, `maze-side-relic-${side}`), false);
    }
    complete(game, "maze-finale");
    assert.match(new Conversation(game, "guide").screen().text, /ФИНАЛ/);
    assert.equal(
      Object.keys(game.state.quests).some((id) => /^maze-side-/.test(id)),
      false,
    );
    assert.equal(
      game.state.gold,
      20 + stages.reduce((sum, q) => sum + q.reward, 0) + 100,
    );
  }
});

test("side keys open only their wing; optional completion after the ending updates epilogue and survives saves", () => {
  let g = new GameState(
    generateAdventure({ mode: "maze", seed: "branches", sideQuests: 3 }),
  );
  complete(g, "maze-entry");
  for (const q of g.project.quests.filter((q) =>
    q.id.startsWith("maze-stage-"),
  ))
    complete(g, q.id);
  complete(g, "maze-finale");
  for (let i = 1; i <= 3; i++) {
    act(g, `maze-side-${i}`, "accept");
    const q = g.project.quests.find((q) => q.id === `maze-side-${i}`),
      target = mazeNavigation(g, { id: q.target, name: "optional" });
    assert.equal(target.id, `maze-side-key-${i}`);
    g.collect(`maze-side-key-${i}`);
    assert.ok(canReach(g, q.target));
    for (let j = i + 1; j <= 3; j++)
      assert.equal(canReach(g, `maze-side-relic-${j}`), false);
    g.collect(q.target);
    act(g, q.id, "complete");
    const restored = new GameState(readProject(serializeProject(g.project)));
    restored.load(g.save());
    g = restored;
    assert.match(
      new Conversation(g, "guide").screen().text,
      /необязательные находки/,
    );
  }
  const gold = g.state.gold;
  assert.equal(
    g.questAction(
      "complete",
      "maze-side-1",
      g.project.quests.find((q) => q.id === "maze-side-1").giver,
    ),
    false,
  );
  assert.equal(g.state.gold, gold);
});

function physicalWorld(project, game) {
  const objects = new Map(),
    boxes = [];
  for (const e of project.entities) {
    const object = createEntityObject(e, new Map());
    object.updateMatrixWorld(true);
    objects.set(e.id, object);
    boxes.push(...entityColliders(e, object));
  }
  const view = {
    objects,
    boxes,
    invalidate() {},
    refreshColliders(id) {
      for (const box of boxes) if (box.entityId === id) refreshBounds(box);
    },
  };
  const mechanisms = new Mechanisms(view, project, game);
  return {
    view,
    mechanisms,
    dispose() {
      for (const object of objects.values())
        object.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
    },
  };
}
function walk(game, world, id) {
  const e = game.project.entities.find((e) => e.id === id),
    motion = { grounded: true, velocity: 0 };
  for (let tick = 0; tick < 22000; tick++) {
    const position = game.state.position;
    if (
      Math.hypot(position[0] - e.position[0], position[2] - e.position[2]) <
      0.75
    )
      return;
    const target = mazeNavigation(game, { id, name: e.name });
    assert.ok(target);
    for (const gate of game.project.entities.filter(
      (e) => e.motion && e.motion.trigger === "interact",
    )) {
      const record = game.state.mechanisms[gate.id];
      if (
        !record.open &&
        conditionMet(gate.motion, game.state) &&
        Math.hypot(
          position[0] - gate.position[0],
          position[2] - gate.position[2],
        ) < 3.2
      )
        world.mechanisms.interact(gate.id);
    }
    world.mechanisms.update(0.08, new Vector3(...position));
    const step = Math.min(0.32, target.distance);
    game.state.position = moveCharacter(
      game.project.world,
      position,
      -Math.sin(target.bearing) * step,
      -Math.cos(target.bearing) * step,
      0.08,
      motion,
      world.view.boxes,
    );
  }
  assert.fail(
    `Cannot walk to ${id}; position ${game.state.position}; target ${JSON.stringify(mazeNavigation(game, { id, name: e.name }))}`,
  );
}

test("real geometry blocks entrance and walls; navigator walks all main stages, key doors and exit across save/load", () => {
  for (const [size, seed] of [
    ["small", "physical-a"],
    ["medium", "physical-b"],
    ["large", "physical-c"],
  ]) {
    const p = generateAdventure({ mode: "maze", size, seed, sideQuests: 3 }),
      g = new GameState(p);
    let w = physicalWorld(p, g);
    const entry = p.entities.find((e) => e.id === "maze-entrance"),
      pos = [entry.position[0], 1.7, entry.position[2] + 1];
    const blocked = moveCharacter(
      p.world,
      pos,
      0,
      -2,
      0.5,
      { grounded: true, velocity: 0 },
      w.view.boxes,
    );
    assert.ok(
      blocked[2] > entry.position[2],
      "closed entrance must block movement",
    );
    const wall = p.entities.find((e) => /^maze-wall-/.test(e.id)),
      vertical = wall.scale[0] < wall.scale[2];
    const before = [
      wall.position[0] + (vertical ? 1 : 0),
      1.7,
      wall.position[2] + (vertical ? 0 : 1),
    ];
    const after = moveCharacter(
      p.world,
      before,
      vertical ? -2 : 0,
      vertical ? 0 : -2,
      0.5,
      { grounded: true, velocity: 0 },
      w.view.boxes,
      true,
    );
    assert.ok(
      vertical ? after[0] > wall.position[0] : after[2] > wall.position[2],
      "cannot jump across a wall",
    );
    walk(g, w, "guide");
    act(g, "maze-entry", "accept");
    walk(g, w, "maze-permit");
    g.collect("maze-permit");
    walk(g, w, "guide");
    act(g, "maze-entry", "complete");
    for (const q of p.quests.filter((q) => /^maze-stage-/.test(q.id))) {
      walk(g, w, q.giver);
      act(g, q.id, "accept");
      walk(g, w, q.target);
      g.collect(q.target);
      walk(g, w, q.giver);
      act(g, q.id, "complete");
      const saved = g.save();
      w.dispose();
      g.load(saved);
      w = physicalWorld(p, g);
    }
    assert.equal(navigationTarget(g).id, "maze-chronicle");
    walk(g, w, "maze-chronicle");
    g.collect("maze-chronicle");
    walk(g, w, "guide");
    act(g, "maze-finale", "accept");
    act(g, "maze-finale", "complete");
    assert.equal(mazeCell(mazeMap(p), g.state.position), "outside");
    const beforeSave = structuredClone(g.state.mechanisms),
      restored = new GameState(p);
    restored.load(g.save());
    assert.deepEqual(restored.state.mechanisms, beforeSave);
    for (let i = 1; i <= 3; i++) {
      const q = p.quests.find((q) => q.id === `maze-side-${i}`);
      walk(g, w, q.giver);
      act(g, q.id, "accept");
      walk(g, w, `maze-side-key-${i}`);
      g.collect(`maze-side-key-${i}`);
      walk(g, w, q.target);
      g.collect(q.target);
      walk(g, w, q.giver);
      act(g, q.id, "complete");
    }
    assert.ok(
      Object.values(g.state.mechanisms).filter((m) => m.open).length >=
        p.quests.filter((q) => q.id.startsWith("maze-stage-")).length * 2 + 4,
    );
    w.dispose();
  }
});
