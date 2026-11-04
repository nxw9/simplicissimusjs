import * as T from "three";
export function humanoid(color, armed = true, attackHand = "right") {
  const root = new T.Group(),
    armor = new T.MeshStandardMaterial({ color, roughness: 0.8 }),
    dark = new T.MeshStandardMaterial({ color: "#354049" }),
    skin = new T.MeshStandardMaterial({ color: "#d7b592" });
  const box = (parent, w, h, d, x, y, z, material) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  box(root, 0.52, 0.62, 0.3, 0, 1.08, 0, armor);
  box(root, 0.34, 0.34, 0.34, 0, 1.61, 0, skin);
  box(root, 0.36, 0.13, 0.37, 0, 1.78, 0, dark);
  box(root, 0.24, 0.055, 0.025, 0, 1.65, 0.18, dark);
  const limb = (x, y, len, width, material) => {
    const joint = new T.Group();
    joint.position.set(x, y, 0);
    root.add(joint);
    box(joint, width, len, width, 0, -len / 2, 0, material);
    return joint;
  };
  const leftLeg = limb(-0.15, 0.78, 0.72, 0.2, dark),
    rightLeg = limb(0.15, 0.78, 0.72, 0.2, dark),
    leftArm = limb(-0.38, 1.35, 0.58, 0.18, armor),
    rightArm = limb(0.38, 1.35, 0.58, 0.18, armor);
  leftArm.name = "ArmL";
  rightArm.name = "ArmR";
  if (armed)
    box(
      rightArm,
      0.06,
      0.7,
      0.06,
      0,
      -0.53,
      0.27,
      new T.MeshStandardMaterial({
        color: "#c0c8cd",
        metalness: 0.7,
        roughness: 0.4,
      }),
    ).userData.builtinWeapon = true;
  const pose = (state, time, progress = 0, hand = attackHand) => {
    const walk = state === "walk" ? Math.sin(time * 8) * 0.6 : 0;
    leftLeg.rotation.x = walk;
    rightLeg.rotation.x = -walk;
    leftArm.rotation.set(-walk * 0.7, 0, 0);
    rightArm.rotation.set(walk * 0.7, 0, 0);
    if (state === "talk") {
      rightArm.rotation.x = -0.7 + Math.sin(time * 3) * 0.2;
      rightArm.rotation.z = -0.25;
      leftArm.rotation.x = -0.2 + Math.sin(time * 2) * 0.1;
    }
    if (state === "attack") {
      const keys = [
        [0, 0],
        [0.25, -2.6],
        [0.45, -1.25],
        [0.65, -0.35],
        [1, 0],
      ];
      const index = Math.max(
        1,
        keys.findIndex((k) => k[0] >= Math.min(1, progress)),
      );
      const [ta, ra] = keys[index - 1],
        [tb, rb] = keys[index],
        u = Math.max(0, Math.min(1, (progress - ta) / (tb - ta)));
      const arm = hand === "left" ? leftArm : rightArm;
      arm.rotation.x = ra + (rb - ra) * u * u * (3 - 2 * u);
      arm.rotation.z = (hand === "left" ? 0.18 : -0.18) * Math.sin(Math.PI * progress);
    }
  };
  root.userData.pose = pose;
  return root;
}
