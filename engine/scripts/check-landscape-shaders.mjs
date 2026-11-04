// Emit the exact Three.js WebGLProgram shader sources for a real EGL compiler check.
// Usage: node scripts/check-landscape-shaders.mjs OUTPUT.json
import * as T from "three";
import { WebGLProgram } from "three/src/renderers/webgl/WebGLProgram.js";
import { readFile,writeFile } from "node:fs/promises";
import { groundMaterial,masonryMaterial } from "../src/render/materials.js";
import { waterMaterial } from "../src/render/water.js";
import { vegetationObject,rockObject } from "../src/render/nature.js";
import {QUALITY_PROFILES} from "../src/core/quality.js";
import { DayNight } from "../src/render/day-night.js";
const code=await readFile(new URL('../node_modules/three/src/renderers/webgl/WebGLProgram.js',import.meta.url),'utf8');
export function shaderSource(material,instancing=false,shadows=false,instanceColors=false,directionalLights=1) {
  const shaders=[],gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,createProgram:()=>({}),createShader:type=>({type}),shaderSource:(shader,source)=>shaders.push({type:shader.type,source}),compileShader(){},attachShader(){},linkProgram(){},bindAttribLocation(){}};
  const params=Object.fromEntries([...code.matchAll(/parameters\.(\w+)/g)].map(m=>[m[1],m[1].startsWith('num')?0:false]));
  const base=material.isShaderMaterial?material:material.isMeshDepthMaterial?T.ShaderLib.depth:material.isMeshLambertMaterial?T.ShaderLib.lambert:T.ShaderLib.standard;
  Object.assign(params,{
    shaderType:material.type,shaderName:'landscape',vertexShader:base.vertexShader,fragmentShader:base.fragmentShader,
    uniforms:{...base.uniforms},defines:material.defines??{},precision:'highp',envMapCubeUVHeight:null,
    outputColorSpace:T.SRGBColorSpace,toneMapping:material.toneMapped?T.ACESFilmicToneMapping:T.NoToneMapping,
    numDirLights:directionalLights,numHemiLights:1,vertexNormals:true,vertexColors:material.vertexColors,
    map:Boolean(material.map),mapUv:'uv',alphaTest:material.alphaTest>0,doubleSided:material.side===T.DoubleSide,
    useFog:material.fog!==false,fog:true,opaque:!material.transparent,instancing,instancingColor:instanceColors,
    shadowMapEnabled:shadows,numDirLightShadows:shadows?1:0,shadowMapType:T.PCFSoftShadowMap,
    useDepthPacking:material.isMeshDepthMaterial,depthPacking:material.depthPacking,
  });
  material.onBeforeCompile(params);
  new WebGLProgram({getContext:()=>gl},'qa',params,{});
  return {vertex:shaders.find(s=>s.type===1).source,fragment:shaders.find(s=>s.type===2).source};
}
if(process.argv[1]?.endsWith('check-landscape-shaders.mjs')) {
  const tree=vegetationObject({id:'test',vegetation:{species:'oak',seed:1}});
  const v={scene:new T.Scene(),camera:new T.PerspectiveCamera(),project:{world:{sky:'#91b5c3'}},invalidate(){}};
  const day=new DayNight(v);
  const examples={terrain:groundMaterial('#999999'),water:waterMaterial({world:{size:80},rpg:{water:{height:0,color:'#31565b'}}}),
    bark:tree.children[0].material,foliage:tree.children[1].material,foliageDepth:tree.children[1].customDepthMaterial,sky:day.sky.material,
    masonry:masonryMaterial(new T.MeshStandardMaterial({map:tree.children[1].material.map}),[8,6,2]),rock:rockObject({id:'rock',color:'#888888'}).material};
  const results={};
  for(const [quality,profile]of Object.entries(QUALITY_PROFILES))
  for(const [key,m]of Object.entries(examples)){
    if(m.defines?.HEARTH_DETAIL!==undefined)m.defines.HEARTH_DETAIL=profile.detail;
    if(m.defines?.HEARTH_CLOUDS!==undefined)m.defines.HEARTH_CLOUDS=profile.clouds;
    for(const instanced of [false,true])for(const shadows of [false,true])for(const colors of instanced?[false,true]:[false])
    results[`${quality}-${key}-${instanced}-${shadows}-${colors}`]=shaderSource(m,instanced,shadows,colors);
  }
  await writeFile(process.argv[2],JSON.stringify(results));
  console.log(Object.keys(results).length+' shader pairs emitted');
}
