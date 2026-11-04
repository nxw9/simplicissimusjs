import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {QUALITY_OPTIONS,qualityProfile,qualityPixelRatio} from '../src/core/quality.js';
import {GameMenu} from '../src/render/game-menu.js';
import {WorldView,createEntityObject} from '../src/render/world.js';
import {TerrainLOD,terrainPatch} from '../src/render/terrain-lod.js';
import {terrainGeometry} from '../src/render/surface.js';
import {createTerrain,heightAt} from '../src/core/terrain.js';
import {demoProject} from '../src/core/demo.js';
import {GameState} from '../src/core/game.js';
import {createEntity} from '../src/core/project.js';
import {batchProps,updateBatch,updateBatchLOD} from '../src/render/batches.js';
function view(){const v=Object.assign(Object.create(WorldView.prototype),{scene:new T.Scene(),root:new T.Group(),camera:new T.PerspectiveCamera(),renderer:{shadowMap:{},setPixelRatio(r){this.ratio=r;}},sun:new T.DirectionalLight(),objects:new Map(),mixers:[],playing:true});v.scene.add(v.root,v.sun,v.sun.target);return v;}
test('five presets persist through validation and enforce pixel caps on 1080p and 4K displays',()=>{
 const menu=Object.create(GameMenu.prototype);assert.equal(QUALITY_OPTIONS.length,5);
 for(const [id]of QUALITY_OPTIONS){assert.equal(menu.cleanSettings({quality:id}).quality,id);for(const [w,h]of [[1920,1080],[3840,2160]]){const r=qualityPixelRatio(id,w,h,3);assert.ok(w*h*r*r<=qualityProfile(id).maxPixels+1);}}
 assert.equal(menu.cleanSettings({quality:'unknown'}).quality,undefined);assert.ok(qualityPixelRatio('minimum',1920,1080,2)<qualityPixelRatio('low',1920,1080,2));assert.ok(qualityPixelRatio('low',1920,1080,2)<qualityPixelRatio('fast',1920,1080,2));
});
test('quality changes preserve gameplay, project, colliders and source geometry; repeated quality does no GPU work',async()=>{
 const v=view(),p=demoProject(),game=new GameState(p),save=game.save(),json=JSON.stringify(p);await v.load(p);const ground=v.ground,boxes=v.boxes,object=v.objects.values().next().value;
 v.setQuality('high');let disposed=0;v.sun.shadow.map={dispose(){disposed++;}};const versions=[];v.scene.traverse(o=>{if(o.material&&!Array.isArray(o.material))versions.push([o.material,o.material.version]);});v.setQuality('high');assert.equal(disposed,0);assert.ok(versions.every(([m,n])=>m.version===n));
 for(const [id]of QUALITY_OPTIONS){v.setQuality(id);assert.equal(v.renderer.shadowMap.enabled,qualityProfile(id).shadowSize>0);}assert.equal(disposed,1);assert.equal(v.ground,ground);assert.equal(v.boxes,boxes);assert.equal(v.objects.values().next().value,object);assert.equal(JSON.stringify(p),json);assert.equal(game.save(),save);
});
test('camera movement and animation share one shadow budget; no shadow redraws in minimum',()=>{
 const v=view();v.sun.position.set(-30,70,20);v.setQuality('balanced');let draws=0;v.renderer.shadowMap.needsUpdate=false;
 for(let i=0;i<60;i++){v.camera.position.x=i*.3;v.invalidate(true);v.prepareRender(1/60);if(v.renderer.shadowMap.needsUpdate){draws++;v.renderer.shadowMap.needsUpdate=false;}}
 assert.ok(draws>0&&draws<=6);assert.equal(v.sun.shadow.mapSize.x,1024);v.setQuality('minimum');for(let i=0;i<60;i++){v.invalidate(true);v.prepareRender(1/60);}assert.equal(v.renderer.shadowMap.needsUpdate,false);v.setQuality('high');assert.equal(v.sun.shadow.mapSize.x,2048);assert.equal(v.renderer.shadowMap.needsUpdate,true);
});
test('mixed terrain LOD boundaries are watertight and near triangles match collision heights',()=>{
 const w={size:80,terrain:createTerrain(32)};w.terrain.heights=w.terrain.heights.map((_,i)=>Math.sin(i%33)*3+Math.cos(Math.floor(i/33))*2);const source=terrainGeometry(w);
 const edge=g=>{const a=g.attributes.position,out=[];for(let i=0;i<a.count;i++)if(Math.abs(a.getX(i))<1e-5)out.push([a.getZ(i),a.getY(i)]);return out.sort((a,b)=>a[0]-b[0]);};
 const near=terrainPatch(w,source,0,0,16,32,1),far=terrainPatch(w,source,16,0,32,32,8);assert.deepEqual(edge(near),edge(far));assert.equal(edge(near).length,33);assert.ok(far.index.count<near.index.count/3);
 const mesh=new T.Mesh(near,new T.MeshBasicMaterial()),ray=new T.Raycaster();mesh.updateMatrixWorld(true);for(let x=-39;x<-1;x+=3.7)for(let z=-39;z<39;z+=7.1){ray.set(new T.Vector3(x,20,z),new T.Vector3(0,-1,0));assert.ok(Math.abs(ray.intersectObject(mesh)[0].point.y-heightAt(w,x,z))<1e-5);}
});
test('sculpt and paint refresh all neighboring LOD boundaries',()=>{
 const w={size:160,terrain:createTerrain(128)},source=terrainGeometry(w),m=new T.MeshStandardMaterial(),lod=new TerrainLOD(w,source,m),camera=new T.PerspectiveCamera();camera.position.set(-30,2,-30);lod.update(camera,'minimum');const i=64*129+64;w.terrain.heights[i]=7;w.terrain.paint=Array(129**2).fill(0);w.terrain.paint[i]=3;lod.refresh(w,terrainGeometry(w),m,{minX:63,maxX:65,minZ:63,maxZ:65});lod.update(camera,'minimum');let found=0;for(const c of lod.chunks){const a=c.mesh.geometry.attributes.position,p=c.mesh.geometry.attributes.surfaceWeights;for(let j=0;j<a.count;j++)if(a.getX(j)===0&&a.getZ(j)===0){assert.equal(a.getY(j),7);assert.equal(p.getZ(j),1);found++;}}assert.equal(found,4);assert.equal(source.attributes.position.getY(i),0);lod.dispose();
});
test('tree LOD culling retains full picking geometry and correct bounds after transform edits',()=>{
 const root=new T.Group(),objects=new Map(),entities=[],models=new Map();for(const x of [0,500]){const e=createEntity('prop','tree');e.position=[x,0,0];e.vegetation={species:'oak',seed:1};const o=createEntityObject(e,models);root.add(o);objects.set(e.id,o);entities.push(e);}const state=batchProps(root,objects,entities),camera=new T.PerspectiveCamera();updateBatchLOD(state,camera,'minimum');const ref=state.refs.get(entities[0].id)[0],far=state.refs.get(entities[1].id)[0];assert.equal(state.sources.parent,null);assert.equal(far.batch.visible,false);assert.ok(ref.batch.frustumCulled);assert.ok(ref.batch.geometry.index.count<ref.m.geometry.index.count);assert.equal(ref.m.geometry,ref.batch.lodGeometries[0]);objects.get(entities[0].id).position.x=300;updateBatch(state,entities[0].id);assert.ok(ref.batch.boundingSphere.containsPoint(new T.Vector3(300,3,0)));camera.position.x=300;updateBatchLOD(state,camera,'high');assert.equal(ref.batch.geometry,ref.batch.lodGeometries[0]);
});
test('distant actors reappear after moving into range without changing spawn visibility',()=>{
 const v=view(),actor=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());actor.add(mesh);actor.position.x=400;v.scene.add(actor);v.scene.fog=new T.Fog('#999999',30,140);v.distanceObjects=[{object:actor,meshes:[mesh],radius:1}];v.quality='minimum';v.prepareRender(0,true);assert.equal(mesh.layers.test(v.camera.layers),false);assert.equal(actor.visible,true);actor.position.x=10;v.prepareRender(.25);assert.equal(mesh.layers.test(v.camera.layers),true);assert.equal(actor.visible,true);
});

test('editor overview keeps expanded map boundaries visible and restores gameplay culling',async()=>{
 const v=view(),p=demoProject();p.world.size=800;p.world.terrain=createTerrain(64);v.playing=false;v.orbit={target:new T.Vector3()};await v.load(p);
 v.camera.position.set(1000,1200,1100);v.prepareRender(0,true);assert.ok(v.terrainLOD.chunks.every(c=>c.mesh.visible));assert.ok(v.scene.fog.far>=2400);
 v.playing=true;v.setQuality('balanced',true);assert.ok(v.terrainLOD.chunks.every(c=>!c.mesh.visible));assert.ok(v.scene.fog.far<800);v.terrainLOD.dispose();
});
