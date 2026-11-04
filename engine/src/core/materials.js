export const MATERIALS = [
  { id: 0, name: "Без текстуры" },
  { id: 1, name: "Трава и почва", file: "grass-soil" },
  { id: 2, name: "Густая трава", file: "grass" },
  { id: 3, name: "Камень", file: "rock" },
  { id: 4, name: "Кирпич", file: "brick" },
];
/** Paint vertex IDs; the renderer blends adjacent vertices without adding geometry. */
export function paintTerrain(
  world,
  region,
  x,
  z,
  radius,
  material,
  fill = false,
) {
  const t = world.terrain;
  if (
    !t ||
    !region ||
    !Number.isInteger(material) ||
    material < 0 ||
    material > 4
  )
    return false;
  const n = t.resolution,
    stride = n + 1,
    step = world.size / n,
    half = world.size / 2;
  let changed = false;
  const x0 = Math.max(
    0,
    Math.ceil(
      ((fill ? region.min[0] : Math.max(region.min[0], x - radius)) + half) /
        step,
    ),
  );
  const x1 = Math.min(
    n,
    Math.floor(
      ((fill ? region.max[0] : Math.min(region.max[0], x + radius)) + half) /
        step,
    ),
  );
  const z0 = Math.max(
    0,
    Math.ceil(
      ((fill ? region.min[1] : Math.max(region.min[1], z - radius)) + half) /
        step,
    ),
  );
  const z1 = Math.min(
    n,
    Math.floor(
      ((fill ? region.max[1] : Math.min(region.max[1], z + radius)) + half) /
        step,
    ),
  );
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      if (
        !fill &&
        Math.hypot(ix * step - half - x, iz * step - half - z) > radius
      )
        continue;
      const i = iz * stride + ix;
      if ((t.paint?.[i] ?? 0) === material) continue;
      t.paint ??= Array(stride ** 2).fill(0);
      t.paint[i] = material;
      changed = true;
    }
  return changed;
}
