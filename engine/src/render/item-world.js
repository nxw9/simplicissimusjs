import { eventEntityPresent } from "../core/moon-land.js";
import { Box3, Vector3 } from "three";
import { heightAt } from "../core/terrain.js";
export function syncItems(view, project, state) {
  for (const e of project.entities)
    if (e.kind === "item") {
      const o = view.objects.get(e.id);
      if (!o) continue;
      const position = state.droppedItems?.[e.id] ?? e.position,
        visible = (state.showOwned || eventEntityPresent(e, project.world, state)) && !state.inventory.includes(e.id) && (state.showOwned || (!e.itemOwner && !e.startInInventory) || Boolean(state.droppedItems?.[e.id]));
      const changed =
        o.visible !== visible ||
        o.position.toArray().some((v, i) => v !== position[i]);
      o.visible = visible;
      o.position.set(...position);
      o.updateMatrixWorld(true);
      if (changed) {
        view.refreshColliders?.(e.id);
        if (!visible)
          for (const b of view.colliderGroups?.get(e.id) ??
            view.boxes?.filter((b) => b.entityId === e.id) ??
            []) {
            b.makeEmpty();
            view.collisionIndex?.update(b);
          }
      }
    }
}
export function dropPosition(session, id) {
  const object = session.view.objects.get(id);
  if (!object) return null;
  object.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(object);
  if (bounds.isEmpty()) return null;
  const offset = bounds.clone().translate(object.position.clone().negate());
  const world = session.project.world,
    camera = session.view.camera.position;
  for (const radius of [1.3, 2, 0.7])
    for (const angle of [0, Math.PI / 3, -Math.PI / 3, Math.PI]) {
      const x = camera.x - Math.sin(session.yaw + angle) * radius,
        z = camera.z - Math.cos(session.yaw + angle) * radius;
      const position = [x, heightAt(world, x, z) - offset.min.y + 0.03, z],
        candidate = offset.clone().translate(new Vector3(...position));
      if (
        candidate.min.x < -world.size / 2 ||
        candidate.max.x > world.size / 2 ||
        candidate.min.z < -world.size / 2 ||
        candidate.max.z > world.size / 2
      )
        continue;
      // Keep every corner above the heightfield on a slope.
      let lift = 0;
      for (const px of [candidate.min.x, candidate.max.x])
        for (const pz of [candidate.min.z, candidate.max.z])
          lift = Math.max(
            lift,
            heightAt(world, px, pz) + 0.03 - candidate.min.y,
          );
      candidate.translate(new Vector3(0, lift, 0));
      position[1] += lift;
      const colliders =
        session.view.collisionIndex?.query(
          candidate.min.x,
          candidate.min.z,
          candidate.max.x,
          candidate.max.z,
        ) ??
        session.view.boxes ??
        [];
      if (
        colliders.some((b) => b.entityId !== id && candidate.intersectsBox(b))
      )
        continue;
      // Keep dropped solid geometry outside the player's capsule bounds.
      if (
        candidate.max.y > camera.y - 1.7 &&
        candidate.min.y < camera.y &&
        candidate.max.x > camera.x - 0.33 &&
        candidate.min.x < camera.x + 0.33 &&
        candidate.max.z > camera.z - 0.33 &&
        candidate.min.z < camera.z + 0.33
      )
        continue;
      return position;
    }
  return null;
}
