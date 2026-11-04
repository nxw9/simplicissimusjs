import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { humanoid } from "./humanoid.js";
const poses = {
  weapon: [0.48, 0.8, 0.14, 0.85],
  head: [0, 1.65, 0, 0.42],
  body: [0, 1.08, 0, 0.7],
  hands: [0.38, 0.88, 0, 0.28],
  feet: [0, 0.18, 0, 0.45],
};
export function heroDoll(session) {
  const root = humanoid(
      "#53636c",
      Boolean(session.game.state.defaultWeapon && session.project.weapon),
    ),
    owned = new Set();
  root.traverse((o) => {
    if (o.geometry) owned.add(o.geometry);
    if (o.material) owned.add(o.material);
  });
  for (const [slot, id] of Object.entries(session.game.state.equipped)) {
    const e = session.entitiesById.get(id),
      pose = poses[slot];
    if (!e || !pose) continue;
    const source =
      e.shape === "model" && session.view.assetModels.get(e.assetId)?.scene;
    let mesh;
    if (source) {
      mesh = clone(source);
      mesh.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(mesh),
        span = box.getSize(new T.Vector3()).length();
      if (span > 0) {
        mesh.position.sub(box.getCenter(new T.Vector3()));
        const g = new T.Group();
        g.add(mesh);
        g.scale.setScalar((pose[3] / span) * 1.4);
        mesh = g;
      }
    } else {
      const geometry =
        slot === "weapon"
          ? new T.BoxGeometry(0.055, 0.85, 0.04)
          : new T.BoxGeometry(pose[3], pose[3], pose[3] * 0.65);
      const material = new T.MeshStandardMaterial({
        color: e.color,
        metalness: 0.5,
        roughness: 0.4,
      });
      owned.add(geometry);
      owned.add(material);
      mesh = new T.Mesh(geometry, material);
    }
    mesh.position.set(pose[0], pose[1], pose[2]);
    root.add(mesh);
  }
  return { object: root, dispose: () => owned.forEach((x) => x.dispose()) };
}
