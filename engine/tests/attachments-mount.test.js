import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { JSDOM } from "jsdom";
import { createEntity, readProject } from "../src/core/project.js";
import { demoProject } from "../src/core/demo.js";
import { defaultMount, MountSchema, mountEyeOffset } from "../src/core/mount.js";
import { createEntityObject } from "../src/render/world.js";
import { mountVisual, MountAnimation } from "../src/render/mount.js";
import { defaultHeldWeapon, attachHeldWeapon, detachHeldWeapon } from "../src/render/held-weapon.js";
import { weaponPreview } from "../src/editor/weapon-preview.js";
import { heldWeaponEditor } from "../src/editor/world-events-editor.js";
import { mountEditor } from "../src/editor/mount-editor.js";
import { stopEnemyPreview } from "../src/editor/enemy-editor.js";
import { GameState } from "../src/core/game.js";
import { RPGController } from "../src/render/rpg.js";
import { heightAt } from "../src/core/terrain.js";

function fixture() {
  const p = demoProject(), e = createEntity("prop", "model");
  e.id = "mount"; e.assetId = "mount-asset"; e.position = [0,0,0]; e.scale = [1,1,1]; e.solid = false;
  p.entities.push(e); p.assets.push({id: e.assetId, name: "Mount.glb", data: "data:model/gltf-binary;base64,AAAA"});
  p.rpg = {mount: defaultMount(), startingPotions: 2, potionHeal: 30, potionCost: 4, upgradeCosts: [50], services: {rest: "arch", healer: "warden", smith: "warden", horse: "mount"},
    rewards: {}, enemyRewards: {}, requirements: {}, pickups: {}, ship: {entity: "tree-0", quest: "first-fire", from: [10,0,10], to: [15,0,15], duration: 10, deckHeight: 1, halfWidth: 2, halfLength: 3},
    water: {height: -3, color: "#345678", dry: [-100,-100,100,100]}};
  const scene = new T.Group(), body = new T.Mesh(new T.BoxGeometry(2,4,6), new T.MeshStandardMaterial());
  body.name = "Body"; body.position.set(5,3,2); scene.add(body);
  const leg = new T.Group(); leg.name = "Leg"; scene.add(leg);
  const walk = new T.AnimationClip("Walk", 1, [new T.NumberKeyframeTrack("Leg.rotation[x]", [0,0.5,1], [0,1,0])]);
  const models = new Map([[e.assetId, {scene, animations: [walk]}]]);
  p.rpg.mount.walk = "Walk";
  const root = new T.Group(), object = createEntityObject(e, models, [], undefined, p.rpg.mount); root.add(object);
  const view = {objects: new Map([[e.id, object], ["tree-0", new T.Group()]]), assetModels: models, camera: new T.PerspectiveCamera(), orbit: {target: new T.Vector3(), update() {}}, invalidate() {}, refreshColliders() {}, blocked: () => false};
  return {p,e,models,view,root};
}
function env(fn) {
  const dom = new JSDOM('<main></main><dialog id="modal"></dialog>'), old = {document:globalThis.document,window:globalThis.window};
  globalThis.document = dom.window.document; globalThis.window = dom.window;
  dom.window.HTMLDialogElement.prototype.close = function() {this.dispatchEvent(new dom.window.Event("close"));};
  const modal = (_,box) => document.querySelector("#modal").replaceChildren(box);
  return Promise.resolve().then(() => fn({modal, dom})).finally(() => {globalThis.document = old.document; globalThis.window = old.window; dom.window.close();});
}

test("built-in melee uses the chosen arm; fitted weapon follows attack and exact pose is restored", () => {
  const entity = createEntity("enemy", "humanoid"); entity.heldWeapon = {...defaultHeldWeapon(), hand: "left"};
  const root = createEntityObject(entity,new Map()), view = {objects:new Map([[entity.id,root]]),assetModels:new Map(),invalidate(){}};
  const hand = root.getObjectByName("ArmL"), right = root.getObjectByName("ArmR"), original = hand.quaternion.clone();
  root.userData.enemyPose("attack", 0.25, 0.25); assert.ok(hand.rotation.x < -2); assert.equal(right.rotation.x,0);
  root.userData.enemyPose("idle",0);
  const preview = weaponPreview(view,entity), held = root.userData.heldAttachment.group.getWorldPosition(new T.Vector3());
  preview.seek(0.25); assert.ok(root.userData.heldAttachment.group.getWorldPosition(new T.Vector3()).distanceTo(held) > .2);
  preview.apply({...entity,heldWeapon:{...entity.heldWeapon,position:[.1,.2,.3]}});
  preview.dispose(); assert.ok(hand.quaternion.angleTo(original)<1e-6); assert.equal(root.userData.heldAttachment.socket,"ArmL");
});
test("GLB attack preview binds the original skeleton and never disposes shared weapon resources", () => {
  const e = createEntity("enemy","model"); e.assetId = "actor"; e.heldWeapon = {...defaultHeldWeapon(),assetId:"blade"}; e.enemy = {attack:"Slash",animationSources:{attack:"clips"}};
  const scene = new T.Group(), hand = new T.Group(); hand.name="mixamorigRightHand";
  scene.add(new T.Mesh(new T.BoxGeometry(1,2,1),new T.MeshStandardMaterial()), hand);
  const weapon = new T.Group(), geometry = new T.BoxGeometry(.1,5,.1); weapon.add(new T.Mesh(geometry,new T.MeshStandardMaterial()));
  let disposed = 0; geometry.addEventListener("dispose",()=>disposed++);
  const clip = new T.AnimationClip("Slash",1,[new T.NumberKeyframeTrack("mixamorigRightHand.rotation[z]",[0,.5,1],[0,1,0])]);
  const models = new Map([["actor",{scene,animations:[]}],["blade",{scene:weapon,animations:[]}],["clips",{animations:[clip]}]]);
  const root = createEntityObject(e,models), preview = weaponPreview({objects:new Map([[e.id,root]]),assetModels:models,invalidate(){}},e);
  preview.seek(.5); assert.ok(root.getObjectByName(hand.name).rotation.z>.9); assert.equal(hand.rotation.z,0);
  preview.dispose(); assert.ok(Math.abs(root.getObjectByName(hand.name).rotation.z)<1e-6); assert.equal(disposed,0);
});
test("attachment removal preserves nodes that were already invisible", () => {
  const e=createEntity("npc","humanoid"), root=createEntityObject(e,new Map()), arm=root.getObjectByName("ArmL"); arm.visible=false;
  e.heldWeapon={...defaultHeldWeapon(),hideNodes:["ArmL"]}; attachHeldWeapon(root,e,new Map()); detachHeldWeapon(root); assert.equal(arm.visible,false);
});
test("mount normalization preserves source, height, ground pivot and animation under facing wrappers", () => {
  const {models}=fixture(), source=models.get("mount-asset"), c={...defaultMount(),height:3,facing:Math.PI/2};
  const {group,model,clips}=mountVisual(source,c), b=new T.Box3().setFromObject(group);
  assert.ok(Math.abs(b.min.y)<1e-6); assert.ok(Math.abs(b.max.y-3)<1e-6); assert.ok(Math.abs(b.getCenter(new T.Vector3()).x)<1e-6);
  const before = b.getSize(new T.Vector3()); assert.ok(before.x > before.z);
  const animation=new MountAnimation(model,clips,{...c,walk:"Walk"}); animation.update(.5,true);
  assert.ok(model.getObjectByName("Leg").rotation.x>.9); assert.equal(source.scene.getObjectByName("Leg").rotation.x,0);
  animation.update(0,false); assert.ok(Math.abs(model.getObjectByName("Leg").rotation.x)<1e-6); animation.dispose();
  assert.deepEqual(source.scene.getObjectByName("Body").position.toArray(),[5,3,2]);
});
test("mount configuration rejects unusable speeds, size, seat and collider settings and migrates v21", () => {
  const {p}=fixture(); assert.equal(readProject({...p,schemaVersion:21}).schemaVersion,25);
  for (const bad of [{height:0},{seat:[0,-1,0]},{eyeHeight:NaN},{speed:20,sprint:10},{walk:3}]) assert.equal(MountSchema.safeParse({...defaultMount(),...bad}).success,false);
  p.entities.find(e=>e.id==="mount").solid=true; assert.throws(()=>readProject(p),/Маунт/);
});
test("custom seat rotation, ride speed, save/load and dismount use the configured mount", () => env(() => {
  const {p,view}=fixture(); p.rpg.mount.seat=[.3,2,-.4]; p.rpg.mount.speed=9; p.rpg.mount.sprint=16;
  const game=new GameState(p), s={project:p,game,view,ui:document.createElement("div"),host:document.querySelector("main"),yaw:0,motion:{},keys:new Set(),notify(){},sync(){},controlsActive:()=>true};
  view.renderer={domElement:document.createElement("canvas")};
  const r=s.rpg=new RPGController(s); r.interact("mount");
  const off=mountEyeOffset(p.rpg.mount,Math.PI); assert.ok(view.camera.position.distanceTo(new T.Vector3(...off))<1e-6);
  assert.equal(r.beforeMove(.1,true,false),9); assert.equal(r.beforeMove(.1,true,true),16); view.camera.position.x+=4; r.afterMove();
  assert.ok(Math.abs(game.state.rpg.horsePosition[0]-4)<1e-6); assert.equal(view.objects.get("mount").visible,true);
  const old=structuredClone(game.state.rpg.horsePosition); s.yaw=Math.PI/2; r.beforeMove(.1,false,false); r.afterMove();
  assert.ok(new T.Vector3(...old).distanceTo(new T.Vector3(...game.state.rpg.horsePosition))<1e-6);
  game.load(game.save()); r.restore(); assert.ok(Math.abs(view.camera.position.y-heightAt(p.world,4,0)-2.85)<1e-6);
  r.dismount(); assert.equal(game.state.rpg.mounted,false); assert.ok(Math.abs(view.camera.position.y-heightAt(p.world,view.camera.position.x,view.camera.position.z)-1.7)<1e-6); r.dispose();
}));
test("legacy RPG projects retain original ride height, speeds and hidden horse", () => env(() => {
  const {p,view}=fixture(); delete p.rpg.mount;
  const s={project:p,game:new GameState(p),view,ui:document.createElement("div"),host:document.querySelector("main"),yaw:0,keys:new Set(),notify(){},sync(){},controlsActive:()=>true};
  view.renderer={domElement:document.createElement("canvas")}; const r=new RPGController(s); r.interact("mount");
  assert.equal(view.camera.position.y,2.5); assert.equal(r.beforeMove(.1,true,true),12); assert.equal(view.objects.get("mount").visible,false); r.dispose();
}));
test("mount editor previews selected model and seat, cleans temporary visuals, commits configuration", () => env(async ({modal,dom}) => {
  const {p,view,root}=fixture(), before=structuredClone(p); let saved;
  mountEditor({project:p,view,modal,commit:async n=>{saved=readProject(n);stopEnemyPreview(view);return true;}});
  document.querySelector("#mount-preview").click(); assert.equal(root.children.length,2); assert.equal(view.objects.get("mount").visible,false);
  const input=document.querySelector("#mount-seat-1"); input.value="2.3"; input.dispatchEvent(new dom.window.Event("input"));
  assert.equal(root.children.length,2); document.querySelector("#mount-preview-walk").click(); view.editorPreview(.5);
  document.querySelector("#mount-save").click(); await Promise.resolve(); assert.equal(saved.rpg.mount.seat[1],2.3);
  assert.equal(root.children.length,1); assert.equal(view.objects.get("mount").visible,true); assert.deepEqual(p,before);
}));
test("melee form imports in the correct slot and preserves live preview adjustments", () => env(async ({modal,dom}) => {
  const p=demoProject(), e=p.entities.find(e=>e.kind==="enemy"); e.heldWeapon=defaultHeldWeapon();
  const root=createEntityObject(e,new Map()), view={objects:new Map([[e.id,root]]),assetModels:new Map(),invalidate(){},orbit:{target:new T.Vector3(),update(){}},camera:new T.PerspectiveCamera()};
  let saved, imported; heldWeaponEditor({project:p,entity:e,view,modal,commit:async n=>{saved=readProject(n);stopEnemyPreview(view);return true;},importModel:(...a)=>imported=a});
  document.querySelector("#held-preview").click(); view.editorPreview(.2);
  const grip=[...document.querySelectorAll("label")].find(l=>l.textContent.startsWith("Место хвата")).querySelector("input");
  grip.value="0.4"; grip.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  document.querySelector("#held-import").click(); await Promise.resolve(); await Promise.resolve();
  assert.equal(saved.entities.find(x=>x.id===e.id).heldWeapon.grip,.4); assert.deepEqual(imported,[e.id,"held"]); assert.equal(view.editorPreview,null);
}));
test("auto-attach enables a fitted weapon immediately, avoids a duplicate built-in blade and cancels cleanly",()=>env(({modal})=>{
  const p=demoProject(),e=p.entities.find(e=>e.kind==="enemy");delete e.heldWeapon;
  const root=createEntityObject(e,new Map()),view={objects:new Map([[e.id,root]]),assetModels:new Map(),invalidate(){},orbit:{target:new T.Vector3(),update(){}},camera:new T.PerspectiveCamera()};
  let builtin;root.traverse(n=>{if(n.userData.builtinWeapon)builtin=n;});assert.ok(builtin);assert.equal(builtin.visible,true);
  heldWeaponEditor({project:p,entity:e,view,modal,commit:async()=>true});document.querySelector("#held-auto-attach").click();
  assert.equal(root.userData.heldAttachment.socket,"ArmR");assert.equal(builtin.visible,false);assert.match(document.querySelector("#held-attachment-status").textContent,/ArmR/);assert.equal(e.heldWeapon,undefined);
  stopEnemyPreview(view);assert.equal(builtin.visible,true);assert.equal(root.userData.heldAttachment,undefined);
}));
