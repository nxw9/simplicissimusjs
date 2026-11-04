import test from "node:test";
import assert from "node:assert/strict";
import { createMap } from "../src/core/create-map.js";
import { heightAt, moveGrounded } from "../src/core/terrain.js";
import { raiseCliff, carveRoad } from "../src/core/terrain-brushes.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { History } from "../src/core/game.js";

function map() {const p=createMap({size:80});return {p,w:p.world,r:p.world.terrain.regions[0]};}
test("cliff clicks grow a large stone mountain, preserve neighbours and cap height",()=>{
  const {p,w,r}=map(),original=structuredClone(p),dirty={};
  assert.ok(raiseCliff(w,r,0,0,12,4,dirty));
  const first=heightAt(w,0,0);assert.ok(first>6);
  raiseCliff(w,r,0,0,12,4,dirty);
  assert.ok(heightAt(w,0,0)>first*1.9);
  assert.equal(heightAt(w,15,0),0);
  assert.ok(w.terrain.paint.includes(3));assert.ok(dirty.painted);
  for(let i=0;i<30;i++)raiseCliff(w,r,0,0,12,8,dirty);
  assert.equal(heightAt(w,0,0),80);assert.ok(w.terrain.heights.every(v=>v<=80&&v>=0));
  const history=new History();history.push(original);assert.deepEqual(history.undo(p),original);
  assert.deepEqual(readProject(serializeProject(p)),p);
});
test("road cuts a walkable corridor through a tall mountain in one sparse drag",()=>{
  const {w,r}=map();
  for(let i=0;i<6;i++)raiseCliff(w,r,0,0,14,4);
  let blocked=[-20,1.7,0];blocked=moveGrounded(w,blocked,40,0);
  assert.ok(blocked[0]<0);
  const side=heightAt(w,0,10);
  assert.ok(carveRoad(w,r,[-20,0,0],[20,0,0],3,4));
  for(let x=-20;x<=20;x+=.2)assert.ok(Math.abs(heightAt(w,x,0))<1e-8);
  assert.equal(heightAt(w,0,10),side);
  const walked=moveGrounded(w,[-20,1.7,0],40,0);
  assert.ok(Math.abs(walked[0]-20)<1e-6);assert.ok(Math.abs(walked[1]-1.7)<1e-6);
  assert.ok(w.terrain.paint.includes(4));
});
test("road slope is traversable uphill and region limits preserve neighbouring terrain",()=>{
  const {w}=map(),r={min:[-20,-10],max:[20,10]},before=[...w.terrain.heights];
  carveRoad(w,r,[-15,0,0],[15,0,9],3,0);
  assert.ok(Math.abs(heightAt(w,0,0)-4.5)<1e-8);
  const walked=moveGrounded(w,[-14,2,0],28,0);
  assert.ok(walked[0]>13.9);assert.ok(walked[1]>10);
  raiseCliff(w,r,19,0,15,4);
  const n=w.terrain.resolution,step=w.size/n;
  for(let iz=0;iz<=n;iz++)for(let ix=0;ix<=n;ix++) {
    const x=ix*step-40,z=iz*step-40;
    if(x<=-20||x>=20||z<=-10||z>=10)assert.equal(w.terrain.heights[iz*(n+1)+ix],before[iz*(n+1)+ix]);
  }
});
