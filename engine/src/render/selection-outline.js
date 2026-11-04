import * as T from "three";
const edges = [[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7]];
/** One draw call for all selected objects, including batched scene sources. */
export class SelectionOutline extends T.LineSegments {
  constructor(objects) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(objects.length*72),3));
    super(geometry,new T.LineBasicMaterial({color:0xe7c77b,depthTest:false}));
    this.objects = objects; this.renderOrder = 25; this.frustumCulled = false; this.update();
  }
  update() {
    const attr=this.geometry.attributes.position, box=new T.Box3(); let index=0;
    for(const o of this.objects) {
      box.setFromObject(o); if(box.isEmpty()) box.set(o.position,o.position);
      for(const edge of edges) for(const corner of edge) attr.setXYZ(index++,corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z);
    }
    attr.needsUpdate=true;
  }
  dispose() {this.geometry.dispose();this.material.dispose();}
}
