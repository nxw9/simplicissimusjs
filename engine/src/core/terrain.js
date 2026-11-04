import { insideWorld } from "./world-bounds.js";
/** Renderer-independent heightfield. Rows run along +Z, columns along +X. */
export const EYE_HEIGHT = 1.7;
export const MAX_HEIGHT = 80;
export function createTerrain(resolution = 128) {
  return {
    resolution,
    heights: Array((resolution + 1) ** 2).fill(0),
    regions: [],
  };
}
export function createRegion(world, start, end, id = crypto.randomUUID()) {
  const half = world.size / 2,
    step = world.size / (world.terrain?.resolution ?? 128);
  const snap = (n) =>
    Math.max(
      -half,
      Math.min(half, Math.round((n + half) / step) * step - half),
    );
  const min = [
    snap(Math.min(start[0], end[0])),
    snap(Math.min(start[1], end[1])),
  ];
  const max = [
    snap(Math.max(start[0], end[0])),
    snap(Math.max(start[1], end[1])),
  ];
  if (max[0] - min[0] < step * 3 || max[1] - min[1] < step * 3)
    throw Error("Протяните область шириной и длиной хотя бы в 3 клетки.");
  return {
    id,
    name: `Участок ${(world.terrain?.regions.length ?? 0) + 1}`,
    min,
    max,
  };
}
export function heightAt(world, x, z) {
  const t = world.terrain;
  if (!t || Math.abs(x) > world.size / 2 || Math.abs(z) > world.size / 2)
    return 0;
  const n = t.resolution,
    stride = n + 1;
  const gx = (x / world.size + 0.5) * n,
    gz = (z / world.size + 0.5) * n;
  const ix = Math.min(n - 1, Math.max(0, Math.floor(gx))),
    iz = Math.min(n - 1, Math.max(0, Math.floor(gz)));
  const u = gx - ix,
    v = gz - iz,
    a = t.heights[iz * stride + ix],
    b = t.heights[iz * stride + ix + 1];
  const c = t.heights[(iz + 1) * stride + ix],
    d = t.heights[(iz + 1) * stride + ix + 1];
  // Match the rendered triangle diagonal exactly (not bilinear interpolation).
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export function sculpt(
  world,
  region,
  x,
  z,
  radius,
  strength,
  dt,
  mode,
  dirty,
  level = 0,
) {
  const t = world.terrain;
  if (!t || !region || radius <= 0 || dt <= 0) return false;
  const n = t.resolution,
    s = n + 1,
    step = world.size / n,
    half = world.size / 2;

  let changed = false;
  const loX = Math.max(1, Math.floor((x - radius + half) / step));
  const hiX = Math.min(n - 1, Math.ceil((x + radius + half) / step));
  const loZ = Math.max(1, Math.floor((z - radius + half) / step));
  const hiZ = Math.min(n - 1, Math.ceil((z + radius + half) / step));
  const local =
    mode === "smooth" ? t.heights.slice((loZ - 1) * s, (hiZ + 2) * s) : null;
  const at = (i) => (local ? local[i - (loZ - 1) * s] : t.heights[i]);
  for (let iz = loZ; iz <= hiZ; iz++)
    for (let ix = loX; ix <= hiX; ix++) {
      const wx = ix * step - half,
        wz = iz * step - half;
      // Keep the border fixed: sculpting one patch never deforms its neighbours.
      if (
        wx <= region.min[0] ||
        wx >= region.max[0] ||
        wz <= region.min[1] ||
        wz >= region.max[1]
      )
        continue;
      const distance = Math.hypot(wx - x, wz - z);
      if (distance >= radius) continue;
      const falloff = (1 - (distance / radius) ** 2) ** 2;
      const border = Math.min(
        1,
        (wx - region.min[0]) / step,
        (region.max[0] - wx) / step,
        (wz - region.min[1]) / step,
        (region.max[1] - wz) / step,
      );
      const index = iz * s + ix;
      const value =
        mode === "flatten"
          ? at(index) +
            (level - at(index)) * Math.min(1, strength * dt * falloff * border)
          : mode === "smooth"
            ? at(index) +
              ((at(index - 1) + at(index + 1) + at(index - s) + at(index + s)) /
                4 -
                at(index)) *
                Math.min(1, strength * dt * falloff * border)
            : at(index) +
              (mode === "lower" ? -1 : 1) * strength * dt * falloff * border;
      const next = Math.max(-MAX_HEIGHT, Math.min(MAX_HEIGHT, value));
      if (Math.abs(next - t.heights[index]) > 1e-9) {
        t.heights[index] = next;
        changed = true;
        if (dirty) {
          dirty.minX = Math.min(dirty.minX ?? ix, ix);
          dirty.maxX = Math.max(dirty.maxX ?? ix, ix);
          dirty.minZ = Math.min(dirty.minZ ?? iz, iz);
          dirty.maxZ = Math.max(dirty.maxZ ?? iz, iz);
        }
      }
    }
  return changed;
}
export function groundPosition(world, position) {
  return [
    position[0],
    heightAt(world, position[0], position[2]) + EYE_HEIGHT,
    position[2],
  ];
}
export function moveGrounded(world, position, dx, dz, blocked = () => false) {
  let [x, , z] = position;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  const maxGrade = Math.tan((50 * Math.PI) / 180);
  const can = (nx, nz) => {
    if (
      !insideWorld(world, nx, nz)
    )
      return false;
    const y = heightAt(world, nx, nz),
      distance = Math.hypot(nx - x, nz - z);
    if (y - heightAt(world, x, z) > distance * maxGrade + 1e-5) return false;
    return !blocked(nx, nz, y);
  };
  for (let i = 0; i < count; i++) {
    if (can(x + dx / count, z)) x += dx / count;
    if (can(x, z + dz / count)) z += dz / count;
  }
  return groundPosition(world, [x, 0, z]);
}
