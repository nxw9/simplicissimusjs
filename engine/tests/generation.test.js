import test from "node:test";
import assert from "node:assert/strict";
import {
  generateAdventure,
  normalizeOptions,
  STORIES,
} from "../src/generation/adventure.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
import { Conversation } from "../src/core/dialogue.js";
import { navigationTarget, navigationLabel } from "../src/core/navigation.js";
import { conditionMet } from "../src/core/mechanisms.js";
import { heightAt } from "../src/core/terrain.js";
import { moveCharacter } from "../src/core/movement.js";
import { createEntityObject } from "../src/render/world.js";
import { entityColliders } from "../src/render/colliders.js";

function action(game, id, type) {
  const q = game.project.quests.find((q) => q.id === id);
  const conversation = new Conversation(game, q.giver);
  const c = conversation
    .screen()
    ?.choices.find(
      (c) => c.enabled && c.action?.quest === id && c.action?.type === type,
    );
  assert.ok(c, `${type} ${id}: ${JSON.stringify(conversation.screen())}`);
  assert.equal(conversation.choose(c.id), true);
  return conversation;
}
function finish(game, id) {
  const q = game.project.quests.find((q) => q.id === id);
  action(game, id, "accept");
  for (const target of q.targets ?? [q.target])
    q.type === "defeat" ? game.hit(target, 10000) : game.collect(target);
  action(game, id, "complete");
}
function reload(game) {
  const next = new GameState(readProject(serializeProject(game.project)));
  next.load(game.save());
  return next;
}

test("seed and normalized options reproduce the full project; all options change identity", () => {
  const p = generateAdventure({ seed: "Русский seed 🌲" });
  assert.deepEqual(generateAdventure({ seed: "Русский seed 🌲" }), p);
  assert.deepEqual(readProject(serializeProject(p)), p);
  for (const options of [
    { seed: "another" },
    { difficulty: "hard" },
    { size: "small" },
    { sideQuests: 0 },
    { biome: "autumn" },
    { story: "mist" },
  ])
    assert.notEqual(
      generateAdventure({ seed: "Русский seed 🌲", ...options }).id,
      p.id,
    );
  for (const options of [
    { seed: " " },
    { seed: "x".repeat(81) },
    { size: "huge" },
    { difficulty: "invalid" },
    { biome: "constructor" },
    { story: "__proto__" },
    { sideQuests: 4 },
    { sideQuests: 1.5 },
  ])
    assert.throws(() => normalizeOptions(options));
});

test("120 seeds produce valid bounded worlds, grounded actors, unique IDs and safe starts", () => {
  for (let i = 0; i < 120; i++) {
    const p = generateAdventure({
      seed: `world-${i}`,
      size: ["small", "medium", "large"][i % 3],
      sideQuests: i % 4,
      story: Object.keys(STORIES)[i % 3],
      difficulty: ["story", "normal", "hard"][i % 3],
    });
    assert.equal(new Set(p.entities.map((e) => e.id)).size, p.entities.length);
    for (const e of p.entities) {
      assert.ok(
        Math.abs(e.position[0]) < p.world.size / 2 &&
          Math.abs(e.position[2]) < p.world.size / 2,
        e.id,
      );
      if (e.kind === "npc" || e.kind === "enemy")
        assert.equal(
          e.position[1],
          heightAt(p.world, e.position[0], e.position[2]),
        );
      if (e.kind === "enemy")
        assert.ok(
          Math.hypot(
            e.position[0] - p.world.spawn[0],
            e.position[2] - p.world.spawn[2],
          ) >
            e.enemy.notice + 10,
        );
    }
    assert.equal(p.quests.length, 4 + (i % 4));
    assert.equal(p.entities.filter((e) => e.startInInventory).length, 2);
  }
});

test("every story and branch can finish through actual dialogue, with early items and save/load", () => {
  for (const story of Object.keys(STORIES))
    for (const branch of ["restore", "release"])
      for (const sideQuests of [0, 1, 3]) {
        let g = new GameState(
          generateAdventure({ seed: `play-${story}`, story, sideQuests }),
        );
        assert.equal(
          new Conversation(g, "witness").screen().choices.some((c) => c.action),
          false,
        );
        // Exploration ahead of the story is allowed, without prematurely unlocking it.
        g.collect("token");
        g.collect("relic");
        finish(g, "evidence");
        g = reload(g);
        finish(g, "testimony");
        if (sideQuests) finish(g, "supplies");
        action(g, branch, "accept");
        g = reload(g);
        const other = branch === "restore" ? "release" : "restore";
        assert.equal(
          new Conversation(g, "guide")
            .screen()
            .choices.some((c) => c.action?.quest === other),
          false,
        );
        if (branch === "release") {
          g.hit("guardian-a", 10000);
          g = reload(g);
          assert.equal(
            g.questProgress(g.project.quests.find((q) => q.id === branch))
              .ready,
            false,
          );
          g.hit("guardian-b", 10000);
        }
        const debrief = action(g, branch, "complete");
        if (sideQuests)
          assert.ok(debrief.screen().text.includes(STORIES[story].sideEnding));
        g = reload(g);
        const text = new Conversation(g, "guide").screen().text;
        assert.match(text, /ФИНАЛ/);
        assert.ok(
          text.includes(
            branch === "restore"
              ? STORIES[story].endingRestore
              : STORIES[story].endingRelease,
          ),
        );
        if (sideQuests) assert.ok(text.includes(STORIES[story].sideEnding));
        const before = g.state.gold;
        assert.equal(g.questAction("complete", branch, "guide"), false);
        assert.equal(g.state.gold, before);
        assert.equal(g.state.quests[other], undefined);
        const monument = g.project.entities.find(
          (e) => e.id === `monument-${branch}`,
        );
        assert.equal(conditionMet(monument.motion, g.state), true);
        assert.equal(
          conditionMet(
            g.project.entities.find((e) => e.id === `monument-${other}`).motion,
            g.state,
          ),
          false,
        );
        if (sideQuests === 3) {
          finish(g, "safe-road");
          finish(g, "heirloom");
        }
        assert.equal(
          Object.values(g.state.quests).filter((x) => x === "complete").length,
          3 + sideQuests,
        );
      }
});

test("optional help changes an already reached ending without reopening the other branch", () => {
  const g = new GameState(generateAdventure({ sideQuests: 1, story: "mist" }));
  finish(g, "evidence");
  finish(g, "testimony");
  finish(g, "restore");
  assert.ok(
    new Conversation(g, "guide")
      .screen()
      .text.includes(STORIES.mist.noSideEnding),
  );
  finish(g, "supplies");
  assert.ok(
    new Conversation(g, "guide")
      .screen()
      .text.includes(STORIES.mist.sideEnding),
  );
  assert.equal(g.state.quests.release, undefined);
});

test("navigation tracks objectives, return trips, dropped items and camera direction", () => {
  const g = new GameState(generateAdventure({ sideQuests: 0 }));
  assert.equal(navigationTarget(g).id, "guide");
  action(g, "evidence", "accept");
  assert.equal(navigationTarget(g).id, "clue");
  g.collect("clue");
  assert.equal(navigationTarget(g).id, "guide");
  g.drop("clue", [1, 0, 1]);
  assert.equal(navigationTarget(g).id, "clue");
  assert.equal(
    navigationTarget(g).distance,
    Math.hypot(1 - g.state.position[0], 1 - g.state.position[2]),
  );
  assert.match(
    navigationLabel({ name: "goal", distance: 10, bearing: 0 }, 0),
    /^↑/,
  );
  assert.match(
    navigationLabel({ name: "goal", distance: 10, bearing: -Math.PI / 2 }, 0),
    /^→/,
  );
  assert.match(
    navigationLabel({ name: "goal", distance: 10, bearing: Math.PI / 2 }, 0),
    /^←/,
  );
});

test("generated roads are traversable with actual terrain and prop colliders", () => {
  for (let seed = 0; seed < 12; seed++) {
    const p = generateAdventure({
      seed: `walk-${seed}`,
      size: ["small", "medium", "large"][seed % 3],
      sideQuests: 3,
    });
    const objects = p.entities
      .filter((e) => e.solid)
      .map((e) => ({ e, o: createEntityObject(e, new Map()) }));
    const boxes = objects.flatMap(({ e, o }) => {
      o.updateMatrixWorld(true);
      return entityColliders(e, o);
    });
    const hub = [0, 1.7, (27 * p.world.size) / 100];
    const goals = [
      "clue",
      "token",
      "relic",
      "supplies-item",
      "heirloom",
      "witness",
      "guide",
      "helper",
    ];
    for (const id of goals) {
      let pos = [...hub];
      const target = p.entities.find((e) => e.id === id).position;
      const motion = { grounded: true, velocity: 0 };
      // Follow the generated spoke to the site, then approach the object locally.
      const waypoint =
        id === "token" || id === "witness"
          ? p.entities.find((e) => e.id === "waypoint-2").position
          : id === "heirloom"
            ? p.entities.find((e) => e.id === "waypoint-4").position
            : null;
      const destinations = waypoint
        ? [[waypoint[0] - 4, 0, waypoint[2] - 3], target]
        : [target];
      for (const destination of destinations) {
        for (let frame = 0; frame < 2000; frame++) {
          const dx = destination[0] - pos[0],
            dz = destination[2] - pos[2],
            d = Math.hypot(dx, dz);
          if (d < 0.8) break;
          const step = Math.min(d, 4 / 30);
          pos = moveCharacter(
            p.world,
            pos,
            (dx / d) * step,
            (dz / d) * step,
            1 / 30,
            motion,
            boxes,
          );
        }
        assert.ok(
          Math.hypot(pos[0] - destination[0], pos[2] - destination[2]) < 1,
          `seed ${seed} blocked path to ${id}: ${pos}`,
        );
      }
    }
    for (const { o } of objects)
      o.traverse((node) => {
        node.geometry?.dispose();
        if (node.material) node.material.dispose();
      });
  }
});
