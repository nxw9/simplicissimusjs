import { inMoonLand } from "../core/moon-land.js";
import * as T from "three";
import {qualityProfile} from "../core/quality.js";
import { randomSeed, noise2 } from "../core/landscape.js";
import { heightAt } from "../core/terrain.js";
import { animateFoliage } from "./nature.js";

/** Decorative tufts are batched in 24 m cells. They never obstruct actors or paths. */
export function groundcover(project) {
  const root=new T.Group(),cfg=project.world.landscape,t=project.world.terrain;
  root.name="Groundcover";
  if(!cfg?.enabled||!cfg.density||!t)return root;
  const rand=randomSeed(cfg.seed),size=project.world.size,n=t.resolution,s=size/n;
  const cells=new Map(),reserve=project.entities.filter(e=>e.shape!=="tree"&&e.shape!=="rock");
  const exclusion=new Map();
  for(const e of reserve) {
    const r=e.kind!=="prop"?2:e.shape==="box"?Math.hypot(e.scale[0],e.scale[2])*.5+1:2;
    if(r>60)continue;
    for(let x=Math.floor((e.position[0]-r)/8);x<=Math.floor((e.position[0]+r)/8);x++)
      for(let z=Math.floor((e.position[2]-r)/8);z<=Math.floor((e.position[2]+r)/8);z++) {
        const k=`${x}:${z}`;if(!exclusion.has(k))exclusion.set(k,[]);exclusion.get(k).push([e.position[0],e.position[2],r]);
      }
  }
  const total=Math.min(65000,Math.floor(size*size*cfg.density*1.8));
  for(let i=0;i<total;i++) {
    const x=(rand()-.5)*size,z=(rand()-.5)*size,
      ix=Math.max(0,Math.min(n,Math.round((x+size/2)/s))),iz=Math.max(0,Math.min(n,Math.round((z+size/2)/s))),
      paint=t.paint?.[iz*(n+1)+ix]??0;
    if(paint!==1&&paint!==2)continue;
    if(inMoonLand(project.world,[x,0,z]))continue;
    const y=heightAt(project.world,x,z),water=project.rpg?.water.height??-80;
    if(y<water+.25||y>44||Math.abs(heightAt(project.world,x+1,z)-y)>1||Math.abs(heightAt(project.world,x,z+1)-y)>1)continue;
    if((exclusion.get(`${Math.floor(x/8)}:${Math.floor(z/8)}`)??[]).some(([a,b,r])=>Math.hypot(x-a,z-b)<r))continue;
    if(noise2(x*.12,z*.12)<.22)continue;
    const key=`${Math.floor(x/24)}:${Math.floor(z/24)}`;
    if(!cells.has(key))cells.set(key,[]);cells.get(key).push([x,y-.025,z,rand(),rand()]);
  }
  const p=[],normals=[],colors=[],indices=[];
  for(let b=0;b<3;b++) {
    const a=b*2.399,dx=Math.cos(a),dz=Math.sin(a),w=.028+(b%2)*.018,h=.24+(b%3)*.1,base=p.length/3;
    for(const [side,y,bend] of [[-1,0,0],[1,0,0],[-.55,h*.55,.04],[.55,h*.55,.04],[0,h,.11]]) {
      p.push(dx*side*w+dz*bend,y,dz*side*w+dx*bend);
      normals.push(-dz,.35,dx);colors.push(y/h*.055+.055,y/h*.12+.13,y/h*.03+.035);
    }
    indices.push(base,base+1,base+2,base+1,base+3,base+2,base+2,base+3,base+4);
  }
  const geo=new T.BufferGeometry();geo.setAttribute("position",new T.Float32BufferAttribute(p,3));geo.setAttribute("normal",new T.Float32BufferAttribute(normals,3));geo.setAttribute("color",new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);
  const mat=animateFoliage(new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide}));
  const dummy=new T.Object3D();
  for(const entries of cells.values()) {
    const mesh=new T.InstancedMesh(geo,mat,entries.length);
    entries.forEach(([x,y,z,a,b],i)=>{
      dummy.position.set(x,y,z);dummy.rotation.y=a*Math.PI*2;dummy.scale.setScalar(.7+b*1.1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.userData.cover=true;mesh.userData.fullCount=entries.length;mesh.matrixAutoUpdate=false;root.add(mesh);
  }
  return root;
}
export function coverDistance(root,camera,quality="balanced") {
  const profile=qualityProfile(quality),distance=profile.grassDistance;
  for(const mesh of root?.children??[]) {
    const c=mesh.boundingSphere?.center;
    mesh.count=Math.ceil(mesh.userData.fullCount*profile.grass);
    if(c)mesh.visible=mesh.count>0&&Math.hypot(c.x-camera.position.x,c.z-camera.position.z)<distance+18;
  }
}
