import { Box3, Matrix4, Vector3 } from "three";

/** Bounds are built on load/edit, never from triangles in the movement loop. */
export function entityColliders(entity, object) {
  if (!entity.solid || entity.kind === "enemy") return [];
  if (entity.collision === "wall") return wallColliders(entity, object);
  const result = [];
  const add = (mesh) => {
    const b = new Box3().setFromObject(mesh);
    if (b.isEmpty()) return;
    b.entityId = entity.id;
    b.mesh = mesh;
    b.collision = entity.collision ?? "meshes";
    shapeBounds(b);
    result.push(b);
  };
  if ((entity.collision ?? "meshes") === "meshes")
    object.traverse((o) => {
      if (o.isMesh) add(o);
    });
  else add(object);
  return result;
}
// Small local slices follow diagonal walls without blocking their whole AABB.
// Keep local bounds so moving/rotating/scaling a section updates every slice.
function wallColliders(entity, object) {
  object.updateWorldMatrix(true, true);
  const local = new Box3(), inverse = object.matrixWorld.clone().invert(), relative = new Matrix4();
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    relative.multiplyMatrices(inverse, mesh.matrixWorld);
    local.union(mesh.geometry.boundingBox.clone().applyMatrix4(relative));
  });
  if (local.isEmpty()) return [];
  const scale = object.getWorldScale(new Vector3());
  const count = Math.max(1, Math.min(128, Math.ceil((local.max.x-local.min.x)*Math.abs(scale.x)/.25)));
  const result = [], length = local.max.x-local.min.x;
  for (let i = 0; i < count; i++) {
    const slice = local.clone();
    slice.min.x = local.min.x + length*i/count;
    slice.max.x = local.min.x + length*(i+1)/count;
    const b = slice.clone().applyMatrix4(object.matrixWorld);
    b.entityId = entity.id; b.mesh = object; b.collision = "wall"; b.localBounds = slice;
    result.push(b);
  }
  return result;
}
function shapeBounds(b) {
  if (b.collision !== "trunk") return;
  const cx = (b.min.x + b.max.x) / 2,
    cz = (b.min.z + b.max.z) / 2;
  const radius = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) * 0.1;
  b.min.x = cx - radius;
  b.max.x = cx + radius;
  b.min.z = cz - radius;
  b.max.z = cz + radius;
}
export function refreshBounds(b) {
  if (b.disabled) {
    b.makeEmpty();
    return;
  }
  if (b.localBounds) {
    b.mesh.updateWorldMatrix(true, false);
    b.copy(b.localBounds).applyMatrix4(b.mesh.matrixWorld);
  } else b.setFromObject(b.mesh);
  shapeBounds(b);
}

/** XZ spatial hash. Oversized bounds use a fallback list to cap index memory. */
export class ColliderIndex {
  constructor(boxes = [], cellSize = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.membership = new Map();
    this.large = new Set();
    for (const b of boxes) this.insert(b);
  }
  range(minX, minZ, maxX, maxZ) {
    return [minX, minZ, maxX, maxZ].map((v) => Math.floor(v / this.cellSize));
  }
  insert(b) {
    if (b.isEmpty()) return;
    const [x0, z0, x1, z1] = this.range(b.min.x, b.min.z, b.max.x, b.max.z);
    if (
      !Number.isFinite(x0 + z0 + x1 + z1) ||
      (x1 - x0 + 1) * (z1 - z0 + 1) > 256
    ) {
      this.large.add(b);
      return;
    }
    const keys = [];
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const key = `${x}:${z}`;
        if (!this.cells.has(key)) this.cells.set(key, new Set());
        this.cells.get(key).add(b);
        keys.push(key);
      }
    this.membership.set(b, keys);
  }
  update(b) {
    this.large.delete(b);
    for (const key of this.membership.get(b) ?? []) {
      const cell = this.cells.get(key);
      cell.delete(b);
      if (!cell.size) this.cells.delete(key);
    }
    this.membership.delete(b);
    this.insert(b);
  }
  query(minX, minZ, maxX, maxZ) {
    const [x0, z0, x1, z1] = this.range(minX, minZ, maxX, maxZ);
    const candidates = new Set(this.large);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
      for (const b of this.membership.keys()) candidates.add(b);
    } else {
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++)
          for (const b of this.cells.get(`${x}:${z}`) ?? []) candidates.add(b);
    }
    return [...candidates].filter(
      (b) =>
        b.max.x >= minX &&
        b.min.x <= maxX &&
        b.max.z >= minZ &&
        b.min.z <= maxZ,
    );
  }
}
