import * as T from "three";
import { conditionMet, conditionLabel } from "../core/mechanisms.js";
export function motionUnit(object, e) {
  const position = new T.Vector3(...e.position),
    rotation = new T.Quaternion().setFromEuler(new T.Euler(...e.rotation)),
    scale = new T.Vector3(...e.scale);
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(object),
    pivot = new T.Vector3();
  if (e.motion.pivot !== "origin") {
    bounds.getCenter(pivot);
    pivot.x = e.motion.pivot === "left" ? bounds.min.x : bounds.max.x;
  }
  object.position.copy(position);
  object.quaternion.copy(rotation);
  object.scale.copy(scale);
  object.updateMatrixWorld(true);
  const radius = bounds.getSize(new T.Vector3()).multiply(scale).length();
  return { object, e, position, rotation, scale, pivot, radius, progress: 0 };
}
export function applyMotion(u, t) {
  if (t === 0) {
    u.object.position.copy(u.position);
    u.object.quaternion.copy(u.rotation);
    u.object.updateMatrixWorld(true);
    return;
  }
  const m = u.e.motion,
    q = new T.Quaternion().setFromEuler(
      new T.Euler(...m.rotation.map((a) => a * t)),
    ),
    pivot = u.pivot.clone().multiply(u.scale);
  u.object.quaternion.copy(u.rotation).multiply(q);
  u.object.position
    .copy(u.position)
    .add(new T.Vector3(...m.offset).multiplyScalar(t))
    .add(pivot.clone().applyQuaternion(u.rotation))
    .sub(pivot.applyQuaternion(u.object.quaternion));
  u.object.updateMatrixWorld(true);
}
export class Mechanisms {
  constructor(view, project, game) {
    this.view = view;
    this.project = project;
    this.game = game;
    this.units = project.entities
      .filter((e) => e.motion)
      .map((e) => motionUnit(view.objects.get(e.id), e));
    for (const u of this.units)
      u.colliders = (view.boxes ?? []).filter((b) => b.entityId === u.e.id);
    this.restore();
  }
  interact(id) {
    const u = this.units.find((u) => u.e.id === id);
    if (!u) return null;
    if (!conditionMet(u.e.motion, this.game.state))
      return conditionLabel(u.e.motion, this.project);
    if (u.e.motion.trigger === "auto")
      return "Этот механизм срабатывает автоматически";
    this.game.state.mechanisms[id].open = !this.game.state.mechanisms[id].open;
    return this.game.state.mechanisms[id].open
      ? "Открывается / перемещается"
      : "Возвращается в исходное положение";
  }
  prompt(e) {
    if (!conditionMet(e.motion, this.game.state))
      return conditionLabel(e.motion, this.project);
    if (e.motion.trigger === "auto") return "Автоматический механизм";
    return this.game.state.mechanisms[e.id]?.open
      ? "E · Закрыть / вернуть"
      : "E · Открыть / активировать";
  }
  refresh(u) {
    this.view.refreshColliders?.(u.e.id);
  }
  restore() {
    for (const u of this.units) {
      const record = (this.game.state.mechanisms[u.e.id] ??= {
        open: false,
        progress: 0,
      });
      if (u.e.motion.trigger === "auto")
        record.open = conditionMet(u.e.motion, this.game.state);
      u.progress = record.progress;
      u.audioTarget = record.open ? 1 : 0;
      applyMotion(u, u.progress);
      this.refresh(u);
    }
    this.view.invalidate?.(true);
  }

  update(dt, player) {
    let changed = false;
    for (const u of this.units) {
      const m = u.e.motion;
      const record = this.game.state.mechanisms[u.e.id];
      if (m.trigger === "auto") record.open = conditionMet(m, this.game.state);
      const target = record.open ? 1 : 0;
      if (target !== u.audioTarget) {
        u.audioTarget = target;
        if (target !== u.progress) this.onMotion?.(u.e.id);
      }
      if (target === u.progress) continue;
      let amount = Math.min(Math.abs(target - u.progress), dt / m.duration);
      const distance =
        new T.Vector3(...m.offset).length() +
        u.radius * m.rotation.reduce((s, v) => s + Math.abs(v), 0);
      if (distance > 0) amount = Math.min(amount, (512 * 0.08) / distance);
      const steps = Math.max(1, Math.ceil((amount * distance) / 0.08)),
        delta = (Math.sign(target - u.progress) * amount) / steps;
      for (let i = 0; i < steps; i++) {
        const before = u.progress;
        u.progress = T.MathUtils.clamp(before + delta, 0, 1);
        applyMotion(u, u.progress);
        this.refresh(u);
        const boxes = u.colliders;
        if (
          player &&
          boxes.some(
            (b) =>
              b.max.y > player.y - 1.7 + 0.05 &&
              b.min.y < player.y - 0.05 &&
              player.x > b.min.x - 0.32 &&
              player.x < b.max.x + 0.32 &&
              player.z > b.min.z - 0.32 &&
              player.z < b.max.z + 0.32,
          )
        ) {
          u.progress = before;
          applyMotion(u, before);
          this.refresh(u);
          break;
        }
        changed = true;
      }
      if (Math.abs(u.progress - target) < 1e-7) {
        u.progress = target;
        applyMotion(u, target);
        this.refresh(u);
      }
      record.progress = u.progress;
    }
    if (changed) this.view.invalidate?.(true);
  }
  dispose() {
    for (const u of this.units) {
      applyMotion(u, 0);
      this.refresh(u);
    }
    this.view.invalidate?.(true);
  }
}
