import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Vector3, Box3, Group, Mesh, BoxGeometry, MeshBasicMaterial, Scene, Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { planWall, wallEnd, appendWall, validWallStart, WALL_SEGMENT_LIMIT } from "../src/core/walls.js";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { createTerrain, heightAt } from "../src/core/terrain.js";
import { createEntityObject } from "../src/render/world.js";
import { entityColliders, refreshBounds, ColliderIndex } from "../src/render/colliders.js";
import { batchProps, updateBatch } from "../src/render/batches.js";
import { moveCharacter } from "../src/core/movement.js";
import { decodeGLB } from "../src/core/assets.js";
import { exportGameHTML } from "../src/core/export-html.js";

const world = {size:200,terrain:null}, stone = {model:"stone",width:2,height:4};
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
const asset = {id:"hearth_castle_wall",name:"Castle",data:"data:model/gltf-binary;base64,"+readFileSync(new URL("../src/assets/models/castle-wall.glb",import.meta.url)).toString("base64")};

test("actual castle GLB has unit wall bounds, embedded texture and reusable geometry", async () => {
  const buffer = decodeGLB(asset.data), view = new DataView(buffer);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,view.getUint32(12,true))));
  assert.ok(json.images.every(image=>Number.isInteger(image.bufferView)));
  // Geometry and scene transforms use the real loader; only browser image decoding is stubbed.
  const loader = new GLTFLoader().register(()=>({name:"test-texture",loadTexture:()=>Promise.resolve(new Texture())}));
  const model = await loader.parseAsync(buffer,"");
  const bounds = new Box3().setFromObject(model.scene), size = bounds.getSize(new Vector3());
  close(size.x,1);close(size.y,1);close(size.z,1);close(bounds.min.y,0);
  const meshes = [];model.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  assert.ok(meshes.length>0);assert.ok(meshes.every(m=>m.geometry.attributes.uv && m.material.map));
});

test("sparse straight strokes cover the full line at arbitrary angles, including backwards", () => {
  for (const degrees of [0,17.5,45,90,137,180,271,359]) {
    const angle = degrees*Math.PI/180, end = [38*Math.cos(angle),38*Math.sin(angle)];
    const {segments} = planWall(world,[[0,0],end],{...stone,straight:true});
    assert.ok(segments.length > 1);
    for (const s of segments) {
      close(Math.sin(s.angle-angle),0); close(s.x*Math.sin(angle)-s.z*Math.cos(angle),0);
      close(s.width,2); assert.ok(s.length <= 6.05);
    }
    const last = segments.at(-1); close(Math.hypot(last.x,last.z)+last.length/2,38);
    for (let i=1;i<segments.length;i++) assert.ok(Math.hypot(segments[i].x-segments[i-1].x,segments[i].z-segments[i-1].z) <= (segments[i].length+segments[i-1].length)/2);
  }
});
test("fixed bearing projects the cursor and clips to map bounds without rotating the line", () => {
  const o = {...stone,straight:true,lockAngle:true,angle:37};
  for (const cursor of [[300,600],[-500,-300],[10,6]]) {
    const end = wallEnd(world,[0,0],cursor,o);
    close(end[1]*Math.cos(37*Math.PI/180)-end[0]*Math.sin(37*Math.PI/180),0);
    assert.ok(end.every(n=>Math.abs(n)<=98.95+1e-8));
  }
  assert.equal(validWallStart(world,[99,0],o),false);
});
test("width controls thickness only; click stamps a section and freehand retains corners", () => {
  const narrow = planWall(world,[[0,0]],{...stone,width:1}).segments[0];
  const wide = planWall(world,[[0,0]],{...stone,width:6}).segments[0];
  close(narrow.length,wide.length); close(narrow.height,wide.height); close(wide.width,6);
  const path = [[0,0],[1,.005],[2,-.005],[12,0],[12,12]];
  const plan = planWall(world,path,stone);
  assert.ok(plan.segments.some(s=>Math.abs(s.angle) < .01));
  assert.ok(plan.segments.some(s=>Math.abs(s.angle-Math.PI/2) < .01));
  assert.ok(plan.segments.length < 8, "pointer jitter should not create tiny sections");
});
test("walls sit in the terrain and keep the requested clearance on a slope", () => {
  const w = {size:80,terrain:createTerrain(32)};
  const r = w.terrain.resolution;
  for (let z=0;z<=r;z++) for (let x=0;x<=r;x++) w.terrain.heights[z*(r+1)+x] = x*.25;
  const plan = planWall(w,[[-10,0],[10,0]],stone);
  for (const s of plan.segments) {
    for (const x of [s.x-s.length/2,s.x,s.x+s.length/2]) {
      assert.ok(s.base <= heightAt(w,x,s.z));
      assert.ok(s.base+s.height >= heightAt(w,x,s.z)+stone.height-1e-8);
    }
  }
});
test("stroke budgets and invalid starts never overrun project limits", () => {
  const path = Array.from({length:1000},(_,i)=>[i%2?90:-90, (i%100)-50]);
  const capped = planWall(world,path,stone);
  assert.equal(capped.segments.length,WALL_SEGMENT_LIMIT); assert.equal(capped.limited,true);
  assert.equal(planWall(world,[[0,0],[80,0]],stone,3).segments.length,3);
  assert.equal(planWall(world,[[0,0]],stone,0).segments.length,0);
  assert.equal(planWall(world,[[200,0]],stone).segments.length,0);
});
test("castle asset is portable, inserted once, roundtrips and never mutates the input", () => {
  decodeGLB(asset.data);
  const p = demoProject(), before = serializeProject(p);
  const options = {...stone,model:"castle",asset}, plan = planWall(p.world,[[-8,0],[8,0]],options);
  const next = appendWall(p,plan,options), twice = appendWall(next,plan,options);
  assert.equal(serializeProject(p),before); assert.equal(twice.assets.length,p.assets.length+1);
  assert.deepEqual(readProject(serializeProject(twice)),twice);
  const ids = twice.entities.map(e=>e.id); assert.equal(new Set(ids).size,ids.length);
  assert.ok(twice.entities.slice(p.entities.length).every(e=>e.solid && e.environment && e.collision==="wall" && e.assetId===asset.id));
  const html = exportGameHTML('<script>__HEARTH_PROJECT_JSON__</script>',next);
  assert.ok(html.includes(asset.data));
  const collision = structuredClone(p); collision.assets.push({...asset,data:asset.data+"different"});
  const safe = appendWall(collision,plan,options);
  assert.notEqual(safe.entities.at(-1).assetId,asset.id);
});
test("diagonal collision follows the wall, blocks crossing and refreshes after editing", () => {
  const p = demoProject(), plan = planWall(p.world,[[-8,-8],[8,8]],{...stone,width:1});
  const next = appendWall(p,plan,stone), entities = next.entities.slice(p.entities.length);
  const objects = entities.map(e=>createEntityObject(e,new Map()));
  const boxes = entities.flatMap((e,i)=>entityColliders(e,objects[i]));
  assert.ok(boxes.length > entities.length);
  // A broad AABB would falsely block this point beside the diagonal.
  assert.equal(new ColliderIndex(boxes).query(1.9,-2.1,2.1,-1.9).length,0);
  const moved = moveCharacter(p.world,[2,1.7,-2],-4,4,1,{},boxes);
  assert.ok(moved[0]-moved[2] > .5, "cannot cross the diagonal wall");
  const b = boxes[0], old = b.min.clone(); objects[0].position.x += 5;
  refreshBounds(b); close(b.min.x,old.x+5);
});
test("static model sections share a draw batch and keep independent selection transforms", () => {
  const source = new Group(); source.add(new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial()));
  const models = new Map([[asset.id,{scene:source,animations:[]}]]), p = demoProject();
  const options = {...stone,model:"castle",asset};
  const next = appendWall(p,planWall(p.world,[[1,1],[20,1]],options),options);
  const entities = next.entities.slice(p.entities.length), objects = new Map(), root = new Scene();
  for (const e of entities) {const o=createEntityObject(e,models);objects.set(e.id,o);root.add(o);}
  const state = batchProps(root,objects,entities,p.world);
  assert.equal(state.batches.length,1); assert.equal(state.refs.size,entities.length);
  const o = objects.get(entities[0].id); o.position.z += 5; updateBatch(state,entities[0].id);
  const b = new Box3().setFromObject(o); assert.ok(b.getCenter(new Vector3()).z > 5);
});
