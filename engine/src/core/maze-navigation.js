import { conditionMet } from "./mechanisms.js";

const cache = new WeakMap();
const edgeKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
/** Reconstruct routes from exported project geometry, with no hidden runtime state. */
export function mazeMap(project) {
  if (cache.has(project)) return cache.get(project);
  const floors = project.entities.filter((e) =>
    /^maze-cell-\d+-\d+$/.test(e.id),
  );
  if (
    !floors.length ||
    !project.entities.some((e) => e.id === "maze-entrance")
  ) {
    cache.set(project, null);
    return null;
  }
  const n = Math.max(...floors.map((e) => Number(e.id.split("-").at(-1)))) + 1;
  const nodes = new Map(
    floors.map((e) => {
      const [row, col] = e.id.split("-").slice(2).map(Number);
      return [row * n + col, e.position];
    }),
  );
  const entities = new Map(project.entities.map((e) => [e.id, e]));
  const entry = entities.get("maze-entrance"),
    root = [...nodes].sort(
      (a, b) =>
        Math.hypot(a[1][0] - entry.position[0], a[1][2] - entry.position[2]) -
        Math.hypot(b[1][0] - entry.position[0], b[1][2] - entry.position[2]),
    )[0][0];
  const cell = 6,
    positions = [...nodes.values()];
  const bounds = {
    minX: Math.min(...positions.map((p) => p[0])) - cell / 2,
    maxX: Math.max(...positions.map((p) => p[0])) + cell / 2,
    minZ: Math.min(...positions.map((p) => p[2])) - cell / 2,
    maxZ: Math.max(...positions.map((p) => p[2])) + cell / 2,
  };
  nodes.set("outside", [entry.position[0], 0, bounds.maxZ + 4]);
  const adj = new Map([...nodes.keys()].map((id) => [id, []]));
  const connect = (a, b, gate = null) => {
    adj.get(a).push({ to: b, gate });
    adj.get(b).push({ to: a, gate });
  };
  for (const id of nodes.keys())
    if (typeof id === "number")
      for (const next of [id % n < n - 1 ? id + 1 : -1, id + n]) {
        if (!nodes.has(next) || entities.has(`maze-wall-${edgeKey(id, next)}`))
          continue;
        connect(
          id,
          next,
          entities.get(`maze-gate-${edgeKey(id, next)}`) ?? null,
        );
      }
  connect(root, "outside", entry);
  const map = { nodes, adj, entities, bounds, root, entry, cell, n };
  cache.set(project, map);
  return map;
}
export function mazeCell(map, position) {
  const { bounds, n, cell } = map;
  if (
    position[0] < bounds.minX ||
    position[0] > bounds.maxX ||
    position[2] < bounds.minZ ||
    position[2] > bounds.maxZ
  )
    return "outside";
  const row = Math.max(
      0,
      Math.min(n - 1, Math.floor((position[2] - bounds.minZ) / cell)),
    ),
    col = Math.max(
      0,
      Math.min(n - 1, Math.floor((position[0] - bounds.minX) / cell)),
    );
  return row * n + col;
}
export function mazeRoute(map, from, to, allow = () => true) {
  const parent = new Map([[from, null]]),
    queue = [from];
  for (let i = 0; i < queue.length && !parent.has(to); i++)
    for (const edge of map.adj.get(queue[i]) ?? [])
      if (!parent.has(edge.to) && allow(edge)) {
        parent.set(edge.to, { from: queue[i], gate: edge.gate });
        queue.push(edge.to);
      }
  if (!parent.has(to)) return null;
  const route = [];
  for (let at = to; at !== from; ) {
    const p = parent.get(at);
    route.unshift({ from: p.from, to: at, gate: p.gate });
    at = p.from;
  }
  return route;
}
function exteriorWaypoint(map, position) {
  const { bounds } = map;
  if (position[2] >= bounds.maxZ) return null;
  if (position[0] >= bounds.minX - 1 && position[0] <= bounds.maxX + 1) {
    const x = position[0] < 0 ? bounds.minX - 3 : bounds.maxX + 3;
    return [x, 0, position[2]];
  }
  return [position[0], 0, bounds.maxZ + 4];
}
export function mazeNavigation(
  game,
  target,
  positionOf = (e) => e.position,
  visited = new Set(),
) {
  const map = mazeMap(game.project);
  if (!map || !target) return target;
  const entity = map.entities.get(target.id);
  if (!entity) return target;
  const position = game.state.position,
    goal =
      game.state.droppedItems[entity.id] ??
      positionOf(entity) ??
      entity.position;
  const start = mazeCell(map, position),
    end = mazeCell(map, goal),
    route = mazeRoute(map, start, end);
  if (!route) return target;
  // Missing keys are useful objectives; a compass pointing at their locked door is not.
  const closed = route.find(
    (edge) =>
      edge.gate &&
      (game.state.mechanisms[edge.gate.id]?.progress ?? 0) < 0.5 &&
      !conditionMet(edge.gate.motion, game.state),
  );
  if (
    closed &&
    !conditionMet(closed.gate.motion, game.state) &&
    !visited.has(closed.gate.id)
  ) {
    visited.add(closed.gate.id);
    let prerequisite;
    if (closed.gate.motion.condition === "item")
      prerequisite = map.entities.get(closed.gate.motion.target);
    if (closed.gate.motion.condition === "quest") {
      const q = game.project.quests.find(
        (q) => q.id === closed.gate.motion.target,
      );
      if (q)
        prerequisite = map.entities.get(
          !game.state.quests[q.id] || game.questProgress(q).ready
            ? q.giver
            : q.target,
        );
    }
    if (prerequisite)
      return mazeNavigation(
        game,
        { id: prerequisite.id, name: prerequisite.name },
        positionOf,
        visited,
      );
  }
  let waypoint = goal,
    name = target.name;
  if (start === "outside")
    waypoint = exteriorWaypoint(map, position) ?? waypoint;
  if (waypoint === goal && route.length) {
    const edge = route[0],
      gate = edge.gate;
    if (gate && (game.state.mechanisms[gate.id]?.progress ?? 0) < 0.5) {
      waypoint = gate.position;
      name = `${gate.motion.trigger === "interact" ? "E · " : ""}${gate.name}`;
    } else {
      waypoint = map.nodes.get(edge.to);
      name = `По коридору · ${target.name}`;
    }
    // Align with the current cell centre before taking a corner; never cut diagonally through walls.
    if (typeof start === "number") {
      const centre = map.nodes.get(start),
        next = map.nodes.get(edge.to);
      const cross =
        Math.abs(next[0] - centre[0]) > 0.1
          ? Math.abs(position[2] - centre[2])
          : Math.abs(position[0] - centre[0]);
      if (cross > 0.3) {
        waypoint = centre;
        name = `Поворот · ${target.name}`;
      }
    }
  }
  const dx = waypoint[0] - position[0],
    dz = waypoint[2] - position[2];
  return {
    id: target.id,
    name,
    distance: Math.hypot(dx, dz),
    bearing: Math.atan2(-dx, -dz),
  };
}
