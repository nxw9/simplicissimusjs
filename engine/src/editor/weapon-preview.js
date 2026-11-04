import * as T from "three";
import { attachHeldWeapon } from "../render/held-weapon.js";
import { enemyConfig } from "../core/enemy.js";
import { enemyClip, clipFits } from "../render/enemy-clips.js";

/** Restore the exact editor pose, including bones and pre-existing hidden nodes. */
export function weaponPreview(view, entity) {
  const root = view.objects.get(entity.id), model = root?.userData[entity.kind + "Model"],
    poses = [], pose = root?.userData[entity.kind + "Pose"];
  if (!root) return null;
  root.traverse(n => {if (!n.userData.heldWeaponPart) poses.push([n, n.position.clone(), n.quaternion.clone(), n.scale.clone()]);});
  const cfg = enemyConfig(entity), clip = enemyClip(cfg, "attack", root.userData[entity.kind + "Clips"], view.assetModels);
  const mixer = model && clip && clipFits(clip, model) ? new T.AnimationMixer(model) : null;
  const action = mixer?.clipAction(clip);
  let current = entity, progress = 0, playing = false;
  const duration = cfg.duration;
  const restorePose = () => poses.forEach(([n,p,q,s]) => {n.position.copy(p); n.quaternion.copy(q); n.scale.copy(s);});
  const sample = () => {
    if (action) {action.play(); mixer.setTime(progress * clip.duration);}
    else {restorePose(); pose?.("attack", progress * duration, progress, current.heldWeapon?.hand);}
    root.updateMatrixWorld(true); view.invalidate(true);
  };
  return {
    animated: !!action || !!pose,
    apply(next) {current = next; attachHeldWeapon(root, next, view.assetModels); sample();},
    seek(value) {progress = value; playing = false; sample();},
    play(value = true) {playing = value; sample();},
    update(dt) {if (playing) {progress = (progress + dt / duration) % 1; sample();} return progress;},
    dispose() {
      mixer?.stopAllAction(); if (model) mixer?.uncacheRoot(model);
      restorePose(); attachHeldWeapon(root, entity, view.assetModels); root.updateMatrixWorld(true); view.invalidate(true);
    },
  };
}
