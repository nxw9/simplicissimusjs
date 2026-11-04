import { Vector3 } from "three";
// Walk only cells crossed by the ray; triangle winding matches terrainGeometry.
export function terrainHit(ray, world, limit = Infinity) {
  const half = world.size / 2,
    n = world.terrain?.resolution ?? 1,
    step = world.size / n,
    s = n + 1;
  let enter = 0,
    exit = limit;
  for (const [axis, min, max] of [
    ["x", -half, half],
    ["y", -80, 80],
    ["z", -half, half],
  ]) {
    const o = ray.origin[axis],
      d = ray.direction[axis];
    if (Math.abs(d) < 1e-14) {
      if (o < min || o > max) return null;
      continue;
    }
    let a = (min - o) / d,
      b = (max - o) / d;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    exit = Math.min(exit, b);
  }
  if (exit < enter) return null;
  const start = ray.at(enter, new Vector3());
  let x = Math.max(0, Math.min(n - 1, Math.floor((start.x + half) / step))),
    z = Math.max(0, Math.min(n - 1, Math.floor((start.z + half) / step)));
  const sx = Math.sign(ray.direction.x),
    sz = Math.sign(ray.direction.z),
    dx = sx ? step / Math.abs(ray.direction.x) : Infinity,
    dz = sz ? step / Math.abs(ray.direction.z) : Infinity;
  let tx = sx
    ? (-half + (x + (sx > 0 ? 1 : 0)) * step - ray.origin.x) / ray.direction.x
    : Infinity;
  let tz = sz
    ? (-half + (z + (sz > 0 ? 1 : 0)) * step - ray.origin.z) / ray.direction.z
    : Infinity;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    d = new Vector3(),
    p = new Vector3();
  const vertex = (out, ix, iz) =>
    out.set(
      Math.fround(ix * step - half),
      Math.fround(world.terrain?.heights[iz * s + ix] ?? 0),
      Math.fround(iz * step - half),
    );
  for (
    let count = 0;
    count <= 2 * n + 2 && x >= 0 && x < n && z >= 0 && z < n;
    count++
  ) {
    vertex(a, x, z);
    vertex(b, x + 1, z);
    vertex(c, x, z + 1);
    vertex(d, x + 1, z + 1);
    let best = null;
    for (const tri of [
      [a, c, b],
      [b, c, d],
    ])
      if (ray.intersectTriangle(...tri, true, p)) {
        const distance = p.distanceTo(ray.origin);
        if (distance <= exit + 1e-7 && (!best || distance < best.distance))
          best = { point: p.clone(), distance };
      }
    if (best) return best;
    const next = Math.min(tx, tz);
    if (next > exit || !Number.isFinite(next)) break;
    if (tx <= next + 1e-10) {
      x += sx;
      tx += dx;
    }
    if (tz <= next + 1e-10) {
      z += sz;
      tz += dz;
    }
  }
  return null;
}
