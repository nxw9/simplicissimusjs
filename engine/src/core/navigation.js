import { eventEntityPresent, moonBound } from "./moon-land.js";
import { highlandNavigation } from "./highland-navigation.js";
import { mazeNavigation } from "./maze-navigation.js";
import { Conversation } from "./dialogue.js";

/** Resolve a useful next objective, including a giver when an objective is ready. */
export function navigationTarget(game, positionOf = (e) => e.position) {
  const { project, state } = game;
  const actors = new Map(project.entities.map((e) => [e.id, e]));
  const active = project.quests.find((q) => state.quests[q.id] === "active");
  let candidates;
  if (active) {
    const progress = game.questProgress(active);
    candidates = (progress.ready ? [active.giver] : progress.remaining)
      .map((id) => actors.get(id))
      .filter(Boolean);
  } else {
    const lastMazeQuest = project.quests
      .filter((q) => /^maze-stage-/.test(q.id))
      .at(-1);
    const chronicle = actors.get("maze-chronicle");
    if (
      lastMazeQuest &&
      state.quests[lastMazeQuest.id] === "complete" &&
      chronicle &&
      !state.quests["maze-finale"]
    ) {
      const objective = game.collected(chronicle.id)
        ? actors.get("guide")
        : chronicle;
      return mazeNavigation(
        game,
        { id: objective.id, name: objective.name },
        positionOf,
      );
    }
    candidates = project.entities.filter(
      (e) =>
        e.kind === "npc" &&
        !state.defeated.includes(e.id) &&
        new Conversation(game, e.id)
          .screen()
          ?.choices.some((c) => c.enabled && c.action?.type === "accept"),
    );
    const nextMain = project.quests.find(
      (q) =>
        (q.main ||
          q.id === "maze-entry" ||
          q.id.startsWith("maze-stage-") ||
          q.id.startsWith("highland-main-")) &&
        !state.quests[q.id],
    );
    const mainGiver = candidates.find((e) => e.id === nextMain?.giver);
    if (mainGiver) candidates = [mainGiver];
    if (
      state.quests["highland-main-4"] === "complete" &&
      !state.quests["highland-treaty"] &&
      !state.quests["highland-river"]
    ) {
      const warden = candidates.find((e) => e.id === "highland-warden");
      if (warden) candidates = [warden];
    }
    // After finishing the story, the author may still have an epilogue to tell.
    if (!candidates.length && project.id.startsWith("generated-"))
      candidates = [actors.get("guide")].filter(Boolean);
  }
  const target =
    candidates
      .map((entity) => {
        const position =
          state.droppedItems[entity.id] ??
          positionOf(entity) ??
          entity.position;
        const dx = position[0] - state.position[0],
          dz = position[2] - state.position[2];
        return {
          id: entity.id,
          name: entity.name + (moonBound(entity, project.world) && !eventEntityPresent(entity, project.world, state) ? " · ждите красную луну" : ""),
          distance: Math.hypot(dx, dz),
          bearing: Math.atan2(-dx, -dz),
        };
      })
      .sort((a, b) => a.distance - b.distance)[0] ?? null;
  return highlandNavigation(
    game,
    mazeNavigation(game, target, positionOf),
    positionOf,
  );
}
export function navigationLabel(target, yaw = 0) {
  if (!target) return "Исследуйте мир";
  const angle = Math.atan2(
    Math.sin(target.bearing - yaw),
    Math.cos(target.bearing - yaw),
  );
  const arrows = ["↑", "↖", "←", "↙", "↓", "↘", "→", "↗"];
  const arrow = arrows[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
  return `${arrow} ${target.name} · ${Math.round(target.distance)} м`;
}
