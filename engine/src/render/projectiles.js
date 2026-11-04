import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { heightAt } from "../core/terrain.js";
import { actorPresent } from "../core/world-events.js";
const FORWARD = new T.Vector3(0, 0, 1), UP = new T.Vector3(0, 1, 0);
export const MAX_PROJECTILES = 64;
/** Shared geometry, no per-shot lights or shadows. Sweep the whole travelled segment. */
export class Projectiles {
  constructor(view, game) {
    this.view = view; this.game = game; this.active = []; this.templates = new Map(); this.owned = [];
    this.root = new T.Group(); this.root.name = "Projectiles"; view.scene?.add(this.root);
  }
  template(c) {
    const key = JSON.stringify([c.assetId, c.length, c.rotation]);
    if (this.templates.has(key)) return this.templates.get(key);
    const group = new T.Group(), model = this.view.assetModels?.get(c.assetId);
    let content;
    if (model) content = clone(model.scene);
    else {
      content = new T.Group();
      const mat = new T.MeshLambertMaterial({color: "#baad87"});
      const shaft = new T.CylinderGeometry(0.012, 0.012, 0.6, 5), tip = new T.ConeGeometry(0.045, 0.15, 5);
      const a = new T.Mesh(shaft, mat), b = new T.Mesh(tip, mat);
      a.rotation.x = b.rotation.x = Math.PI / 2; b.position.z = 0.37;
      content.add(a, b); this.owned.push(mat, shaft, tip);
    }
    content.rotation.set(...c.rotation); content.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(content), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
    const scale = c.length / Math.max(size.x, size.y, size.z, 1e-6);
    const fit = new T.Group(); fit.scale.setScalar(scale); fit.add(content); content.position.sub(center); group.add(fit);
    group.traverse(o => {if (o.isMesh) {o.castShadow = false; o.receiveShadow = false;}});
    this.templates.set(key, group); return group;
  }
  fire(u, target) {
    const c = u.config.ranged;
    if (!c || this.active.length >= MAX_PROJECTILES || !this.game.alive) return false;
    const yaw = new T.Quaternion().setFromAxisAngle(UP, u.object.rotation.y);
    const position = u.object.position.clone();
    position.y = heightAt(this.game.project.world, position.x, position.z);
    position.add(new T.Vector3(...c.muzzle).applyQuaternion(yaw));
    const aim = target.clone().sub(position), travel = aim.length() / c.speed;
    if (travel < 0.005 || aim.length() > c.range + 2) return false;
    const velocity = aim.divideScalar(travel); velocity.y += 0.5 * c.gravity * travel;
    const object = clone(this.template(c)); object.position.copy(position);
    object.quaternion.setFromUnitVectors(FORWARD, velocity.clone().normalize()); this.root.add(object);
    this.active.push({object, velocity, owner: u.e.id, damage: u.config.damage, c, age: 0, ttl: Math.max(travel + 0.25, c.range / c.speed + 0.25)});
    this.view.invalidate?.(); return true;
  }
  update(dt, player, units) {
    let playerHit = false, changed = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!this.game.alive || !actorPresent(this.game.project.entities.find(e => e.id === p.owner), this.game)) {this.remove(i); continue;}
      const steps = Math.max(1, Math.ceil(dt / 0.04)), step = dt / steps;
      let spent = false;
      for (let j = 0; j < steps && !spent; j++) {
        const start = p.object.position.clone(), end = start.clone().addScaledVector(p.velocity, step);
        end.y -= 0.5 * p.c.gravity * step * step; p.velocity.y -= p.c.gravity * step;
        const delta = end.clone().sub(start), length = delta.length(); if (length < 1e-8) continue;
        const ray = new T.Ray(start, delta.divideScalar(length)), point = new T.Vector3();
        let nearest = length + 1e-6, victim = null, impact = false;
        const hitBox = (box, who) => {
          const expanded = box.clone().expandByScalar(p.c.radius);
          const distance = expanded.containsPoint(start) ? 0 : ray.intersectBox(expanded, point) ? point.distanceTo(start) : Infinity;
          if (distance < nearest) {nearest = distance; victim = who; impact = true;}
        };
        const boxes = this.view.collisionIndex?.query(Math.min(start.x, end.x) - p.c.radius, Math.min(start.z, end.z) - p.c.radius,
          Math.max(start.x, end.x) + p.c.radius, Math.max(start.z, end.z) + p.c.radius) ?? this.view.boxes ?? [];
        for (const b of boxes) if (!b.disabled && b.entityId !== p.owner) hitBox(b, null);
        const terrain = this.view.terrainHit?.(ray, length);
        if (terrain && terrain.distance < nearest) {nearest = terrain.distance; victim = null; impact = true;}
        if (start.y < heightAt(this.game.project.world, start.x, start.z)) {nearest = 0; victim = null; impact = true;}
        hitBox(new T.Box3(new T.Vector3(player.x - 0.32, player.y - 1.7, player.z - 0.32), new T.Vector3(player.x + 0.32, player.y + 0.12, player.z + 0.32)), "$player");
        for (const u of units) {
          if (u.e.id === p.owner || this.game.collected(u.e.id) || !actorPresent(u.e, this.game)) continue;
          if (u.object.position.distanceTo(start) > length + (u.hitSize?.length() ?? 3) + 2) continue;
          const size = u.hitSize ?? new T.Vector3(0.7, 1.8, 0.7), pos = u.object.position;
          const ground = heightAt(this.game.project.world, pos.x, pos.z);
          hitBox(new T.Box3(new T.Vector3(pos.x - size.x / 2, ground, pos.z - size.z / 2), new T.Vector3(pos.x + size.x / 2, ground + size.y, pos.z + size.z / 2)), u.e.id);
        }
        if (impact) {
          if (victim === "$player") {this.game.damage(p.damage); playerHit = true;}
          else if (victim) {this.game.hit(victim, p.damage, p.owner); changed = true;}
          spent = true;
        } else p.object.position.copy(end);
      }
      p.age += dt;
      if (spent || p.age >= p.ttl) this.remove(i);
      else p.object.quaternion.setFromUnitVectors(FORWARD, p.velocity.clone().normalize());
    }
    if (changed) this.onChange?.();
    if (this.active.length || playerHit || changed) this.view.invalidate?.();
    return playerHit;
  }
  remove(i) {this.active[i].object.removeFromParent(); this.active.splice(i, 1); this.view.invalidate?.();}
  reset() {while (this.active.length) this.remove(this.active.length - 1);}
  dispose() {this.reset(); this.root.removeFromParent(); for (const r of this.owned) r.dispose(); this.templates.clear();}
}
