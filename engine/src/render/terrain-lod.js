import * as T from 'three';
import {heightAt} from '../core/terrain.js';
import {qualityProfile} from '../core/quality.js';
/** Every LOD keeps the original boundary vertices, so adjacent chunks remain watertight. */
export function terrainPatch(world,source,x0,z0,x1,z1,stride=1){
 const n=world.terrain.resolution,step=world.size/n,half=world.size/2,positions=[],normals=[],uv=[],weights=[],indices=[],ids=new Map(),normal=source.attributes.normal,paint=world.terrain.paint;
 function vertex(x,z){
  const key=x+':'+z;if(ids.has(key))return ids.get(key);
  const id=positions.length/3,wx=x*step-half,wz=z*step-half,sample=Math.round(z)*(n+1)+Math.round(x);
  positions.push(wx,heightAt(world,wx,wz),wz);uv.push(x/n,z/n);normals.push(normal.getX(sample),normal.getY(sample),normal.getZ(sample));
  const material=paint?.[sample]??0;weights.push(...[1,2,3,4].map(v=>+(material===v)));ids.set(key,id);return id;
 }
 for(let z=z0;z<z1;z+=stride)for(let x=x0;x<x1;x+=stride){
  const xx=Math.min(x1,x+stride),zz=Math.min(z1,z+stride);
  if(stride===1||!(x===x0||z===z0||xx===x1||zz===z1)){const a=vertex(x,z),b=vertex(xx,z),c=vertex(x,zz),d=vertex(xx,zz);indices.push(a,c,b,b,c,d);continue;}
  const rim=[];
  for(let a=x;a<xx;a+=z===z0?1:xx-x)rim.push(vertex(a,z));
  for(let b=z;b<zz;b+=xx===x1?1:zz-z)rim.push(vertex(xx,b));
  for(let a=xx;a>x;a-=zz===z1?1:xx-x)rim.push(vertex(a,zz));
  for(let b=zz;b>z;b-=x===x0?1:zz-z)rim.push(vertex(x,b));
  const center=vertex((x+xx)/2,(z+zz)/2);for(let i=0;i<rim.length;i++)indices.push(center,rim[(i+1)%rim.length],rim[i]);
 }
 const g=new T.BufferGeometry();for(const [name,array,size]of [['position',positions,3],['normal',normals,3],['uv',uv,2],['surfaceWeights',weights,4]])g.setAttribute(name,new T.Float32BufferAttribute(array,size));
 g.setIndex(indices);g.computeBoundingSphere();g.computeBoundingBox();return g;
}
export class TerrainLOD{
 constructor(world,source,material){
  this.world=world;this.source=source;this.root=new T.Group();this.root.name='Terrain chunks';this.chunks=[];this.empty=new T.BufferGeometry();
  const n=world.terrain.resolution,step=world.size/n,half=world.size/2;
  for(let z=0;z<n;z+=64)for(let x=0;x<n;x+=64){const x1=Math.min(n,x+64),z1=Math.min(n,z+64),mesh=new T.Mesh(this.empty,material);mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;this.chunks.push({x,z,x1,z1,mesh,levels:new Map(),center:new T.Vector2((x+x1)*step/2-half,(z+z1)*step/2-half),radius:Math.hypot(x1-x,z1-z)*step/2});this.root.add(mesh);}
 }
 update(camera,quality='balanced',force=false,overview=false){
  const p=qualityProfile(quality),x=camera.position.x,z=camera.position.z;if(!force&&this.lastOverview===overview&&this.lastQuality===quality&&Math.hypot(x-this.lastX,z-this.lastZ)<2)return;this.lastX=x;this.lastZ=z;this.lastQuality=quality;
  for(const c of this.chunks){const d=Math.max(0,Math.hypot(x-c.center.x,z-c.center.y)-c.radius);c.mesh.visible=overview||d<p.viewDistance;if(!c.mesh.visible)continue;const stride=d<p.terrainNear?1:d<p.terrainMid?2:d<p.terrainFar?4:d<p.terrainFar*1.6?8:16;if(!c.levels.has(stride))c.levels.set(stride,terrainPatch(this.world,this.source,c.x,c.z,c.x1,c.z1,stride));c.mesh.geometry=c.levels.get(stride);}
 }
 refresh(world,source,material,dirty){this.world=world;this.source=source;this.lastQuality=null;for(const c of this.chunks){c.mesh.material=material;if(dirty&&(c.x1<dirty.minX||c.x>dirty.maxX||c.z1<dirty.minZ||c.z>dirty.maxZ))continue;for(const g of c.levels.values())g.dispose();c.levels.clear();}}
 dispose(){this.empty.dispose();for(const c of this.chunks)for(const g of c.levels.values())g.dispose();this.root.removeFromParent();}
}
