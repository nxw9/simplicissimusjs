import { paintAttribute, groundMaterial } from "./materials.js";
import {
  BufferGeometry,
  BufferAttribute,
  Box3,
  Vector3,
  Sphere,
} from "three";
/** Uses exactly the same triangle split as core/terrain.heightAt. */
export function terrainGeometry(world) {
  const n = world.terrain?.resolution ?? 1,
    stride = n + 1;
  const vertices = stride ** 2, positions = new Float32Array(vertices*3),
    uv = new Float32Array(vertices*2),
    indices = vertices>65535 ? new Uint32Array(n*n*6) : new Uint16Array(n*n*6);
  let pi=0,ui=0,ii=0;
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      positions[pi++]=(x/n-0.5)*world.size;
      positions[pi++]=world.terrain?.heights[z*stride+x]??0;
      positions[pi++]=(z/n-0.5)*world.size;
      uv[ui++]=x/n;uv[ui++]=z/n;
    }
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const a = z * stride + x,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      indices[ii++]=a;indices[ii++]=c;indices[ii++]=b;indices[ii++]=b;indices[ii++]=c;indices[ii++]=d;
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(indices,1));
  paintAttribute(geometry, world);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
export function updateSurface(mesh, world, dirty) {
  if (
    mesh.material &&
    mesh.material.userData.hearthPaint !== Boolean(world.terrain?.paint)
  ) {
    mesh.material.dispose();
    mesh.material = groundMaterial(world.ground, Boolean(world.terrain?.paint));
  }
  const n = world.terrain?.resolution ?? 1,
    stride = n + 1;
  if (mesh.geometry.attributes.position.count !== stride ** 2) {
    mesh.geometry.dispose();
    mesh.geometry = terrainGeometry(world);
    return;
  }
  if (!dirty || dirty.paintOnly || dirty.painted)
    paintAttribute(mesh.geometry, world);
  if (dirty?.paintOnly) return;
  const g = mesh.geometry,
    p = g.attributes.position,
    normal = g.attributes.normal;
  const minX = dirty?.minX ?? 0,
    maxX = dirty?.maxX ?? n,
    minZ = dirty?.minZ ?? 0,
    maxZ = dirty?.maxZ ?? n;
  for (let z = minZ; z <= maxZ; z++)
    for (let x = minX; x <= maxX; x++)
      p.setY(z * stride + x, world.terrain?.heights[z * stride + x] ?? 0);
  if (!dirty) {
    p.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return;
  }
  const x0 = Math.max(0, minX - 1),
    x1 = Math.min(n, maxX + 1),
    z0 = Math.max(0, minZ - 1),
    z1 = Math.min(n, maxZ + 1);
  const sum = new Vector3(),
    ab = new Vector3(),
    ac = new Vector3(),
    v = new Vector3(),
    vb = new Vector3(),
    vc = new Vector3();
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const id = z * stride + x;
      sum.set(0, 0, 0);
      for (let cz = Math.max(0, z - 1); cz <= Math.min(n - 1, z); cz++)
        for (let cx = Math.max(0, x - 1); cx <= Math.min(n - 1, x); cx++) {
          const a = cz * stride + cx,
            b = a + 1,
            c = a + stride,
            d = c + 1;
          for (const ids of [
            [a, c, b],
            [b, c, d],
          ])
            if (ids.includes(id)) {
              v.fromBufferAttribute(p, ids[0]);
              vb.fromBufferAttribute(p, ids[1]);
              vc.fromBufferAttribute(p, ids[2]);
              ab.subVectors(vb, v);
              ac.subVectors(vc, v);
              sum.add(ab.cross(ac));
            }
        }
      sum.normalize();
      normal.setXYZ(id, sum.x, sum.y, sum.z);
    }
  for (const attr of [p, normal]) {
    let start = (z0 * stride + x0) * 3,
      end = (z1 * stride + x1 + 1) * 3;
    for (const r of attr.updateRanges) {
      start = Math.min(start, r.start);
      end = Math.max(end, r.start + r.count);
    }
    attr.clearUpdateRanges();
    attr.addUpdateRange(start, end - start);
    attr.needsUpdate = true;
  }
  g.boundingBox = new Box3(
    new Vector3(-world.size / 2, -80, -world.size / 2),
    new Vector3(world.size / 2, 80, world.size / 2),
  );
  g.boundingSphere = new Sphere(
    new Vector3(),
    Math.hypot(world.size / 2, 80, world.size / 2),
  );
}
