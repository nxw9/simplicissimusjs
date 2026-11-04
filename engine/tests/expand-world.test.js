import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { expansionPlan, expansionLimit, expandWorld } from "../src/core/expand-world.js";
import { expandWorldEditor } from "../src/editor/expand-world-editor.js";
import { createTerrain, createRegion, heightAt } from "../src/core/terrain.js";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { terrainGeometry } from "../src/render/surface.js";
import { History } from "../src/core/game.js";

function fixture(){const p=demoProject();p.world.size=32;p.world.terrain=createTerrain(32);p.world.terrain.paint=[];for(let z=0;z<=32;z++)for(let x=0;x<=32;x++){const i=z*33+x;p.world.terrain.heights[i]=Math.sin(x/4)*2+z/8;p.world.terrain.paint[i]=(x+z)%5;}p.world.terrain.regions=[createRegion(p.world,[-8,-8],[8,8],"authored")];return p;}
test("expansion copies every height and material and preserves world positions and regions",()=>{
  const p=fixture(),before=structuredClone(p),{project:next,plan}=expandWorld(p,{size:48,height:2});assert.equal(next.world.size,48);assert.equal(plan.addedPerSide,8);assert.equal(next.world.terrain.resolution,48);
  for(let z=0;z<=32;z++)for(let x=0;x<=32;x++){const old=z*33+x,index=(z+8)*49+x+8;assert.equal(next.world.terrain.heights[index],p.world.terrain.heights[old]);assert.equal(next.world.terrain.paint[index],p.world.terrain.paint[old]);}
  for(let i=0;i<100;i++){const x=Math.sin(i*3.21)*15.9,z=Math.cos(i*1.34)*15.9;assert.ok(Math.abs(heightAt(next.world,x,z)-heightAt(p.world,x,z))<1e-8);}
  assert.deepEqual(next.entities,p.entities);assert.deepEqual(next.quests,p.quests);assert.deepEqual(next.world.spawn,p.world.spawn);assert.deepEqual(next.world.terrain.regions[0],p.world.terrain.regions[0]);assert.deepEqual(p,before);
});
test("new land, seafloor and edge continuation have predictable fills with an unchanged seam",()=>{
  const p=fixture();for(const [fill,height] of [["land",7],["water",-9],["edge",0]]) {const next=expandWorld(p,{size:64,fill,height,material:fill==="water"?3:1}).project,t=next.world.terrain;assert.equal(t.heights[0],fill==="edge"?p.world.terrain.heights[0]:height);assert.equal(heightAt(next.world,-16,-16),heightAt(p.world,-16,-16));}
});
test("whole-row rounding, capacity limits and bad inputs are explicit",()=>{
  const world={size:800,terrain:createTerrain(512)};assert.equal(expansionPlan(world,1000).resolution,640);assert.equal(expansionPlan(world,1000).addedPerSide,100);assert.equal(expansionLimit(world),1600);assert.equal(expansionPlan(world,1001).size,1003.125);
  for(const size of [800,0,NaN,Infinity,1601])assert.throws(()=>expansionPlan(world,size));assert.throws(()=>expandWorld(fixture(),{size:48,height:Infinity}));
});
test("flat projects become editable terrain; repeated expansion reuses the full-world region",()=>{
  const p=demoProject(),a=expandWorld(p,{size:p.world.size*1.25,height:0});assert.ok(a.regionId);assert.equal(heightAt(a.project.world,0,0),0);const b=expandWorld(a.project,{size:a.project.world.size*1.25,height:0});assert.equal(b.regionId,a.regionId);assert.equal(b.project.world.terrain.regions.length,1);assert.deepEqual(readProject(serializeProject(b.project)),b.project);
});
test("world expansion is one undo step and does not mutate an existing save's content version",()=>{
  const p=fixture(),history=new History(),next=expandWorld(p,{size:48,height:0}).project;history.push(p);assert.equal(next.contentVersion,p.contentVersion);assert.deepEqual(history.undo(next),p);assert.deepEqual(history.redo(p),next);
});
test("large heightfields use 32-bit indices and match the height sampler",()=>{
  const world={size:800,terrain:createTerrain(640)},g=terrainGeometry(world);assert.equal(g.attributes.position.count,641**2);assert.equal(g.index.array.constructor,Uint32Array);assert.equal(g.index.count,640*640*6);assert.equal(g.index.array.at(-1),641**2-1);assert.equal(g.attributes.position.getX(0),-400);assert.equal(g.attributes.position.getX(641**2-1),400);g.dispose();
});
test("expansion dialog previews dimensions, rejects shrinking and commits only on apply",async()=>{
  const dom=new JSDOM('<dialog id="modal"></dialog>');globalThis.document=dom.window.document;dom.window.HTMLDialogElement.prototype.close=function(){};
  try{const p=fixture(),before=structuredClone(p);let saved,result;expandWorldEditor({project:p,modal:(_,box)=>document.querySelector("#modal").append(box),commit:async n=>{saved=readProject(n);return true;},onExpanded:r=>result=r});const input=document.querySelector("#world-new-size"),button=document.querySelector("#world-expand-apply");
    input.value="16";input.dispatchEvent(new dom.window.Event("input"));assert.equal(button.disabled,true);assert.match(document.querySelector(".wizard-error").textContent,/больше/);
    input.value="48";input.dispatchEvent(new dom.window.Event("input"));assert.equal(button.disabled,false);assert.match(document.querySelector(".world-size-preview").textContent,/48/);assert.deepEqual(p,before);assert.equal(saved,undefined);button.click();await Promise.resolve();await Promise.resolve();assert.equal(saved.world.size,48);assert.ok(result.regionId);
  }finally{dom.window.close();}
});
