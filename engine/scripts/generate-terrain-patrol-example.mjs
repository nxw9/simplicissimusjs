import {writeFile} from "node:fs/promises";
import {createMap} from "../src/core/create-map.js";
import {createEntity, serializeProject} from "../src/core/project.js";
import {raiseCliff, carveRoad} from "../src/core/terrain-brushes.js";
import {heightAt, moveGrounded} from "../src/core/terrain.js";
import {enemyConfig} from "../src/core/enemy.js";

const p=createMap({title:"Скалы, дороги и патрули · пример 0.38",size:160});
p.id="cliffs-roads-patrol-demo";
p.world.sky="#b1c6d1";p.world.ground="#9d9175";
p.world.landscape={enabled:true,seed:23,density:.45,wind:.5,haze:.25};
const w=p.world,r=w.terrain.regions[0];
w.terrain.paint=Array(w.terrain.heights.length).fill(2);
for(const [x,z] of [[-2,-34],[2,-17],[-3,0],[3,17],[0,34]])
  for(let i=0;i<3;i++)raiseCliff(w,r,x,z,19,3.5);
carveRoad(w,r,[-52,0,0],[52,0,0],4,0);
carveRoad(w,r,[-52,24,0],[0,24,12],4,4);
carveRoad(w,r,[0,24,12],[52,24,0],4,4);
w.spawn=[-55,heightAt(w,-55,4)+1.7,4];
for(const [id,name,points,mode,color] of [
  ["pass-guard","Страж нижнего прохода",[[-22,0],[0,0],[22,0]],"pingpong","#bf785b"],
  ["ridge-guard","Дозорный горной дороги",[[-38,24],[0,24],[38,24]],"pingpong","#748f9e"],
]) {
  const e=createEntity("enemy","humanoid");e.id=id;e.name=name;e.color=color;
  e.position=[points[0][0],heightAt(w,...points[0]),points[0][1]];
  e.enemy={...enemyConfig(e),speed:1.8,notice:8,damage:5};
  e.patrol={enabled:true,mode,pause:1.5,points};p.entities.push(e);
  // Check both directions with the same grounded motion as enemies.
  const route=[...points,...points.slice(0,-1).reverse()];
  let pos=[points[0][0],heightAt(w,...points[0])+1.7,points[0][1]];
  for(const target of route.slice(1)) {
    for(let i=0;i<2000;i++) {
      const dx=target[0]-pos[0],dz=target[1]-pos[2],d=Math.hypot(dx,dz);if(d<.3)break;
      pos=moveGrounded(w,pos,dx/d*Math.min(.1,d),dz/d*Math.min(.1,d));
    }
    if(Math.hypot(pos[0]-target[0],pos[2]-target[1])>.4)throw Error(`Blocked demo route: ${id}`);
  }
}
for(const [i,[x,z]] of [[-49,-25],[-38,-36],[-50,39],[47,-31],[58,-18],[47,44],[-27,57],[29,-53]].entries()) {
  const e=createEntity("prop","tree");e.id="demo-tree-"+i;e.name="Дерево у скалы";
  e.position=[x,heightAt(w,x,z),z];e.vegetation={species:"stonePine",seed:i%4};e.environment=true;e.collision="trunk";p.entities.push(e);
}
await writeFile("examples/cliffs-roads-patrol.hearth.json",serializeProject(p));
console.log("Example ready: 2 patrols, 2 mountain passes, 160 × 160 m.");
