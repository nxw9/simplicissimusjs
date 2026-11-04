import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { JSDOM } from "jsdom";
import { Selection } from "../src/editor/selection.js";
import { SceneTools } from "../src/editor/tools.js";
import { bulkEditor } from "../src/editor/bulk-editor.js";
import { deleteEntities, transformEntities } from "../src/core/bulk-edit.js";
import { demoProject } from "../src/core/demo.js";
import { createEntity, readProject } from "../src/core/project.js";
import { History } from "../src/core/game.js";
import { WorldView, createEntityObject } from "../src/render/world.js";
import { SelectionOutline } from "../src/render/selection-outline.js";
import { batchProps, updateBatches } from "../src/render/batches.js";

function project() {
  const p=demoProject();p.entities=[];p.quests=[];
  for(let i=0;i<3;i++){const e=createEntity("prop","box");Object.assign(e,{id:String.fromCharCode(97+i),position:[i*4-4,.5,0]});p.entities.push(e);}
  return p;
}
function harness() {
  const dom=new JSDOM('<main><canvas></canvas></main><input id="text"><div contenteditable="true" id="editable"></div><dialog id="modal"></dialog>');
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  const canvas=document.querySelector("canvas"), captures=new Set();
  canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
  let p=project(),commits=0;const selection=new Selection(["a","b"]),history=new History(),messages=[];
  const view=Object.assign(Object.create(WorldView.prototype),{scene:new T.Scene(),objects:new Map(),assetModels:new Map(),renderer:{domElement:canvas},camera:new T.PerspectiveCamera(60,4/3,.1,1000),orbit:{enabled:true},project:p,playing:false});
  view.camera.position.set(0,8,16);view.camera.lookAt(0,0,0);view.camera.updateMatrixWorld();
  for(const e of p.entities){const o=createEntityObject(e,new Map());view.objects.set(e.id,o);view.scene.add(o);}
  view.pick=e=>e.entityId;view.groundHit=e=>new T.Vector3(e.wx??0,0,e.wz??0);view.select(selection.ids);
  const choose=(id,opts)=>{selection.choose(id,opts,p.entities.map(e=>e.id));view.select(selection.ids);};
  const commit=async next=>{next=readProject(next);history.push(p);p=next;view.project=p;commits++;selection.retain(p.entities);for(const [id,o] of view.objects)if(!p.entities.some(e=>e.id===id)){o.removeFromParent();view.objects.delete(id);}return true;};
  const tools=new SceneTools(view,{getProject:()=>p,getSelected:()=>selection.primary,getSelection:()=>selection.ids,getRegion:()=>null,setRegion(){},select:choose,selectMany:(ids,add)=>{selection.set(add?[...selection.ids,...ids]:ids);view.select(selection.ids);},selectAll:()=>selection.set(p.entities.map(e=>e.id)),deleteSelection:()=>commit(deleteEntities(p,selection.ids)),commit,notify:m=>messages.push(m),isBusy:()=>false,snap:()=>false,brush:()=>({radius:4,strength:2}),modeChanged(){},gestureChanged(){},transformPreview(){}});
  return {dom,view,tools,selection,history,messages,commit,get p(){return p;},get commits(){return commits;},close(){tools.cancel();tools.gizmo.dispose();dom.window.close();}};
}
const event=(x,z,extra={})=>({wx:x,wz:z,clientX:x*10+400,clientY:z*10+300,button:0,pointerId:1,preventDefault(){},stopImmediatePropagation(){},...extra});

test("selection toggles, ranges over the filtered list, keeps an active object and prunes deletions",()=>{
  const s=new Selection();s.choose("a");s.choose("c",{toggle:true});assert.deepEqual(s.ids,["a","c"]);
  s.choose("b",{range:true},["a","b","c","d"]);assert.deepEqual(s.ids,["c","b"]);assert.equal(s.primary,"b");
  s.choose("d",{toggle:true});s.choose("b",{toggle:true});assert.deepEqual(s.ids,["c","d"]);
  s.retain([{id:"d"}]);assert.deepEqual(s.ids,["d"]);s.choose(null);assert.equal(s.primary,null);
});
test("Delete removes a selection atomically and history restores the entire group",async()=>{
  const h=harness();try{h.tools.key({target:document.body,code:"Delete",preventDefault(){}});await Promise.resolve();assert.deepEqual(h.p.entities.map(e=>e.id),["c"]);assert.equal(h.commits,1);const old=h.history.undo(h.p);assert.deepEqual(old.entities.map(e=>e.id),["a","b","c"]);}finally{h.close();}
});
test("Delete never edits while typing, in dialogs, during play, or while a repeated key is held",()=>{
  const h=harness();try{
    for(const target of [document.querySelector("#text"),document.querySelector("#editable")])h.tools.key({target,code:"Delete",preventDefault(){throw Error("Typing intercepted");}});
    document.querySelector("#modal").setAttribute("open","");h.tools.key({target:document.body,code:"Delete"});document.querySelector("#modal").removeAttribute("open");
    h.view.playing=true;h.tools.key({target:document.body,code:"Delete"});h.view.playing=false;h.tools.key({target:document.body,code:"Delete",repeat:true});assert.equal(h.commits,0);
  }finally{h.close();}
});
test("linked quest and owned-item deletions cannot leave a partially deleted project",()=>{
  const p=demoProject(),before=structuredClone(p);assert.throws(()=>deleteEntities(p,["tree-0","shard"]),/заданию/);assert.deepEqual(p,before);
  const npc=createEntity("npc","humanoid"),item=createEntity("item","sphere");npc.id="owner";item.id="owned";item.itemOwner=npc.id;p.entities.push(npc,item);
  assert.throws(()=>deleteEntities(p,["owner"]),/вещь/);const next=deleteEntities(p,["owner","owned"]);assert.ok(!next.entities.some(e=>["owner","owned"].includes(e.id)));
});
test("numeric group movement preserves offsets and uniform scale can preserve positions",()=>{
  const p=project(),before=structuredClone(p);const moved=transformEntities(p,["a","b"],{delta:[3,2,5]});assert.deepEqual(moved.entities[0].position,[-1,2.5,5]);assert.deepEqual(moved.entities[1].position,[3,2.5,5]);assert.deepEqual(moved.entities[2],p.entities[2]);
  const scaled=transformEntities(p,["a","b"],{factor:2});assert.deepEqual(scaled.entities[0].position,[-6,.5,0]);assert.deepEqual(scaled.entities[1].position,[2,.5,0]);assert.deepEqual(scaled.entities[0].scale,[2,2,2]);
  const sizesOnly=transformEntities(p,["a","b"],{factor:3,spread:false});assert.deepEqual(sizesOnly.entities[0].position,p.entities[0].position);
  assert.throws(()=>transformEntities(p,["a","b"],{delta:[10000,0,0]}),/границы/);assert.throws(()=>transformEntities(p,["a","b"],{factor:-1}));assert.deepEqual(p,before);
});
test("direct drag moves all selected objects once; Escape restores every preview transform",async()=>{
  const h=harness();try{
    h.tools.pointerDown(event(-4,0,{entityId:"a"}));h.tools.pointerMove(event(1,3));assert.deepEqual(h.p.entities[0].position,[-4,.5,0]);assert.deepEqual(h.view.objects.get("b").position.toArray(),[5,.5,3]);await h.tools.pointerUp(event(1,3));assert.equal(h.commits,1);assert.deepEqual(h.p.entities[0].position,[1,.5,3]);
    h.tools.pointerDown(event(1,3,{entityId:"a"}));h.tools.pointerMove(event(8,8));h.tools.cancel();assert.deepEqual(h.view.objects.get("a").position.toArray(),[1,.5,3]);assert.deepEqual(h.view.objects.get("b").position.toArray(),[5,.5,3]);assert.equal(h.commits,1);
  }finally{h.close();}
});
test("group gizmo translation, rotation and uniform size share an undoable atomic transform",async()=>{
  const h=harness();try{
    h.tools.setMode("scale");assert.equal(h.tools.gizmo.object,h.tools.pivot);h.tools.gizmo.axis="X";h.tools.gizmo.dispatchEvent({type:"mouseDown"});h.tools.pivot.scale.x=2;h.tools.gizmo.dispatchEvent({type:"objectChange"});assert.deepEqual(h.view.objects.get("a").scale.toArray(),[2,2,2]);await h.tools.finishTransform();assert.equal(h.commits,1);assert.deepEqual(h.p.entities[0].position,[-6,.5,0]);
    h.tools.setMode("rotate");h.tools.gizmo.axis="Y";h.tools.gizmo.dispatchEvent({type:"mouseDown"});h.tools.pivot.rotation.y=Math.PI/2;h.tools.gizmo.dispatchEvent({type:"objectChange"});await h.tools.finishTransform();assert.ok(Math.abs(h.p.entities[0].position[2]-4)<1e-6);assert.equal(h.commits,2);
  }finally{h.close();}
});
test("modifier clicking toggles selection without dragging or committing",()=>{
  const h=harness();try{h.tools.pointerDown(event(4,0,{entityId:"c",ctrlKey:true}));assert.deepEqual(h.selection.ids,["a","b","c"]);assert.equal(h.tools.gesture,null);h.tools.pointerDown(event(-4,0,{entityId:"a",shiftKey:true}));assert.deepEqual(h.selection.ids,["b","c"]);assert.equal(h.commits,0);}finally{h.close();}
});
test("marquee selects projected objects and cancel does not change selection",async()=>{
  const h=harness();try{
    h.tools.setMode("select");h.tools.pointerDown(event(0,0,{clientX:0,clientY:0}));h.tools.pointerMove(event(0,0,{clientX:800,clientY:600}));assert.equal(h.tools.marquee.hidden,false);await h.tools.pointerUp(event(0,0,{clientX:800,clientY:600}));assert.deepEqual(h.selection.ids,["a","b","c"]);assert.equal(h.tools.marquee.hidden,true);assert.equal(h.commits,0);
    h.tools.pointerDown(event(0,0));h.tools.pointerMove(event(0,0,{clientX:30,clientY:30}));h.tools.cancel();assert.deepEqual(h.selection.ids,["a","b","c"]);assert.equal(h.tools.marquee.hidden,true);
  }finally{h.close();}
});
test("selection outlines use one line object and update after a group moves",()=>{
  const h=harness();try{const outline=new SelectionOutline([...h.view.objects.values()]);assert.equal(outline.geometry.attributes.position.count,72);const old=outline.geometry.attributes.position.getX(0);h.view.objects.get("a").position.x+=10;outline.update();assert.equal(outline.geometry.attributes.position.getX(0),old+10);outline.dispose();}finally{h.close();}
});
test("batched scenery updates every selected instance but computes each shared bound only once",()=>{
  const p=project();p.entities=p.entities.slice(0,2);p.entities.forEach((e,i)=>e.position=[2+i,.5,2]);const root=new T.Group(),objects=new Map();for(const e of p.entities){const o=createEntityObject(e,new Map());objects.set(e.id,o);root.add(o);}const state=batchProps(root,objects,p.entities);assert.equal(state.batches.length,1);const batch=state.batches[0],original=batch.computeBoundingSphere.bind(batch);let calls=0;batch.computeBoundingSphere=()=>{calls++;return original();};
  for(const o of objects.values())o.position.z+=4;updateBatches(state,["a","b"]);assert.equal(calls,1);for(const id of ["a","b"]){const ref=state.refs.get(id)[0],m=new T.Matrix4();batch.getMatrixAt(ref.index,m);assert.equal(m.elements[14],6);}
});
test("bulk form applies explicit values without changing the source before commit",async()=>{
  const h=harness();try{const box=document.createElement("div");document.body.append(box);let saved;
    const element=(tag,text="",className="")=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};const field=(parent,label,value,type,change)=>{const i=element("input");i.type=type;i.value=value;i.onchange=()=>change(Number(i.value));parent.append(i);return i;};
    bulkEditor({box,project:h.p,ids:["a","b"],element,field,commit:async p=>{saved=p;return true;},remove(){}});
    const input=document.querySelector("#bulk-offset-0");input.value="3";input.dispatchEvent(new h.dom.window.Event("change"));assert.equal(h.p.entities[0].position[0],-4);document.querySelector("#bulk-move").click();await Promise.resolve();assert.equal(saved.entities[0].position[0],-1);
  }finally{h.close();}
});
