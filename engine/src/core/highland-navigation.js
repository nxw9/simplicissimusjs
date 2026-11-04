/** Exported road markers keep hill routes available after JSON/HTML export. */
const maps = new WeakMap();
export function highlandRoads(project) {
  if (maps.has(project)) return maps.get(project);
  const nodes = new Map(
    project.entities
      .filter((e) => /^highland-node-\d+$/.test(e.id))
      .map((e) => [Number(e.id.split("-").at(-1)), e.position]),
  );
  if (!nodes.size) {
    maps.set(project, null);
    return null;
  }
  const adj = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const e of project.entities) {
    const match = e.id.match(/^highland-route-(\d+)-(\d+)$/);
    if (!match) continue;
    const a = Number(match[1]),
      b = Number(match[2]);
    if (!nodes.has(a) || !nodes.has(b)) continue;
    const pa = nodes.get(a),
      pb = nodes.get(b),
      cost = Math.hypot(pa[0] - pb[0], pa[2] - pb[2]);
    adj.get(a).push({ id: b, cost });
    adj.get(b).push({ id: a, cost });
  }
  const map = { nodes, adj };
  maps.set(project, map);
  return map;
}
export function highlandRoute(map, start, end) {
  const costs = new Map([[start, 0]]),
    parent = new Map(),
    remaining = new Set(map.nodes.keys());
  while (remaining.size) {
    let current = null,
      best = Infinity;
    for (const id of remaining)
      if ((costs.get(id) ?? Infinity) < best) {
        current = id;
        best = costs.get(id);
      }
    if (current === null) break;
    if (current === end) {
      const path = [end];
      while (path[0] !== start) path.unshift(parent.get(path[0]));
      return path;
    }
    remaining.delete(current);
    for (const { id, cost } of map.adj.get(current) ?? [])
      if (remaining.has(id) && best + cost < (costs.get(id) ?? Infinity)) {
        costs.set(id, best + cost);
        parent.set(id, current);
      }
  }
  return null;
}
const nearest = (map, p) =>
  [...map.nodes].reduce(
    (best, [id, pos]) => {
      const distance = Math.hypot(p[0] - pos[0], p[2] - pos[2]);
      return distance < best.distance ? { id, distance } : best;
    },
    { id: null, distance: Infinity },
  ).id;
export function highlandNavigation(
  game,
  target,
  positionOf = (e) => e.position,
) {
  const map = highlandRoads(game.project);
  if (!map || !target) return target;
  const entity = game.project.entities.find((e) => e.id === target.id);
  if (!entity) return target;
  const goal =
      game.state.droppedItems[entity.id] ??
      positionOf(entity) ??
      entity.position,
    position = game.state.position;
  const start = nearest(map, position),
    end = nearest(map, goal),
    path = highlandRoute(map, start, end);
  if (!path) return target;
  let waypoint = goal,
    name = target.name;
  if (path.length > 1) {
    const a = map.nodes.get(start),
      b = map.nodes.get(path[1]),
      dx = b[0] - a[0],
      dz = b[2] - a[2];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((position[0] - a[0]) * dx + (position[2] - a[2]) * dz) /
          (dx * dx + dz * dz || 1),
      ),
    );
    const cross = Math.hypot(
      position[0] - a[0] - t * dx,
      position[2] - a[2] - t * dz,
    );
    waypoint = cross > 1.2 ? a : b;
    name = `По дороге · ${target.name}`;
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
