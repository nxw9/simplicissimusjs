import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { JSDOM } from 'jsdom';
import { demoProject } from '../src/core/demo.js';
import { readProject,serializeProject,createEntity } from '../src/core/project.js';
import { createTerrain,heightAt } from '../src/core/terrain.js';
import { SPECIES,LANDSCAPE_DEFAULTS } from '../src/core/landscape.js';
import { vegetationObject } from '../src/render/nature.js';
import { createEntityObject,WorldView } from '../src/render/world.js';
import { groundcover,coverDistance } from '../src/render/groundcover.js';
import { batchProps,updateBatch } from '../src/render/batches.js';
import { landscapeEditor,vegetationFields } from '../src/editor/landscape-editor.js';

test('v19 migrates without moving objects; v20 accepts submerged borders and rejects invalid landscape settings',()=>{
  const old=demoProject();old.schemaVersion=19;const before=structuredClone(old),p=readProject(old);
  assert.deepEqual(old,before);assert.deepEqual(p.entities,before.entities);
  p.world.terrain=createTerrain(16);p.world.terrain.heights.fill(-9);p.world.landscape={...LANDSCAPE_DEFAULTS};
  assert.deepEqual(readProject(serializeProject(p)),p);
  for(const [key,value] of [['density',-1],['wind',5],['seed',1.5],['haze',NaN]]){
    const q=structuredClone(p);q.world.landscape[key]=value;assert.throws(()=>serializeProject(q));
  }
});
test('six botanical silhouettes retain individual matte leaves and matching animated cutout shadows',()=>{
  const cache=new Map(),heights=[];
  for(const species of Object.keys(SPECIES)){
    const e={id:species,vegetation:{species,seed:2}},a=vegetationObject(e,cache),b=vegetationObject(e,cache);
    assert.equal(a.children[0].geometry,b.children[0].geometry);
    assert.notEqual(a,b);assert.equal(a.children[1].customDepthMaterial,b.children[1].customDepthMaterial);
    assert.equal(a.children[1].material.alphaTest,.5);
    assert.ok(a.children[1].material.isMeshLambertMaterial);
    assert.equal(a.children[1].material.alphaToCoverage,false);
    assert.equal(a.children[1].material.emissive.getHex(),0);
    assert.equal(a.children[1].customDepthMaterial.alphaTest,a.children[1].material.alphaTest);
    const data=a.children[1].material.map.image.data;
    assert.ok(data.some((v,i)=>i%4===3&&v===0));assert.ok(data.some((v,i)=>i%4===3&&v===255));
    const bounds=new T.Box3().setFromObject(a);heights.push(bounds.max.y-bounds.min.y);
    assert.ok(a.children[0].geometry.attributes.position.count>200);
  }
  assert.ok(heights[3]>heights[0]);assert.ok(heights[4]<heights[0]);
});
test('nature instancing retains both species geometry and shader callbacks after material cloning and transform edits',()=>{
  const root=new T.Group(),objects=new Map(),entities=[],models=new Map();
  for(let i=0;i<6;i++){
    const e=createEntity('prop','tree');e.vegetation={species:i<4?'oak':'stonePine',seed:0};e.position=[i*10,0,0];
    const o=createEntityObject(e,models);root.add(o);objects.set(e.id,o);entities.push(e);
  }
  const state=batchProps(root,objects,entities);
  assert.equal(state.batches.length,4);
  const leaves=state.batches.filter(b=>b.material.map);
  assert.ok(leaves.every(b=>b.customDepthMaterial&&b.material.customProgramCacheKey()==='hearth-leaf-diffuse-v2'));
  const e=entities[0],o=objects.get(e.id);o.position.x=42;updateBatch(state,e.id);
  const ref=state.refs.get(e.id)[0],m=new T.Matrix4();ref.batch.getMatrixAt(ref.index,m);assert.equal(m.elements[12],42);
});
test('all tree variants use small separate leaves, varied atlas tiles and bounded geometry at three LODs',()=>{
  const cache=new Map();
  for(const species of Object.keys(SPECIES))for(let seed=0;seed<4;seed++) {
    const tree=vegetationObject({id:`${species}-${seed}`,vegetation:{species,seed}},cache),leaves=tree.children[1];
    const counts=leaves.lodGeometries.map(g=>g.index.count/3);
    assert.ok(counts[0]<=972&&counts[1]<=324&&counts[2]<=98,`${species}: ${counts}`);
    assert.ok(counts[0]>counts[1]&&counts[1]>counts[2]);
    const g=leaves.geometry,pos=g.attributes.position,uv=g.attributes.uv,normal=g.attributes.normal;
    assert.equal(pos.count%4,0);const variants=new Set(),directions=new Set();
    for(let i=0;i<pos.count;i+=4){
      const bounds=new T.Box3();let u=0,v=0;
      for(let j=0;j<4;j++){bounds.expandByPoint(new T.Vector3().fromBufferAttribute(pos,i+j));u+=uv.getX(i+j);v+=uv.getY(i+j);}
      assert.ok(bounds.getSize(new T.Vector3()).length()<(species==='stonePine'?.9:.8),'individual leaf grew into a canopy block');
      variants.add(`${Math.floor(u/2)}:${Math.floor(v/2)}`);
      directions.add([normal.getX(i),normal.getY(i),normal.getZ(i)].map(x=>x.toFixed(1)).join(','));
    }
    assert.equal(variants.size,4);assert.ok(directions.size>20);
    const texture=leaves.material.map.image;
    assert.equal(texture.width,128);assert.equal(texture.height,128);
    assert.deepEqual(leaves.material.map.mipmaps.map(m=>m.width),[128,64,32,16,8,4,2,1]);
    for(const mip of leaves.material.map.mipmaps.slice(1,5))assert.ok(mip.data.some((v,i)=>i%4===3&&v>=128),'distant leaves disappeared from mipmaps');
    for(let tile=0;tile<4;tile++){
      let opaque=0;const mask=[];
      for(let y=0;y<64;y++)for(let x=0;x<64;x++){
        const index=(((tile>>1)*64+y)*128+(tile%2)*64+x)*4;
        mask.push(texture.data[index+3]===255);if(mask.at(-1))opaque++;
        assert.ok(texture.data[index+1]>texture.data[index]&&texture.data[index+1]>texture.data[index+2]);
      }
      assert.ok(opaque>250&&opaque<2600);
      if(species!=='stonePine'){
        let components=0;const visited=new Set();
        for(let i=0;i<4096;i++)if(mask[i]&&!visited.has(i)){
          components++;const stack=[i];visited.add(i);
          while(stack.length){const n=stack.pop(),x=n%64,y=Math.floor(n/64);
            for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy,k=b*64+a;if(a>=0&&a<64&&b>=0&&b<64&&mask[k]&&!visited.has(k)){visited.add(k);stack.push(k);}}
          }
        }
        assert.equal(components,1,'atlas tile must contain one leaf, not a repeated spray');
      }
    }
  }
});
test('groundcover is repeatable, excludes painted roads and standing water, and quality controls cull distance',()=>{
  const p=demoProject();p.entities=[];p.world.size=80;p.world.terrain=createTerrain(32);p.world.landscape={...LANDSCAPE_DEFAULTS,density:1};
  p.world.terrain.heights.fill(2);p.world.terrain.paint=Array(1089).fill(1);
  for(let z=0;z<=32;z++)for(let x=14;x<=18;x++)p.world.terrain.paint[z*33+x]=0;
  const a=groundcover(p),b=groundcover(p);assert.ok(a.children.length>0);
  const color=a.children[0].geometry.attributes.color;
  for(let i=0;i<color.count;i++)assert.ok(color.getY(i)>color.getX(i)*1.8&&color.getY(i)>color.getZ(i)*2);
  assert.deepEqual(a.children.map(m=>[...m.instanceMatrix.array]),b.children.map(m=>[...m.instanceMatrix.array]));
  const mat=new T.Matrix4();for(const m of a.children)for(let i=0;i<m.count;i++){
    m.getMatrixAt(i,mat);assert.ok(Math.abs(mat.elements[12])>3.7);assert.ok(Math.abs(mat.elements[13]-(heightAt(p.world,mat.elements[12],mat.elements[14])-.025))<1e-5);
  }
  const camera=new T.PerspectiveCamera();camera.position.set(1000,0,1000);coverDistance(a,camera,'fast');assert.ok(a.children.every(x=>!x.visible));
  p.rpg={water:{height:4}};assert.equal(groundcover(p).children.length,0);
});
test('sun shadow volume follows the player in western and distant edited terrain',()=>{
  const sun=new T.DirectionalLight(),camera=new T.PerspectiveCamera();sun.position.set(-30,70,20);
  const view=Object.assign(Object.create(WorldView.prototype),{sun,camera,playing:true,invalidate(){}});
  const direction=sun.position.clone().normalize();camera.position.set(-270,12,-20);view.followShadows();
  assert.equal(sun.target.position.x,-270);assert.equal(sun.target.position.z,-20);
  assert.ok(sun.position.clone().sub(sun.target.position).normalize().distanceTo(direction)<1e-6);
});
test('landscape and tree editor forms save portable project settings through commit',async()=>{
  const dom=new JSDOM('<dialog id="modal"></dialog>'),previous=globalThis.document;globalThis.document=dom.window.document;
  try{
    const project=demoProject(),dialog=document.querySelector('dialog');dialog.close=()=>{};
    const element=(tag,text='',className='')=>{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};
    let saved;const commit=async p=>{saved=readProject(p);return true;};
    landscapeEditor({project,element,modal:(_,box)=>dialog.append(box),commit});
    document.querySelector('#landscape-density').value='.8';await document.querySelector('#landscape-save').onclick();assert.equal(saved.world.landscape.density,.8);
    const entity=project.entities.find(e=>e.shape==='tree');vegetationFields({entity,project,box:dialog,element,commit});
    const select=document.querySelector('#tree-species');select.value='chestnut';await select.onchange();assert.equal(saved.entities.find(e=>e.id===entity.id).vegetation.species,'chestnut');
  }finally{globalThis.document=previous;dom.window.close();}
});
