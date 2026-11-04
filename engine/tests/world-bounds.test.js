import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { JSDOM } from "jsdom";
import { worldBounds,insideWorld } from "../src/core/world-bounds.js";
import { moveCharacter } from "../src/core/movement.js";
import { moveGrounded } from "../src/core/terrain.js";
import { expandWorld } from "../src/core/expand-world.js";
import { createEntityObject,WorldView } from "../src/render/world.js";
import { entityColliders } from "../src/render/colliders.js";
import { expandWorldEditor } from "../src/editor/expand-world-editor.js";
import { demoProject } from "../src/core/demo.js";
import { readProject,serializeProject } from "../src/core/project.js";
import { GameState } from "../src/core/game.js";
import { BoundaryGuides } from "../src/editor/boundary-guides.js";
import { boundaryEditor } from "../src/editor/boundary-editor.js";
const fixture=()=>{const p=demoProject();p.world.spawn=[0,1.7,0];p.world.playBounds={min:[-10,-12],max:[14,16]};return p;};
test("one explicit boundary is enforced for character, grounded enemy and radius near all four edges",()=>{
  const w=fixture().world;
  for(const [dx,dz]of [[50,0],[-50,0],[0,50],[0,-50],[50,50]])for(const move of [p=>moveGrounded(w,p,dx,dz),p=>moveCharacter(w,p,dx,dz,1,{},[],true)]){
    const p=move([0,1.7,0]);assert.ok(insideWorld(w,p[0],p[2]));assert.ok(Math.abs(p[0])+Math.abs(p[2])>8);
  }
  assert.equal(insideWorld(w,-9.7,0),false);assert.equal(insideWorld(w,-9.5,0),true);
});
test("invalid, inverted, out-of-map or start-blocking boundaries are rejected atomically",()=>{
  for(const b of [{min:[3,4],max:[2,9]},{min:[-1,-1],max:[.2,.2]},{min:[-900,-8],max:[8,8]},{min:[1,1],max:[8,8]},{min:[NaN,-4],max:[4,4]}]){
    const p=fixture();p.world.playBounds=b;assert.throws(()=>readProject(p));
  }
  const p=fixture();assert.deepEqual(readProject(serializeProject(p)),readProject(p));
});
test("expansion never creates or shifts playable bounds, including repeated expansion",()=>{
 const p=demoProject(),a=expandWorld(p,{size:100}).project,b=expandWorld(a,{size:120}).project;
 for(const map of [p,a,b]){assert.equal(worldBounds(map.world),null);assert.ok(insideWorld(map.world,80,80));}
 const custom=fixture(),next=expandWorld(custom,{size:100}).project;assert.deepEqual(next.world.playBounds,custom.world.playBounds);
});
test("old saves outside changed custom limits return to valid start without losing progress",()=>{
  const p=fixture();delete p.world.playBounds;const game=new GameState(p);game.state.position=[20,1.7,20];game.state.gold=87;
  const next=new GameState(fixture());next.load(game.save());assert.deepEqual(next.state.position,[0,1.7,0]);assert.equal(next.state.gold,87);
});
test("debug bounds and colliders have no collision/raycast and are invisible during play",()=>{
  const view={project:fixture(),scene:new T.Scene(),boxes:[new T.Box3(new T.Vector3(-1,0,-1),new T.Vector3(1,3,1))],invalidate(){}};
  const g=new BoundaryGuides(view);g.set({bounds:true,collisions:true});g.updateVisibility(true);assert.equal(g.group.visible,true);assert.equal(g.obstacles.geometry.attributes.position.count,24);assert.ok(g.bounds.geometry.attributes.position.count>24);
  const hits=[];g.bounds.raycast(null,hits);assert.equal(hits.length,0);g.updateVisibility(false);assert.equal(g.group.visible,false);g.dispose();assert.equal(view.scene.children.length,0);
});
test("boundary form previews custom limits, refuses a blocked start and explicitly removes the wall",async()=>{
  const dom=new JSDOM('<dialog id="modal"></dialog>');globalThis.document=dom.window.document;dom.window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new dom.window.Event("close"));};
  try {
    const p=fixture(),view={project:p,scene:new T.Scene(),boxes:[],invalidate(){}};view.editorGuides=new BoundaryGuides(view);let saved;
    boundaryEditor({project:p,view,modal:(_,box)=>document.querySelector("#modal").append(box),commit:async n=>{saved=readProject(n);return true;}});
    const west=document.querySelector("#boundary-min-0"),apply=document.querySelector("#boundary-apply");west.value="1";west.dispatchEvent(new dom.window.Event("input"));assert.equal(apply.disabled,true);assert.match(document.querySelector(".wizard-error").textContent,/старта/);assert.equal(p.world.playBounds.min[0],-10);
    document.querySelector("#boundary-clear").click();assert.equal(apply.disabled,false);apply.click();await Promise.resolve();assert.equal(saved.world.playBounds,null);assert.equal(view.editorGuides.previewWorld,null);view.editorGuides.dispose();
  }finally{dom.window.close();}
});
test("starter-map expansion dialog allows crossing old and new terrain edges in all four directions",async()=>{
  const dom=new JSDOM('<dialog id="modal"></dialog>');globalThis.document=dom.window.document;dom.window.HTMLDialogElement.prototype.close=function(){};
  try {
    const p=demoProject();let expanded;
    expandWorldEditor({project:p,modal:(_,box)=>document.querySelector("#modal").append(box),commit:async n=>{expanded=readProject(n);return true;}});
    assert.equal(document.querySelector("#world-new-size").value,"100");assert.equal(document.querySelector("#world-expand-bounds"),null);
    document.querySelector("#world-expand-apply").click();await Promise.resolve();await Promise.resolve();assert.equal(expanded.world.size,100);assert.equal(expanded.world.playBounds,undefined);
    const boxes=expanded.entities.flatMap(e=>entityColliders(e,createEntityObject(e,new Map()))),view=Object.create(WorldView.prototype);view.project=expanded;view.boxes=boxes;
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
      let pos=[38*dx,1.7,38*dz],motion={};
      for(let i=0;i<240;i++)pos=moveCharacter(expanded.world,pos,dx*.1,dz*.1,1/60,motion,boxes);
      assert.ok(pos[0]*dx+pos[2]*dz>61,`blocked at ${pos}`);assert.equal(view.blocked(pos[0],pos[2]),false);
      const npc=moveGrounded(expanded.world,[38*dx,1.7,38*dz],24*dx,24*dz,(x,z,y)=>view.blocked(x,z,y));assert.ok(npc[0]*dx+npc[2]*dz>61);
    }
  }finally{dom.window.close();}
});
test("unbounded saves beyond terrain retain the player, dropped loot and defeated actors",()=>{
  const p=expandWorld(demoProject(),{size:100}).project,g=new GameState(p);g.collect("shard");assert.equal(g.drop("shard",[60,0,0]),true);g.hit("sentinel",10000);g.state.corpses.sentinel={position:[62,0,0],rotation:[0,0,0]};g.state.position=[65,1.7,0];
  const loaded=new GameState(p);loaded.load(g.save());assert.deepEqual(loaded.state.position,g.state.position);assert.deepEqual(loaded.state.droppedItems,g.state.droppedItems);assert.deepEqual(loaded.state.corpses,g.state.corpses);
});
test("boundary UI creates the only blocking wall; clearing removes collision and its guide",async()=>{
  const dom=new JSDOM('<dialog id="modal"></dialog>');globalThis.document=dom.window.document;dom.window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new dom.window.Event("close"));};
  try {
    const p=expandWorld(demoProject(),{size:100}).project,view={project:p,scene:new T.Scene(),boxes:[],invalidate(){}};view.editorGuides=new BoundaryGuides(view);let saved;
    boundaryEditor({project:p,view,modal:(_,box)=>document.querySelector("#modal").replaceChildren(box),commit:async n=>{saved=readProject(n);return true;}});
    assert.equal(document.querySelector("#boundary-mode").value,"none");view.editorGuides.updateVisibility(true);assert.equal(view.editorGuides.bounds.visible,false);
    document.querySelector("#boundary-reset").click();document.querySelector("#boundary-apply").click();await Promise.resolve();assert.deepEqual(saved.world.playBounds,{min:[-50,-50],max:[50,50]});
    assert.ok(moveCharacter(saved.world,[48,1.7,0],4,0,1,{},[])[0]<50);
    const bigger=expandWorld(saved,{size:120}).project;assert.deepEqual(bigger.world.playBounds,saved.world.playBounds);
    view.project=bigger;document.querySelector("#modal").replaceChildren();boundaryEditor({project:bigger,view,modal:(_,box)=>document.querySelector("#modal").append(box),commit:async n=>{saved=readProject(n);return true;}});
    document.querySelector("#boundary-clear").click();view.editorGuides.updateVisibility(true);assert.equal(view.editorGuides.bounds.visible,false);
    document.querySelector("#boundary-apply").click();await Promise.resolve();assert.equal(saved.world.playBounds,null);assert.ok(moveCharacter(saved.world,[48,1.7,0],20,0,1,{},[])[0]>67);view.editorGuides.dispose();
  }finally{dom.window.close();}
});
