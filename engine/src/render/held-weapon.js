import * as T from "three";
import { findHandSocket, handFrame } from "./hand-socket.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

export const defaultHeldWeapon = () => ({
  assetId: null,
  autoFit: true,
  axis: "auto",
  hand: "right",
  socket: "",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  length: 1,
  grip: 0.18,
  hideNodes: [],
});
export function detachHeldWeapon(root) {
  const attachment = root?.userData.heldAttachment;
  if (!attachment) return;
  attachment.group.removeFromParent();
  for (const [n, visible] of attachment.hidden) n.visible = visible;
  for (const resource of attachment.owned) resource.dispose();
  delete root.userData.heldAttachment;
}
export function attachHeldWeapon(root, entity, models) {
  detachHeldWeapon(root);
  const c = entity.heldWeapon;
  if (!c) return;
  const model =
    root.userData[entity.kind + "Model"] ?? root.children[0] ?? root;
  const nodes = [];
  model.traverse((n) => nodes.push(n));
  const right = c.hand === "right", resolved = findHandSocket(model,c.hand,c.socket);
  const socket = resolved.node, parent = socket ?? root, group = new T.Group(), owned = [], hidden = [];
  group.name = "HearthHeldWeapon";
  parent.updateWorldMatrix(true,false);
  const ps=parent.getWorldScale(new T.Vector3());
  const safeScale=v=>Math.abs(v)<1e-8?1:v;
  const inv=new T.Vector3(1/safeScale(ps.x),1/safeScale(ps.y),1/safeScale(ps.z));
  parent.add(group);
  root.userData.heldBindFrames ??= new WeakMap();
  let frame;
  if(socket && c.autoFit) {
    frame=root.userData.heldBindFrames.get(socket);
    if(!frame){frame=handFrame(socket);root.userData.heldBindFrames.set(socket,frame);}
    group.position.copy(frame.position);group.quaternion.copy(frame.quaternion);
  } else group.position.set(...(socket?[0,/^Arm[RL]$/.test(socket.name)&&!c.socket?-.56:0,.04]:[right ? 0.35 : -0.35,.78,.08]));
  const offset=new T.Vector3(...c.position);
  if(c.autoFit)offset.multiply(inv);
  group.position.add(offset);
  group.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(...c.rotation)));
  const content = new T.Group();
  group.add(content);
  if (c.assetId && models.get(c.assetId))
    content.add(clone(models.get(c.assetId).scene));
  else {
    const steel = new T.MeshStandardMaterial({
      color: "#bbc2c6",
      metalness: 0.8,
      roughness: 0.3,
    });
    const bronze = new T.MeshStandardMaterial({
      color: "#967549",
      metalness: 0.6,
      roughness: 0.5,
    });
    owned.push(steel, bronze);
    for (const [size, pos, mat] of [
      [[0.055, 0.85, 0.03], [0, 0.62, 0], steel],
      [[0.26, 0.045, 0.07], [0, 0.19, 0], bronze],
      [[0.055, 0.2, 0.055], [0, 0.07, 0], bronze],
    ]) {
      const geo = new T.BoxGeometry(...size),
        mesh = new T.Mesh(geo, mat);
      mesh.position.set(...pos);
      content.add(mesh);
      owned.push(geo);
    }
  }
  // Measure in model coordinates before attaching. Keep world weapon length stable on scaled rigs.
  const temp = new T.Group();
  group.remove(content);
  temp.add(content);
  temp.updateMatrixWorld(true);
  let box = new T.Box3().setFromObject(content), size = box.getSize(new T.Vector3());
  let axis=c.axis??"y";
  if(axis==="auto")axis=size.x>size.y&&size.x>size.z?"x":size.z>size.y?"z":"y";
  const direction=new T.Vector3(axis.endsWith("x")?1:0,axis.endsWith("y")?1:0,axis.endsWith("z")?1:0).multiplyScalar(axis.startsWith("-")?-1:1);
  const aligned=new T.Group();for(const child of [...content.children])aligned.add(child);
  aligned.quaternion.setFromUnitVectors(direction,new T.Vector3(0,1,0));content.add(aligned);temp.updateMatrixWorld(true);
  box=new T.Box3().setFromObject(content);size=box.getSize(new T.Vector3());
  const factor = c.length / Math.max(size.x, size.y, size.z, 1e-6);
  content.scale.setScalar(factor);
  content.position.set(
    -(box.min.x + box.max.x) * 0.5 * factor,
    -(box.min.y + size.y * c.grip) * factor,
    -(box.min.z + box.max.z) * 0.5 * factor,
  );
  group.add(content);
  group.scale.copy(inv);
  for (const n of nodes)
    if (n.userData.builtinWeapon || c.hideNodes.includes(n.name)) {
      hidden.push([n, n.visible]);
      n.visible = false;
    }
  group.traverse((n) => {
    n.userData.id = entity.id;
    n.userData.heldWeaponPart = true;
    if (n.isMesh) n.castShadow = true;
  });
  root.userData.heldAttachment = {
    group,
    hidden,
    owned,
    socket: socket?.name ?? "root",
    method: resolved.method, warning: resolved.warning, palmAligned: frame?.aligned??false, axis,
  };
  root.updateMatrixWorld(true);
}
