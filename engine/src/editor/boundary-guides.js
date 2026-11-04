import * as T from "three";
import { worldBounds } from "../core/world-bounds.js";
import { heightAt } from "../core/terrain.js";
const edges=[[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7]];
function lines(color) {
  const line=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.8,fog:false}));
  line.frustumCulled=false;line.renderOrder=26;line.raycast=()=>{};return line;
}
/** Editor-only, two batched line draws; no meshes or collisions in exported gameplay. */
export class BoundaryGuides {
  constructor(view) {
    this.view=view;this.showBounds=false;this.showCollisions=false;this.dirty=true;
    this.group=new T.Group();this.group.name="EditorBoundaryGuides";this.bounds=lines(0x64d7f2);this.obstacles=lines(0xffaa62);
    this.group.add(this.bounds,this.obstacles);view.scene.add(this.group);this.group.visible=false;
  }
  set({bounds=this.showBounds,collisions=this.showCollisions}={}) {
    this.showBounds=bounds;this.showCollisions=collisions;this.onChange?.();this.refresh();
  }
  refresh() {this.dirty=true;this.view.invalidate();}
  updateVisibility(editing) {
    this.group.visible=editing&&(this.showBounds||this.showCollisions);
    if(!this.group.visible)return;
    const world=this.previewWorld??this.view.project.world,boundary=worldBounds(world);
    this.bounds.visible=this.showBounds&&!!boundary;this.obstacles.visible=this.showCollisions;
    if(!this.dirty)return;
    this.dirty=false;
    if(this.showBounds&&boundary) {
      const b=boundary,corners=[[b.min[0],b.min[1]],[b.max[0],b.min[1]],[b.max[0],b.max[1]],[b.min[0],b.max[1]]],v=[];
      for(let edge=0;edge<4;edge++) {
        const a=corners[edge],c=corners[(edge+1)%4],steps=Math.max(1,Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/4));
        for(let i=0;i<steps;i++) {
          const segment=[];
          for(const t of [i/steps,(i+1)/steps]){const x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t;segment.push([x,heightAt(world,x,z)+.12,z]);}
          v.push(...segment[0],...segment[1]);
          v.push(segment[0][0],segment[0][1]+3,segment[0][2],segment[1][0],segment[1][1]+3,segment[1][2]);
          if(i%5===0)v.push(...segment[0],segment[0][0],segment[0][1]+3,segment[0][2]);
        }
      }
      this.replace(this.bounds,v);
    }
    if(this.showCollisions) {
      const v=[];
      for(const b of this.view.boxes??[])if(!b.isEmpty()&&!b.disabled)
        for(const edge of edges)for(const c of edge)v.push(c&1?b.max.x:b.min.x,c&2?b.max.y:b.min.y,c&4?b.max.z:b.min.z);
      this.replace(this.obstacles,v);
    }
  }
  replace(line,values) {line.geometry.dispose();line.geometry=new T.BufferGeometry();line.geometry.setAttribute("position",new T.Float32BufferAttribute(values,3));}
  dispose() {this.group.removeFromParent();for(const l of [this.bounds,this.obstacles]){l.geometry.dispose();l.material.dispose();}}
}
