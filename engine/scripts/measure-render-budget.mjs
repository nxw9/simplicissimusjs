import * as T from 'three';
import {readFile,writeFile} from 'node:fs/promises';
import {WorldView} from '../src/render/world.js';
import {coverDistance} from '../src/render/groundcover.js';
import {heightAt} from '../src/core/terrain.js';
const p=JSON.parse(await readFile(process.argv[2]??'project/zaltan.hearth.json','utf8'));
const view=Object.assign(Object.create(WorldView.prototype),{scene:new T.Scene(),root:new T.Group(),camera:new T.PerspectiveCamera(63,16/9,.1,1280),renderer:{shadowMap:{},setPixelRatio(){}},objects:new Map(),mixers:[],playing:true,sun:new T.DirectionalLight()});view.scene.add(view.root,view.sun,view.sun.target);
const start=performance.now();await view.load(p);const report={loadMs:performance.now()-start,shots:{}},shots={village:[[-65,54],[-69,15]],pass:[[-165,28],[-174,5]],fort:[[-303,4],[-336,-2]]};
for(const quality of ['high','balanced','fast','low','minimum']){
 view.setQuality(quality);
 for(const [name,[[x,z],[a,b]]]of Object.entries(shots)){
  view.camera.position.set(x,heightAt(p.world,x,z)+1.7,z);view.camera.lookAt(a,heightAt(p.world,a,b)+4,b);view.camera.updateMatrixWorld(true);view.scene.updateMatrixWorld(true);coverDistance(view.cover,view.camera,quality);view.prepareRender?.(1/60,true);
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(view.camera.projectionMatrix,view.camera.matrixWorldInverse)),stats={triangles:0,draws:0,terrain:0,foliage:0,shadowCastersInCamera:0};
  view.scene.traverseVisible(o=>{if(!o.isMesh||!o.geometry||!o.layers.test(view.camera.layers)||(o.frustumCulled&&!frustum.intersectsObject(o)))return;const g=o.geometry,tri=Math.min(g.drawRange.count,g.index?.count??g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);stats.triangles+=tri;stats.draws++;if(g.attributes.surfaceWeights)stats.terrain+=tri;if(o.material?.alphaTest>0)stats.foliage+=tri;if(o.castShadow&&view.renderer.shadowMap.enabled)stats.shadowCastersInCamera+=tri;});report.shots[quality+':'+name]=stats;
 }
}
console.log(JSON.stringify(report,null,2));if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2));
