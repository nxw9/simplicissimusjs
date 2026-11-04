import { MAX_HEIGHT } from "./terrain.js";
import { noise2, smoothstep } from "./landscape.js";

function visit(world, region, minX, maxX, minZ, maxZ, dirty, edit) {
  const t = world.terrain;
  if (!t || !region) return false;
  const n = t.resolution, step = world.size / n, half = world.size / 2;
  let changed = false;
  for (let iz = Math.max(1, Math.ceil((minZ + half) / step)); iz <= Math.min(n - 1, Math.floor((maxZ + half) / step)); iz++) {
    for (let ix = Math.max(1, Math.ceil((minX + half) / step)); ix <= Math.min(n - 1, Math.floor((maxX + half) / step)); ix++) {
      const x = ix * step - half, z = iz * step - half, index = iz * (n + 1) + ix;
      if (x <= region.min[0] || x >= region.max[0] || z <= region.min[1] || z >= region.max[1]) continue;
      const result = edit(x, z, t.heights[index], step);
      if (!result) continue;
      const height = Math.max(-MAX_HEIGHT, Math.min(MAX_HEIGHT, result.height));
      const painted = result.material !== undefined && (t.paint?.[index] ?? 0) !== result.material;
      if (Math.abs(height - t.heights[index]) < 1e-9 && !painted) continue;
      t.heights[index] = height;
      if (painted) {
        t.paint ??= Array((n + 1) ** 2).fill(0);
        t.paint[index] = result.material;
        dirty.painted = true;
      }
      dirty.minX = Math.min(dirty.minX ?? ix, ix);
      dirty.maxX = Math.max(dirty.maxX ?? ix, ix);
      dirty.minZ = Math.min(dirty.minZ ?? iz, iz);
      dirty.maxZ = Math.max(dirty.maxZ ?? iz, iz);
      changed = true;
    }
  }
  return changed;
}

/** A discrete stamp: one click always adds one rocky terrace, even without a frame. */
export function raiseCliff(world, region, x, z, radius, strength, dirty = {}) {
  if (![x, z, radius, strength].every(Number.isFinite) || radius <= 0 || strength <= 0) return false;
  return visit(world, region, x-radius, x+radius, z-radius, z+radius, dirty, (wx, wz, old) => {
    const distance = Math.hypot(wx-x, wz-z) / radius;
    if (distance >= 1) return null;
    const edge = 1 - smoothstep(.55, 1, distance);
    const crag = .82 + .36 * noise2(wx / Math.max(1, radius*.24), wz / Math.max(1, radius*.24));
    return {height: old + strength * 2 * edge * crag, material: edge > .16 ? 3 : undefined};
  });
}

/** Rasterize the whole capsule, not just pointer samples: fast drags leave no gaps.
 * Points are [x,z,height]. The core is level across its width; shoulders blend out.
 */
export function carveRoad(world, region, from, to, radius, material = 4, dirty = {}) {
  if (![...from, ...to, radius].every(Number.isFinite) || radius <= 0 || !Number.isInteger(material) || material < 0 || material > 4) return false;
  const step = world.size / (world.terrain?.resolution ?? 128);
  const shoulder = Math.max(step * 2, radius * .5), outer = radius + shoulder;
  const dx = to[0]-from[0], dz = to[1]-from[1], length2 = dx*dx+dz*dz;
  return visit(world, region, Math.min(from[0],to[0])-outer, Math.max(from[0],to[0])+outer,
    Math.min(from[1],to[1])-outer, Math.max(from[1],to[1])+outer, dirty, (x,z,old) => {
      const t = length2 ? Math.max(0, Math.min(1, ((x-from[0])*dx+(z-from[1])*dz)/length2)) : 0;
      const d = Math.hypot(x-from[0]-dx*t,z-from[1]-dz*t);
      if (d >= outer) return null;
      const level = from[2] + (to[2]-from[2])*t;
      const blend = 1-smoothstep(radius,outer,d);
      return {height: old+(level-old)*blend, material:d <= radius ? material : undefined};
    });
}
