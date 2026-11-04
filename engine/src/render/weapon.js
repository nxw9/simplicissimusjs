import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
export const SWING_DURATION = 0.56;
export const IMPACT_TIME = 0.22;
// Camera-local poses: right shoulder → centre/forward → down-left → guard.
const SWING_KEYS = [
  [0, [0.27, -0.3, -0.78], [-0.3, 0, 0.2]],
  [0.13, [0.38, -0.22, -0.7], [0, 0, -0.28]],
  [IMPACT_TIME, [0.08, -0.3, -0.9], [-1.2, 0, 0.12]],
  [0.34, [-0.25, -0.38, -0.8], [-1.5, 0, 0.45]],
  [SWING_DURATION, [0.27, -0.3, -0.78], [-0.3, 0, 0.2]],
].map(([time, position, rotation]) => ({
  time,
  position: new T.Vector3(...position),
  quaternion: new T.Quaternion().setFromEuler(new T.Euler(...rotation)),
}));
export class WeaponView {
  constructor(config, models) {
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(55, 1, 0.01, 10);
    this.scene.add(new T.HemisphereLight("#ffffff", "#555064", 2.8));
    const light = new T.DirectionalLight("#fff0d0", 3);
    light.position.set(-1, 2, 3);
    this.scene.add(light);
    this.pivot = new T.Group();
    this.scene.add(this.pivot);
    this.owned = [];
    this.elapsed = null;
    this.impacted = false;
    const part = (geometry, color, x, y, z) => {
      const material = new T.MeshStandardMaterial({
        color,
        roughness: 0.45,
        metalness: color === "#bbc6d2" ? 0.75 : 0.1,
      });
      const m = new T.Mesh(geometry, material);
      m.position.set(x, y, z);
      this.pivot.add(m);
      this.owned.push(geometry, material);
      return m;
    };
    if (config.assetId) {
      const source = models.get(config.assetId);
      if (!source) throw Error("Модель меча не найдена");
      const oriented = new T.Group(),
        model = clone(source.scene);
      oriented.add(model);
      // Orient the blade before computing the grip.
      model.rotation.set(
        config.rotation[0],
        config.rotation[1],
        config.rotation[2] + Math.PI,
      );
      oriented.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(oriented),
        size = box.getSize(new T.Vector3());
      const span = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(span) || span < 1e-8)
        throw Error("Модель меча не содержит видимой геометрии");
      const scale = config.length / span;
      oriented.scale.setScalar(scale);
      // Grip is a fraction of model height measured from the bottom after orientation.
      oriented.position.set(
        -(box.min.x + box.max.x) * 0.5 * scale,
        -(box.min.y + size.y * config.grip) * scale,
        -(box.min.z + box.max.z) * 0.5 * scale,
      );
      oriented.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      this.pivot.add(oriented);
    } else {
      part(new T.BoxGeometry(0.055, 0.82, 0.022), "#bbc6d2", 0, 0.51, 0);
      part(new T.BoxGeometry(0.23, 0.035, 0.045), "#ba9452", 0, 0.09, 0);
      part(
        new T.CylinderGeometry(0.028, 0.028, 0.18, 8),
        "#49322b",
        0,
        -0.02,
        0,
      );
      part(new T.SphereGeometry(0.04, 8, 6), "#ba9452", 0, -0.13, 0);
      this.pivot.scale.setScalar(config.length / 1.08);
    }
    part(new T.BoxGeometry(0.095, 0.13, 0.11), "#584836", 0, -0.025, 0.025);
    this.pose(0);
  }
  attack() {
    if (this.elapsed !== null) return false;
    this.elapsed = 0;
    this.impacted = false;
    return true;
  }
  cancel() {
    this.elapsed = null;
    this.impacted = false;
    this.pose(0);
  }
  update(dt) {
    if (this.elapsed === null) return false;
    this.elapsed += dt;
    const impact = !this.impacted && this.elapsed >= IMPACT_TIME;
    if (impact) this.impacted = true;
    const t = Math.min(1, this.elapsed / SWING_DURATION);
    this.pose(t);
    if (t >= 1) this.elapsed = null;
    return impact;
  }
  pose(t) {
    const seconds = T.MathUtils.clamp(t, 0, 1) * SWING_DURATION;
    const index = Math.max(
      1,
      SWING_KEYS.findIndex((key) => key.time >= seconds),
    );
    const a = SWING_KEYS[index - 1],
      b = SWING_KEYS[index];
    const u = T.MathUtils.clamp((seconds - a.time) / (b.time - a.time), 0, 1),
      ease = u * u * (3 - 2 * u);
    this.pivot.position.lerpVectors(a.position, b.position, ease);
    this.pivot.quaternion.slerpQuaternions(a.quaternion, b.quaternion, ease);
  }
  render(renderer, camera) {
    if (this.camera.aspect !== camera.aspect) {
      this.camera.aspect = camera.aspect;
      this.camera.updateProjectionMatrix();
    }
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.clearDepth();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = auto;
    }
  }
  dispose() {
    for (const resource of this.owned) resource.dispose();
    this.scene.clear();
  }
}
