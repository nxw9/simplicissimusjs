import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { findHandSocket } from "../src/render/hand-socket.js";
import { attachHeldWeapon,defaultHeldWeapon } from "../src/render/held-weapon.js";
import { createEntityObject } from "../src/render/world.js";
import { createEntity,readProject } from "../src/core/project.js";
import { demoProject } from "../src/core/demo.js";
import { weaponPreview } from "../src/editor/weapon-preview.js";
const bone=(name,x=0,y=0,z=0)=>{const n=new T.Bone();n.name=name;n.position.set(x,y,z);return n;};
function rig(name="mixamorigRightHand") {
  const scene=new T.Group(),arm=bone("mixamorigRightForeArm",.4,1.3),hand=bone(name,0,.2);
  scene.add(arm);arm.add(hand);
  // Finger-root proportions observed in the supplied Meshy/Mixamo skeleton.
  hand.add(bone("mixamorigRightHandIndex1",.0158,.1061,.0193),bone("mixamorigRightHandMiddle1",.0041,.1033,.0031),bone("mixamorigRightHandRing1",-.0114,.0995,-.0185),bone("mixamorigRightHandPinky1",-.0285,.0968,-.0307));
  const geometry=new T.BoxGeometry(.7,1.8,.3);geometry.translate(0,.9,0);
  const count=geometry.attributes.position.count;
  geometry.setAttribute("skinIndex",new T.Uint16BufferAttribute(new Uint16Array(count*4),4));
  const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute("skinWeight",new T.Float32BufferAttribute(weights,4));
  const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());scene.add(mesh);scene.updateMatrixWorld(true);mesh.bind(new T.Skeleton([arm,hand,...hand.children]));
  return {scene,hand,arm};
}
test("recognizes common rig names and never attaches to fingers or IK controls",()=>{
  for(const name of ["mixamorig:RightHand","mixamorigRightHand","Hand.R","hand_r","R_Hand","RHand","Hand01R","Bip01 R Hand","ValveBiped.Bip01_R_Hand","DEF-hand.R","J_Bip_R_Hand","wrist_R","HandR"]){
    const {scene,hand}=rig(name),bad=bone("ik_hand_r"),finger=bone("RightHandIndex1"),left=bone("LeftHand");scene.children.unshift(bad,finger,left);
    assert.equal(findHandSocket(scene,"right").node,hand,name);assert.equal(findHandSocket(scene,"left").node,left);
  }
});
test("custom-named wrist is inferred from finger hierarchy; exact manual socket wins",()=>{
  const {scene,hand}=rig("Joint_42");assert.equal(findHandSocket(scene,"right").node,hand);
  assert.equal(findHandSocket(scene,"right","mixamorigRightForeArm").method,"manual");
  const missing=findHandSocket(scene,"right","Missing");assert.equal(missing.node,hand);assert.match(missing.warning,/не найден/);
  assert.equal(findHandSocket(new T.Group(),"left").method,"fallback");
});
test("weapon is parented to the cloned skin joint, aligns in the palm and follows animation",()=>{
  const {scene,hand}=rig(),e=createEntity("enemy","model");e.assetId="actor";e.heldWeapon=defaultHeldWeapon();e.enemy={attack:"Attack"};
  const clip=new T.AnimationClip("Attack",1,[new T.NumberKeyframeTrack("mixamorigRightForeArm.rotation[z]",[0,.5,1],[0,1.2,0])]);
  const models=new Map([["actor",{scene,animations:[clip]}]]),root=createEntityObject(e,models),a=root.userData.heldAttachment;
  const clonedHand=root.getObjectByName(hand.name);assert.notEqual(clonedHand,hand);assert.equal(a.group.parent,clonedHand);assert.equal(a.palmAligned,true);
  const before=a.group.getWorldPosition(new T.Vector3()),local=a.group.position.clone(),q=a.group.quaternion.clone();
  const preview=weaponPreview({objects:new Map([[e.id,root]]),assetModels:models,invalidate(){}},e);preview.seek(.5);
  assert.ok(a.group.getWorldPosition(new T.Vector3()).distanceTo(before)>.15);assert.ok(a.group.position.distanceTo(local)<1e-9);assert.ok(a.group.quaternion.angleTo(q)<1e-6);
  assert.equal(hand.parent.rotation.z,0);preview.dispose();
});
test("manual corrections add to a stable palm frame and remain stable during repeated preview",()=>{
  const {scene}=rig(),e=createEntity("npc","model");e.assetId="actor";e.heldWeapon=defaultHeldWeapon();
  const models=new Map([["actor",{scene,animations:[]}]]),root=createEntityObject(e,models),initial=root.userData.heldAttachment.group.getWorldPosition(new T.Vector3());
  e.heldWeapon.position=[.05,0,0];e.heldWeapon.rotation=[.2,.3,.4];attachHeldWeapon(root,e,models);
  const a=root.userData.heldAttachment,offset=a.group.getWorldPosition(new T.Vector3()).distanceTo(initial);assert.ok(Math.abs(offset-.05)<1e-5);
  const q=a.group.quaternion.clone(),p=a.group.position.clone();attachHeldWeapon(root,e,models);assert.ok(root.userData.heldAttachment.group.quaternion.angleTo(q)<1e-7);assert.ok(root.userData.heldAttachment.group.position.distanceTo(p)<1e-9);
});
test("weapon axis auto-normalizes X and reversed axes without mutating the imported model",()=>{
  const e=createEntity("enemy","humanoid"),weapon=new T.Group();weapon.add(new T.Mesh(new T.BoxGeometry(5,.1,.1),new T.MeshBasicMaterial()));
  e.heldWeapon={...defaultHeldWeapon(),assetId:"blade",length:1.2};
  const models=new Map([["blade",{scene:weapon,animations:[]}]]),root=createEntityObject(e,models),a=root.userData.heldAttachment;
  assert.equal(a.axis,"x");const content=a.group.children[0];a.group.remove(content);const b=new T.Box3().setFromObject(content),s=b.getSize(new T.Vector3());assert.ok(Math.abs(s.y-1.2)<1e-6);assert.ok(s.x<.03);assert.equal(weapon.children[0].rotation.z,0);
});
test("legacy project fitting migrates without silently enabling new orientation",()=>{
  const p=demoProject(),e=p.entities.find(x=>x.kind==="enemy");e.heldWeapon={...defaultHeldWeapon(),position:[.1,.2,.3]};delete e.heldWeapon.autoFit;delete e.heldWeapon.axis;p.schemaVersion=23;
  const parsed=readProject(p).entities.find(x=>x.id===e.id).heldWeapon;assert.equal(parsed.autoFit,false);assert.equal(parsed.axis,"y");assert.deepEqual(parsed.position,[.1,.2,.3]);
});
test("binary GLB round trip preserves skin-joint attachment and imported quaternion attack tracks",async()=>{
  const previous=globalThis.FileReader;
  globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result="data:application/octet-stream;base64,"+Buffer.from(result).toString("base64");this.onloadend?.();});}};
  try {
    const {scene,arm}=rig("mixamorig:RightHand");arm.name="mixamorig:RightForeArm";
    const values=[0,1.1,0].flatMap(v=>new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),v).toArray());
    const clip=new T.AnimationClip("Attack",1,[new T.QuaternionKeyframeTrack(arm.uuid+".quaternion",[0,.5,1],values)]);
    const glb=await new GLTFExporter().parseAsync(scene,{binary:true,animations:[clip]});
    const parsed=await new GLTFLoader().parseAsync(glb,"");assert.equal(parsed.animations.length,1);
    const e=createEntity("enemy","model");e.assetId="imported";e.enemy={attack:"Attack"};e.heldWeapon=defaultHeldWeapon();
    const models=new Map([["imported",parsed]]),root=createEntityObject(e,models),a=root.userData.heldAttachment;
    assert.equal(a.group.parent.isBone,true);assert.equal(a.socket,"mixamorigRightHand");
    const before=a.group.getWorldPosition(new T.Vector3()),preview=weaponPreview({objects:new Map([[e.id,root]]),assetModels:models,invalidate(){}},e);
    assert.equal(preview.animated,true);preview.seek(.5);assert.ok(a.group.getWorldPosition(new T.Vector3()).distanceTo(before)>.1);preview.dispose();
  }finally{globalThis.FileReader=previous;}
});
