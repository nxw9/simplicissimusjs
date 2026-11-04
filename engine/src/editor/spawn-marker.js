import * as T from "three";
import { heightAt } from "../core/terrain.js";
export function spawnMarker(color) {
  const group = new T.Group(),
    material = new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
  const add = (geometry, y) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.renderOrder = 30;
    group.add(mesh);
    return mesh;
  };
  add(new T.CylinderGeometry(0.22, 0.28, 1.05, 8), 0.78);
  add(new T.SphereGeometry(0.21, 10, 8), 1.52);
  const ring = add(new T.RingGeometry(0.48, 0.57, 32), 0.04);
  ring.rotation.x = -Math.PI / 2;
  const arrow = new T.ArrowHelper(
    new T.Vector3(0, 0, -1),
    new T.Vector3(0, 0.08, 0),
    1.4,
    color,
    0.35,
    0.25,
  );
  group.add(arrow);
  group.userData.material = material;
  return group;
}
export function validSpawn(view, world, hit) {
  if (
    !hit ||
    Math.abs(hit.x) > world.size / 2 - 0.4 ||
    Math.abs(hit.z) > world.size / 2 - 0.4
  )
    return false;
  const feet = heightAt(world, hit.x, hit.z);
  return !(view.boxes ?? []).some(
    (b) =>
      b.max.y > feet + 0.05 &&
      b.min.y < feet + 1.7 &&
      hit.x > b.min.x - 0.32 &&
      hit.x < b.max.x + 0.32 &&
      hit.z > b.min.z - 0.32 &&
      hit.z < b.max.z + 0.32,
  );
}
