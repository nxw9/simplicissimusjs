/** A perfect maze: its spanning tree makes every locked edge a real separator. */
export const MAZE_SIZES = {
  small: { cells: 9, stages: 3 },
  medium: { cells: 11, stages: 4 },
  large: { cells: 13, stages: 5 },
};
export const CELL_SIZE = 6;
export const edgeKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
export function neighbours(id, n) {
  const row = Math.floor(id / n),
    col = id % n,
    result = [];
  if (row > 0) result.push(id - n);
  if (col > 0) result.push(id - 1);
  if (row < n - 1) result.push(id + n);
  if (col < n - 1) result.push(id + 1);
  return result;
}
function analyse(adj, root) {
  const parent = new Map([[root, null]]),
    queue = [root];
  for (let head = 0; head < queue.length; head++)
    for (const next of adj[queue[head]])
      if (!parent.has(next)) {
        parent.set(next, queue[head]);
        queue.push(next);
      }
  const path = [];
  for (let at = queue.at(-1); at !== null; at = parent.get(at))
    path.unshift(at);
  const main = new Set(path),
    branches = [];
  path.forEach((cell, pathIndex) => {
    for (const child of adj[cell])
      if (!main.has(child)) {
        const cells = [child],
          seen = new Set([cell, child]);
        for (let head = 0; head < cells.length; head++)
          for (const next of adj[cells[head]])
            if (!seen.has(next)) {
              seen.add(next);
              cells.push(next);
            }
        branches.push({
          attach: cell,
          pathIndex,
          root: child,
          cells,
          leaf: cells.at(-1),
        });
      }
  });
  return { path, branches };
}
export function createMazeLayout(size, rng, optionalCount = 2) {
  const { cells: n, stages } = MAZE_SIZES[size],
    root = (n - 1) * n + Math.floor(n / 2);
  let adj, analysis;
  // Bounded retries prefer an exploratory route with substantial optional wings.
  for (let attempt = 0; attempt <= 48; attempt++) {
    adj = Array.from({ length: n * n }, () => []);
    const connect = (a, b) => {
      adj[a].push(b);
      adj[b].push(a);
    };
    if (attempt === 48) {
      // Deterministic comb fallback, with a long spine and many side corridors.
      for (let row = 0; row < n; row++) {
        for (let col = 1; col < n; col++)
          connect(row * n + col - 1, row * n + col);
        if (row) connect((row - 1) * n, row * n);
      }
    } else {
      const stack = [root],
        visited = new Set(stack);
      while (stack.length) {
        const current = stack.at(-1),
          available = neighbours(current, n).filter((id) => !visited.has(id));
        if (!available.length) {
          stack.pop();
          continue;
        }
        const next = available[Math.floor(rng() * available.length)];
        connect(current, next);
        visited.add(next);
        stack.push(next);
      }
    }
    analysis = analyse(adj, root);
    if (
      analysis.path.length >= stages * 4 + 2 &&
      analysis.branches.filter((b) => b.cells.length >= 2).length >=
        optionalCount
    )
      break;
  }
  const path = analysis.path,
    gates = [];
  let start = 0;
  for (let i = 0; i < stages; i++) {
    const end = Math.floor(((i + 1) * (path.length - 1)) / stages) - 1;
    gates.push({
      start,
      end,
      keyEdge: [path[end - 1], path[end]],
      sealEdge: [path[end], path[end + 1]],
    });
    start = end + 1;
  }
  const candidates = analysis.branches.filter((b) => b.cells.length >= 2);
  // Spread optional wings along the route, never using one as a main-key location.
  const optional = [];
  for (let i = 0; i < optionalCount; i++)
    optional.push(
      candidates.splice(Math.floor(rng() * candidates.length), 1)[0],
    );
  optional.sort((a, b) => a.pathIndex - b.pathIndex);
  return { n, root, adj, path, gates, branches: analysis.branches, optional };
}
