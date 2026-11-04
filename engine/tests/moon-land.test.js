import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { demoProject } from "../src/core/demo.js";
import { createEntity, validateProject, readProject } from "../src/core/project.js";
import { createTerrain, heightAt } from "../src/core/terrain.js";
import { GameState } from "../src/core/game.js";
import { RED_MOON_DEFAULTS, updateWorldEvents, actorPresent } from "../src/core/world-events.js";
import { moonBound, eventEntityPresent } from "../src/core/moon-land.js";
import { WorldEvents } from "../src/render/world-events.js";
import { syncItems } from "../src/render/item-world.js";
import { createEntityObject, WorldView } from "../src/render/world.js";
import { batchProps } from "../src/render/batches.js";
import { terrainGeometry } from "../src/render/surface.js";
import { terrainHit } from "../src/render/terrain-ray.js";
function setup(){
  const p=demoProject();p.world.size=80;p.world.terrain=createTerrain(40);p.world.terrain.heights.fill(3);
  p.world.terrain.regions=[{id:"island",name:"Island",min:[-36,-16],max:[-12,16]}];
  p.world.moonLand={regionId:"island",dormantHeight:-9,returnPosition:[0,4.7,0]};p.world.spawn=[0,4.7,0];
  p.world.dayNight={enabled:true,startHour:12,dayMinutes:18};p.world.redMoon={...RED_MOON_DEFAULTS,enabled:true,chance:1};
  const item=createEntity("item","sphere");item.id="relic";item.position=[-24,4,0];
  const prop=createEntity("prop","box");prop.id="pillar";prop.position=[-24,4,5];
  const enemy=createEntity("enemy","humanoid");enemy.id="sentry";enemy.position=[-24,3,-5];
  p.entities=[item,prop,enemy];p.quests=[];const game=new GameState(p);return {p,game,item,prop,enemy};
}
test("lunar terrain is session-owned, day seafloor and night land match collision rays",()=>{
  const {p,game}=setup(),authored=JSON.stringify(p);assert.equal(heightAt(game.project.world,-24,0),-9);assert.equal(heightAt(p.world,-24,0),3);
  assert.equal(terrainHit(new T.Ray(new T.Vector3(-24,20,0),new T.Vector3(0,-1,0)),game.project.world).point.y,-9);
  game.state.worldTime=22;updateWorldEvents(game,()=>0);assert.equal(heightAt(game.project.world,-24,0),3);
  const geo=terrainGeometry(game.project.world);assert.equal(geo.attributes.position.getY(20*41+8),3);geo.dispose();assert.equal(JSON.stringify(p),authored);assert.ok(moonBound(game.project.entities[0],p.world));
});
test("uncollected relics cannot be taken by day; dawn preserves inventory and returns player and drops",()=>{
  const {game,item,enemy}=setup();assert.equal(game.collect(item.id),false);assert.equal(actorPresent(enemy,game),false);
  game.state.worldTime=22;updateWorldEvents(game,()=>0);assert.ok(game.collect(item.id));assert.ok(actorPresent(enemy,game));
  game.state.position=[-24,4.7,0];game.state.worldTime=6;updateWorldEvents(game);assert.deepEqual(game.state.position,[0,4.7,0]);assert.ok(game.state.inventory.includes(item.id));assert.equal(game.moonReturnSerial,1);
  assert.ok(game.drop(item.id,[2,3,0]));assert.equal(eventEntityPresent(item,game.project.world,game.state),true);assert.ok(game.collect(item.id));
  game.state.worldTime=22;game.state.events.day=1;updateWorldEvents(game,()=>0);game.drop(item.id,[-24,4,0]);game.state.worldTime=6;updateWorldEvents(game);assert.ok(game.state.droppedItems.relic[0]>=0);assert.ok(game.collect(item.id));
});
test("load on island restores lunar phase and dawn return; defeated sentries never respawn",()=>{
  const {p,game,enemy}=setup();game.state.worldTime=22;updateWorldEvents(game,()=>0);game.hit(enemy.id,1000);game.state.position=[-24,4.7,0];
  const loaded=new GameState(p);loaded.load(game.save());assert.equal(heightAt(loaded.project.world,-24,0),3);assert.deepEqual(loaded.state.position,game.state.position);
  loaded.state.worldTime=6;updateWorldEvents(loaded);assert.equal(actorPresent(enemy,loaded),false);const copy=new GameState(p);copy.load(loaded.save());assert.deepEqual(copy.state.position,[0,4.7,0]);
  copy.state.worldTime=22;copy.state.events.day=1;updateWorldEvents(copy,()=>0);assert.ok(copy.state.defeated.includes(enemy.id));assert.ok(actorPresent(enemy,copy));
});
test("visible props, items, colliders and terrain LOD change together; editor terrain restored on exit",()=>{
  const {p,game}=setup(),objects=new Map(p.entities.map(e=>[e.id,createEntityObject(e,new Map())])),root=new T.Group();for(const o of objects.values())root.add(o);
  const batch=batchProps(root,objects,p.entities,p.world);assert.equal(batch.batches.length,0);
  const ground=new T.Mesh(terrainGeometry(p.world),new T.MeshLambertMaterial());ground.material.userData.hearthPaint=false;
  const b=new T.Box3(new T.Vector3(-25,3,4),new T.Vector3(-23,5,6));b.entityId="pillar";
  const view={objects,scene:new T.Scene(),boxes:[b],root,ground,grid:{},playing:true,quality:"minimum",invalidate(){},refreshColliders(){},updateTerrain:WorldView.prototype.updateTerrain};
  const events=new WorldEvents(view,game.project,game);assert.equal(objects.get("pillar").visible,false);assert.ok(b.disabled);assert.equal(ground.geometry.attributes.position.getY(20*41+8),-9);
  game.state.worldTime=22;updateWorldEvents(game,()=>0);events.sync();assert.equal(objects.get("pillar").visible,true);assert.equal(b.disabled,false);assert.equal(ground.geometry.attributes.position.getY(20*41+8),3);
  game.collect("relic");events.sync();syncItems(view,game.project,game.state);assert.equal(objects.get("relic").visible,false);
  game.state.worldTime=6;updateWorldEvents(game);events.sync();assert.equal(objects.get("pillar").visible,false);events.dispose();assert.equal(ground.geometry.attributes.position.getY(20*41+8),3);
  view.terrainLOD?.dispose();ground.geometry.dispose();ground.material.dispose();
});
test("lunar region references and safe shore are validated",()=>{
  const {p}=setup();validateProject(p);const bad=structuredClone(p);bad.world.moonLand.regionId="absent";assert.throws(()=>readProject(bad));
  bad.world.moonLand.regionId="island";bad.world.moonLand.returnPosition=[-24,4,0];assert.throws(()=>readProject(bad));
});
