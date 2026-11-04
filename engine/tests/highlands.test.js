import test from "node:test";
import assert from "node:assert/strict";
import { generateAdventure } from "../src/generation/adventure.js";
import { GameState } from "../src/core/game.js";
import { Conversation } from "../src/core/dialogue.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { heightAt } from "../src/core/terrain.js";
import { moveCharacter } from "../src/core/movement.js";
import {
  highlandNavigation,
  highlandRoads,
  highlandRoute,
} from "../src/core/highland-navigation.js";
import { navigationTarget } from "../src/core/navigation.js";
import { createEntityObject } from "../src/render/world.js";
import { entityColliders } from "../src/render/colliders.js";
function action(game, id, type) {
  const q = game.project.quests.find((q) => q.id === id),
    conversation = new Conversation(game, q.giver),
    choice = conversation
      .screen()
      ?.choices.find(
        (c) => c.enabled && c.action?.quest === id && c.action.type === type,
      );
  assert.ok(choice, `${id} ${type}`);
  assert.ok(conversation.choose(choice.id));
  return conversation;
}
function finish(g, id) {
  const q = g.project.quests.find((q) => q.id === id);
  action(g, id, "accept");
  for (const target of q.targets ?? [q.target])
    q.type === "defeat" ? g.hit(target, 9999) : g.collect(target);
  action(g, id, "complete");
}
function blocked(world, a, b) {
  for (let i = 1; i < 200; i++) {
    const t = i / 200,
      x = a[0] + t * (b[0] - a[0]),
      z = a[2] + t * (b[2] - a[2]);
    if (heightAt(world, x, z) > a[1] + t * (b[1] - a[1])) return true;
  }
  return false;
}

test("highland seed reproduces a standard project, three hidden valley towns and an elevated fourth", () => {
  for (let i = 0; i < 45; i++) {
    const opts = {
      mode: "highlands",
      seed: `valley-${i}`,
      size: ["small", "medium", "large"][i % 3],
      sideQuests: i % 4,
    };
    const p = generateAdventure(opts),
      towns = [0, 1, 2, 3].map(
        (n) => p.entities.find((e) => e.id === `highland-town-${n}`).position,
      );
    assert.deepEqual(generateAdventure(opts), p);
    assert.deepEqual(readProject(serializeProject(p)), p);
    assert.ok(
      towns[3][1] - Math.max(...towns.slice(0, 3).map((p) => p[1])) >= 23,
    );
    for (let a = 0; a < 3; a++)
      for (let b = a + 1; b < 3; b++) {
        // Test not just the plaza: elevated observers around town edges remain screened by terrain.
        for (let side = 0; side < 8; side++) {
          const angle = (side * Math.PI) / 4,
            from = [
              towns[a][0] + Math.cos(angle) * 16,
              10,
              towns[a][2] + Math.sin(angle) * 16,
            ],
            to = [
              towns[b][0] - Math.cos(angle) * 16,
              10,
              towns[b][2] - Math.sin(angle) * 16,
            ];
          assert.ok(
            blocked(p.world, from, to),
            `city sightline ${i}: ${a}->${b}/${side}`,
          );
        }
      }
    for (let town = 0; town < 4; town++)
      assert.ok(
        p.entities.filter((e) =>
          new RegExp(`^highland-house-${town}-\\d+$`).test(e.id),
        ).length >= 6,
      );
    for (const e of p.entities)
      if (e.kind === "npc" || e.kind === "enemy")
        assert.equal(
          e.position[1],
          heightAt(p.world, e.position[0], e.position[2]),
        );
    const roads = highlandRoads(p);
    for (const node of roads.nodes.keys())
      assert.ok(highlandRoute(roads, 24, node));
  }
});

test("four-town investigation, both exclusive endings, optional help and saves remain consistent", () => {
  for (const branch of ["highland-treaty", "highland-river"])
    for (const sideQuests of [0, 1, 3]) {
      let g = new GameState(
        generateAdventure({ mode: "highlands", seed: "plot", sideQuests }),
      );
      for (let i = 2; i <= 4; i++) {
        const q = g.project.quests.find((q) => q.id === `highland-main-${i}`);
        assert.equal(
          new Conversation(g, q.giver).screen().choices.some((c) => c.action),
          false,
        );
      }
      for (let i = 1; i <= 4; i++) {
        assert.equal(
          navigationTarget(g).id,
          g.project.quests.find((q) => q.id === `highland-main-${i}`).giver,
        );
        finish(g, `highland-main-${i}`);
        const restored = new GameState(
          readProject(serializeProject(g.project)),
        );
        restored.load(g.save());
        g = restored;
      }
      assert.equal(navigationTarget(g).id, "highland-warden");
      action(g, branch, "accept");
      const other =
        branch === "highland-treaty" ? "highland-river" : "highland-treaty";
      assert.equal(
        new Conversation(g, "highland-warden")
          .screen()
          .choices.some((c) => c.action?.quest === other),
        false,
      );
      g.collect(g.project.quests.find((q) => q.id === branch).target);
      action(g, branch, "complete");
      assert.match(
        new Conversation(g, "highland-warden").screen().text,
        /ФИНАЛ/,
      );
      for (const id of ["guide", "highland-smith", "highland-scholar"])
        assert.match(new Conversation(g, id).screen().text, /получил весть/);
      for (let i = 1; i <= sideQuests; i++) finish(g, `highland-side-${i}`);
      if (sideQuests)
        assert.match(
          new Conversation(g, "highland-warden").screen().text,
          /Спасённое зерно/,
        );
      const gold = g.state.gold;
      assert.equal(g.questAction("complete", branch, "highland-warden"), false);
      assert.equal(g.state.gold, gold);
      assert.equal(g.state.quests[other], undefined);
    }
});

function walk(g, objects, id) {
  const target = g.project.entities.find((e) => e.id === id),
    motion = { grounded: true, velocity: 0 };
  for (let tick = 0; tick < 18000; tick++) {
    if (
      Math.hypot(
        g.state.position[0] - target.position[0],
        g.state.position[2] - target.position[2],
      ) < 0.8
    )
      return;
    const marker = highlandNavigation(g, { id, name: target.name }),
      step = Math.min(0.35, marker.distance);
    g.state.position = moveCharacter(
      g.project.world,
      g.state.position,
      -Math.sin(marker.bearing) * step,
      -Math.cos(marker.bearing) * step,
      0.0875,
      motion,
      objects.boxes,
    );
  }
  assert.fail(
    `Blocked road to ${id}: ${g.state.position}; ${JSON.stringify(highlandNavigation(g, { id, name: id }))}`,
  );
}
test("actual terrain, houses and road navigation allow both directions, all towns and the summit without jumps", () => {
  for (const [size, seed] of [
    ["small", "roads-a"],
    ["medium", "roads-b"],
    ["large", "roads-c"],
  ]) {
    const p = generateAdventure({
        mode: "highlands",
        size,
        seed,
        sideQuests: 3,
      }),
      g = new GameState(p),
      objects = { meshes: [], boxes: [] };
    for (const e of p.entities.filter((e) => e.solid)) {
      const o = createEntityObject(e, new Map());
      o.updateMatrixWorld(true);
      objects.meshes.push(o);
      objects.boxes.push(...entityColliders(e, o));
    }
    for (let i = 1; i <= 4; i++) {
      const q = p.quests.find((q) => q.id === `highland-main-${i}`);
      walk(g, objects, q.giver);
      action(g, q.id, "accept");
      walk(g, objects, q.target);
      g.collect(q.target);
      walk(g, objects, q.giver);
      action(g, q.id, "complete");
    }
    action(g, "highland-river", "accept");
    walk(g, objects, "highland-spillway");
    g.collect("highland-spillway");
    walk(g, objects, "highland-warden");
    action(g, "highland-river", "complete");
    for (const id of [
      "guide",
      "highland-smith",
      "highland-scholar",
      "highland-helper-0",
      "highland-grain",
      "highland-helper-2",
      "highland-letters",
    ])
      walk(g, objects, id);
    for (const o of objects.meshes)
      o.traverse((m) => {
        m.geometry?.dispose();
        m.material?.dispose();
      });
  }
});
