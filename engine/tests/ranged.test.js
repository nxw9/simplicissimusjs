import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { JSDOM } from "jsdom";
import { demoProject } from "../src/core/demo.js";
import { GameState } from "../src/core/game.js";
import { defaultRanged } from "../src/core/ranged.js";
import { enemyConfig } from "../src/core/enemy.js";
import { validateProject, readProject, serializeProject } from "../src/core/project.js";
import { EnemyController } from "../src/render/enemies.js";
import { MAX_PROJECTILES } from "../src/render/projectiles.js";
import { createEntityObject } from "../src/render/world.js";
import { terrainHit } from "../src/render/terrain-ray.js";
import { createTerrain } from "../src/core/terrain.js";
import { enemyEditor } from "../src/editor/enemy-editor.js";
function setup() {
  const p=demoProject(),e=p.entities.find(e=>e.kind==="enemy");
  e.position=[0,0,0];e.scale=[1,1,1];e.enemy={...enemyConfig(e),notice:35,duration:1,cooldown:3,impact:.6,speed:2,ranged:{...defaultRanged(),speed:12}};
  p.entities=[e];p.quests=[];p.world.size=80;p.world.spawn=[0,1.7,12];
  const game=new GameState(p),object=createEntityObject(e,new Map()),view={scene:new T.Scene(),objects:new Map([[e.id,object]]),boxes:[],assetModels:new Map(),invalidate(){},terrainHit:(ray,d)=>terrainHit(ray,p.world,d)};
  const ai=new EnemyController(view,p,game);return {p,e,game,view,ai,u:ai.units[0],player:new T.Vector3(0,1.7,12)};
}
test("ranged wind-up releases a visible projectile; damage waits for collision and a sidestep dodges",()=>{
  const {ai,game,player}=setup();ai.update(.01,player);for(let i=0;i<6;i++)ai.update(.1,player);
  assert.equal(ai.projectiles.active.length,1);assert.equal(game.state.health,100);
  for(let i=0;i<5;i++)ai.update(.1,player);assert.equal(game.state.health,100);
  for(let i=0;i<6;i++)ai.update(.1,player);assert.equal(game.state.health,90);assert.equal(ai.projectiles.active.length,0);ai.dispose();
  const s=setup();s.ai.projectiles.fire(s.u,s.player.clone().add(new T.Vector3(0,-.65,0)));
  for(let i=0;i<20;i++)s.ai.projectiles.update(.1,new T.Vector3(5,1.7,12),s.ai.units);assert.equal(s.game.state.health,100);s.ai.dispose();
});
test("swept projectiles hit thin walls at high speed; disabled colliders do not block",()=>{
  for(const disabled of [false,true]){
    const {ai,u,view,game,player}=setup();u.config.ranged.speed=120;
    const wall=new T.Box3(new T.Vector3(-2,0,6),new T.Vector3(2,3,6.03));wall.disabled=disabled;view.boxes=[wall];
    ai.projectiles.fire(u,player.clone().add(new T.Vector3(0,-.65,0)));ai.projectiles.update(.2,player,ai.units);
    assert.equal(game.state.health,disabled?90:100);assert.equal(ai.projectiles.active.length,0);ai.dispose();
  }
});
test("hills intercept a shot, actors take one hit, projectiles cannot damage through terrain",()=>{
  const {ai,u,game,player,p}=setup();p.world.terrain=createTerrain(80);
  for(let z=44;z<=46;z++)for(let x=0;x<=80;x++)p.world.terrain.heights[z*81+x]=5;
  ai.projectiles.fire(u,player.clone().add(new T.Vector3(0,-.65,0)));ai.projectiles.update(1.2,player,ai.units);
  assert.equal(game.state.health,100);assert.equal(ai.projectiles.active.length,0);p.world.terrain=null;
  const other=structuredClone(u.e);other.id="other";other.position=[0,0,6];other.health=50;p.entities.push(other);
  const obj=createEntityObject(other,new Map()),v={e:other,object:obj,hitSize:new T.Vector3(.7,1.8,.7)};
  ai.projectiles.fire(u,player.clone().add(new T.Vector3(0,-.65,0)));ai.projectiles.update(1.2,player,[u,v]);
  assert.equal(game.state.actorHealth.other,40);assert.equal(game.state.health,100);ai.dispose();
});
test("archer keeps distance and cannot shoot through walls during wind-up",()=>{
  const {ai,view,player,game,u}=setup();player.z=4;for(let i=0;i<8;i++)ai.update(.1,player);assert.ok(u.object.position.z<-.5);
  ai.reset();player.z=12;ai.update(.01,player);view.boxes=[new T.Box3(new T.Vector3(-2,0,4),new T.Vector3(2,3,4.1))];
  for(let i=0;i<25;i++)ai.update(.1,player);assert.equal(ai.projectiles.active.length,0);assert.equal(game.state.health,100);ai.dispose();
});
test("custom projectile transform, gravity, bounded shots and reset reuse GLB resources",()=>{
  const {ai,u,view,player,game}=setup(),scene=new T.Group(),geometry=new T.BoxGeometry(.1,.1,2),material=new T.MeshLambertMaterial();
  scene.add(new T.Mesh(geometry,material));view.assetModels.set("custom",{scene});
  Object.assign(u.config.ranged,{assetId:"custom",length:.8,gravity:4,rotation:[0,Math.PI/4,0]});
  ai.projectiles.fire(u,player.clone().add(new T.Vector3(0,-.65,0)));const shot=ai.projectiles.active[0],vy=shot.velocity.y;
  ai.projectiles.update(.1,new T.Vector3(20,1.7,20),[u]);assert.ok(shot.velocity.y<vy);
  for(let i=0;i<100;i++)ai.projectiles.fire(u,player);assert.equal(ai.projectiles.active.length,MAX_PROJECTILES);assert.equal(ai.projectiles.templates.size,1);
  assert.equal(shot.object.children[0].children[0].children[0].geometry,geometry);
  const save=game.save();ai.reset();game.load(save);assert.equal(ai.projectiles.active.length,0);ai.dispose();assert.equal(scene.children.length,1);
});
test("ranged settings roundtrip, v20 migration, absent models and invalid ranges rejected",()=>{
  const {p,e,ai}=setup();p.schemaVersion=20;const round=readProject(p);assert.equal(round.schemaVersion,25);
  assert.deepEqual(readProject(serializeProject(round)).entities[0].enemy.ranged,e.enemy.ranged);
  e.enemy.ranged.assetId="missing";assert.throws(()=>readProject(p));e.enemy.ranged.assetId=null;e.enemy.ranged.preferredDistance=90;assert.throws(()=>readProject(p));
  e.enemy.ranged.preferredDistance=14;e.enemy.ranged.speed=0;assert.throws(()=>readProject(p));ai.dispose();
});
test("enemy editor commits range settings and imports weapon/projectile without changing actor model",async()=>{
  const dom=new JSDOM('<dialog id="modal"></dialog><main></main>'),previous=globalThis.document;globalThis.document=dom.window.document;document.querySelector("dialog").close=()=>{};
  try {
    const {p,e,view,ai}=setup();delete e.enemy.ranged;let saved,imported;
    const element=(tag,text="",className="")=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
    const field=(box,label,value,type,change)=>{const row=element("label",label),n=element("input");n.type=type;n.value=value;n.oninput=()=>change(n.value);row.append(n);box.append(row);return n;};
    enemyEditor({entity:e,project:p,view,element,field,modal:(_,box)=>document.querySelector("main").replaceChildren(box),commit:async next=>{saved=validateProject(next);return true;},importModel:(id,slot)=>{imported=[id,slot];}});
    const enable=document.querySelector("#enemy-ranged-enabled");enable.checked=true;enable.onchange();const speed=document.querySelector("#enemy-projectile-speed");speed.value=33;speed.oninput();
    await document.querySelector("#enemy-projectile-import").onclick();assert.equal(saved.entities[0].enemy.ranged.speed,33);assert.deepEqual(imported,[e.id,"projectile"]);assert.equal(saved.entities[0].shape,"humanoid");
    await document.querySelector("#enemy-held-import").onclick();assert.deepEqual(imported,[e.id,"weapon"]);assert.equal(e.enemy.ranged,undefined);ai.dispose();
  } finally {globalThis.document=previous;dom.window.close();}
});
