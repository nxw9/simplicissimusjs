import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { clipFits } from "./enemy-clips.js";

/** Normalize on wrappers so animation tracks cannot overwrite size or facing. */
export function mountVisual(gltf, config) {
  const group = new T.Group(), facing = new T.Group(), fit = new T.Group(), model = clone(gltf.scene);
  group.add(facing); facing.add(fit); fit.add(model);
  model.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3());
  if (!Number.isFinite(size.y) || size.y < 1e-6) throw Error("Модель маунта не содержит объёмной геометрии");
  const scale = config.height / size.y;
  fit.scale.setScalar(scale);
  fit.position.set(-(box.min.x + box.max.x) * 0.5 * scale, -box.min.y * scale, -(box.min.z + box.max.z) * 0.5 * scale);
  facing.rotation.y = config.facing;
  return {group, model, clips: gltf.animations};
}

/** One mixer, no allocation or bounds calculation in the animation loop. */
export class MountAnimation {
  constructor(model, clips = [], config) {
    this.model = model;
    this.mixer = model ? new T.AnimationMixer(model) : null;
    this.actions = {};
    for (const key of ["idle", "walk"]) {
      const clip = clips.find(c => c.name === config[key]);
      if (clip && clipFits(clip, model)) this.actions[key] = this.mixer.clipAction(clip);
    }
  }
  update(dt, moving, sprint = false) {
    const next = moving ? this.actions.walk ?? this.actions.idle : this.actions.idle;
    if (next !== this.action) {
      this.action?.stop();
      next?.reset().play();
      this.action = next;
    }
    if (next) {next.timeScale = moving && sprint ? 1.5 : 1; this.mixer.update(dt);}
  }
  dispose() {this.mixer?.stopAllAction(); if (this.model) this.mixer?.uncacheRoot(this.model);}
}
