import { readFile, writeFile } from "node:fs/promises";
import { demoProject } from "../src/core/demo.js";
import { planWall, appendWall } from "../src/core/walls.js";
import { serializeProject } from "../src/core/project.js";
import { createTerrain } from "../src/core/terrain.js";

let project = demoProject();
project.id = "wall-brush-example";
project.title = "Стены · свободная кисть и точный угол";
project.entities = []; project.quests = [];
project.world.size = 120; project.world.spawn = [0,1.7,24];
project.world.terrain = createTerrain(128);
const t = project.world.terrain;
for (let z=0;z<=t.resolution;z++) for (let x=0;x<=t.resolution;x++) {
  const wx = (x/t.resolution-.5)*120, wz = (z/t.resolution-.5)*120;
  t.heights[z*(t.resolution+1)+x] = 5*Math.max(0,1-Math.hypot(wx-29,wz+25)/15);
}
const data = "data:model/gltf-binary;base64," + (await readFile(new URL("../src/assets/models/castle-wall.glb",import.meta.url))).toString("base64");
const castle = {model:"castle",width:2,height:4,asset:{id:"hearth_castle_wall",name:"Замковая стена · Meshy",data}};
for (const [path,settings] of [
  [[[-24,6],[-24,-16],[2,-16],[2,6]],castle],
  [[[10,10],[33,27]],{...castle,straight:true,lockAngle:true,angle:37}],
  [[[16,-25],[42,-25]],{...castle,width:3}],
  [[[-28,20],[-18,20],[-10,28],[0,28]],{model:"stone",width:1,height:2}],
]) project = appendWall(project,planWall(project.world,path,settings),settings);
await writeFile(new URL("../examples/wall-brush.hearth.json",import.meta.url),serializeProject(project));
console.log(`Wall example: ${project.entities.length} sections; ${project.assets.length} embedded model.`);
