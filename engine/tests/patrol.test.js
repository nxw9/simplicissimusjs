import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { demoProject } from "../src/core/demo.js";
import { createMap } from "../src/core/create-map.js";
import { createEntity, readProject, serializeProject } from "../src/core/project.js";
import { patrolDestination } from "../src/core/patrol.js";
import { enemyConfig } from "../src/core/enemy.js";
import { createEntityObject } from "../src/render/world.js";
import { EnemyController } from "../src/render/enemies.js";
import { GameState } from "../src/core/game.js";
import { exportGameHTML } from "../src/core/export-html.js";
import { raiseCliff, carveRoad } from "../src/core/terrain-brushes.js";

function setup(mode="pingpong",pause=0) {
  const project=createMap({size:80}),e=createEntity("enemy","humanoid");
  e.position=[0,0,0];e.enemy={...enemyConfig(e),speed:2,notice:5};
  e.patrol={enabled:true,mode,pause,points:[[0,0],[4,0],[4,4]]};project.entities.push(e);
  const o=createEntityObject(e,new Map());o.updateMatrixWorld(true);
  const view={objects:new Map([[e.id,o]]),boxes:[],invalidate(){},terrainHit:()=>null};
  const game=new GameState(project),ai=new EnemyController(view,project,game);
  const tick=(seconds,player=new T.Vector3(30,1.7,30))=>{for(let i=0;i<Math.round(seconds/.05);i++)ai.update(.05,player);};
  return {project,e,o,view,game,ai,tick};
}
test("patrol schema roundtrips, exports and migrates legacy worlds without adding routes",()=>{
  const {project,e}=setup();
  assert.deepEqual(readProject(serializeProject(project)).entities[0].patrol,e.patrol);
  const old=demoProject();old.schemaVersion=24;
  const migrated=readProject(old);assert.equal(migrated.schemaVersion,25);assert.ok(migrated.entities.every(e=>!e.patrol));
  const html=exportGameHTML('<script id="hearth-project" type="application/json">__HEARTH_PROJECT_JSON__</script>',project);
  assert.ok(html.includes('"pingpong"'));
  for(const mutate of [p=>p.entities[0].patrol.points.push([Infinity,0]),p=>p.entities[0].patrol.points.push([41,0]),p=>p.entities[0].patrol.pause=-1,p=>p.entities[0].patrol.mode="bad",p=>p.entities[0].patrol.points=[[0,0]],p=>p.entities[0].kind="prop"]) {
    const p=structuredClone(project);mutate(p);assert.throws(()=>readProject(p));
  }
});
test("loop, ping-pong, once and pauses advance deterministically",()=>{
  const route={enabled:true,mode:"pingpong",pause:0,points:[[0,0],[3,0],[3,3]]},s={};
  const next=(x,z,dt=.1)=>patrolDestination(route,s,{x,z},dt);
  assert.deepEqual(next(0,0),[3,0]);assert.deepEqual(next(3,0),[3,3]);
  assert.deepEqual(next(3,3),[3,0]);assert.deepEqual(next(3,0),[0,0]);assert.deepEqual(next(0,0),[3,0]);
  route.mode="loop";s.index=2;s.direction=1;assert.deepEqual(next(3,3),[0,0]);
  route.mode="once";s.index=2;assert.equal(next(3,3),null);assert.equal(next(0,0),null);
  const waiting={};route.mode="pingpong";route.pause=.5;
  assert.equal(patrolDestination(route,waiting,{x:0,z:0},.2),null);
  assert.equal(patrolDestination(route,waiting,{x:0,z:0},.2),null);
  assert.deepEqual(patrolDestination(route,waiting,{x:0,z:0},.1),[3,0]);
});
test("enemy walks authored route, waits, attacks and resumes without teleporting",()=>{
  const {ai,tick,o,game}=setup("once",.5);
  tick(.2);assert.equal(o.position.x,0);
  tick(1.3);assert.ok(o.position.x>1&&o.position.x<3);assert.equal(ai.units[0].state,"walk");
  const index=ai.units[0].patrolState.index;
  const player=o.position.clone().add(new T.Vector3(0,1.7,1));
  tick(1.5,player);assert.ok(game.state.health<100);assert.equal(ai.units[0].patrolState.index,index);
  tick(7);assert.ok(o.position.distanceTo(new T.Vector3(4,0,4))<.4);assert.equal(ai.units[0].state,"idle");
  assert.ok(ai.units[0].patrolState.done);
  const last=o.position.clone();tick(2);assert.ok(o.position.equals(last));
  ai.reset();assert.deepEqual(ai.units[0].patrolState,{});assert.equal(o.position.x,0);
});
test("patrol respects walls, disabled colliders, death and event absence",()=>{
  const {ai,tick,view,o,game,e}=setup();
  const wall=new T.Box3(new T.Vector3(1,-1,-1),new T.Vector3(2,4,1));view.boxes.push(wall);
  tick(2);assert.ok(o.position.x<.7);assert.equal(ai.units[0].patrolState.index,1);
  wall.disabled=true;tick(2);assert.ok(o.position.x>3);
  game.hit(e.id,10000);const last=o.position.clone();tick(2);assert.equal(o.position.x,last.x);assert.equal(o.position.z,last.z);
  const hidden=setup();hidden.e.moonOnly=true;hidden.project.world.dayNight={enabled:true,startHour:12,dayMinutes:20};
  hidden.tick(1);assert.equal(hidden.o.position.x,0);
});
test("enemy can follow a road cut through a mountain and climb its grade",()=>{
  const {ai,project,e,o,tick}=setup("once");
  const w=project.world,r=w.terrain.regions[0];
  for(let i=0;i<6;i++)raiseCliff(w,r,0,0,12,4);
  carveRoad(w,r,[-15,0,0],[15,0,6],3,0);
  e.position=[-15,0,0];o.position.set(...e.position);e.patrol.points=[[-15,0],[15,0]];
  // The game owns a terrain copy; load the edited map into its runtime world too.
  ai.project=project;tick(17);
  assert.ok(o.position.x>14.6);assert.ok(o.position.y>5.8);
});
