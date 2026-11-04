import * as T from "three";
import { natureTime } from "./nature.js";

export function waterMaterial(project) {
  const c=project.rpg.water,t=project.world.terrain;
  const m=new T.MeshStandardMaterial({color:c.color,roughness:.21,metalness:.28,transparent:true,opacity:.96});
  const n=(t?.resolution??0)+1;
  const heights=new T.DataTexture(new Float32Array(t?.heights??[-80]),n,n,T.RedFormat,T.FloatType);
  heights.needsUpdate=true;heights.minFilter=T.NearestFilter;heights.magFilter=T.NearestFilter;
  m.defines={HEARTH_DETAIL:2};m.userData.water=true;m.terrainTexture=heights;
  m.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{waterTime:natureTime,waterHeights:{value:heights},waterSize:{value:project.world.size},waterLevel:{value:c.height}});
    s.vertexShader="varying vec3 waterP;\n"+s.vertexShader;
    s.vertexShader=s.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nwaterP=(modelMatrix*vec4(position,1.)).xyz;");
    s.fragmentShader=`varying vec3 waterP;uniform float waterTime,waterSize,waterLevel;uniform sampler2D waterHeights;
      float waves(vec2 p){return sin(p.x*.72+p.y*.46+waterTime*.9)*.07+sin(p.x*1.93-p.y*1.2+waterTime*1.3)*.028+sin(p.x*5.7+p.y*3.1-waterTime*1.9)*.007;}
      `+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
      #if HEARTH_DETAIL > 1
      vec2 grad=cos(waterP.x*.72+waterP.z*.46+waterTime*.9)*.07*vec2(.72,.46)+cos(waterP.x*1.93-waterP.z*1.2+waterTime*1.3)*.028*vec2(1.93,-1.2);
      normal=normalize(mat3(viewMatrix)*normalize(vec3(-grad.x,1.,-grad.y)));
      #endif`);
    s.fragmentShader=s.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
      #if HEARTH_DETAIL > 1
      vec2 terrainUV=waterP.xz/waterSize+.5;
      float inside=step(0.,terrainUV.x)*step(terrainUV.x,1.)*step(0.,terrainUV.y)*step(terrainUV.y,1.);
      float ground=mix(-80.,texture2D(waterHeights,terrainUV).r,inside);
      float depth=waterLevel-ground;
      diffuseColor.rgb=mix(vec3(.13,.29,.25),diffuseColor.rgb,smoothstep(.0,5.,depth));
      float foam=(1.-smoothstep(.05,.85,depth))*(.5+.5*sin(waterP.x*4.2+waterP.z*3.5+waterTime*1.4));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.59,.67,.58),clamp(foam,0.,.55));
      #endif`);
    s.fragmentShader=s.fragmentShader.replace("#include <opaque_fragment>",`float fresnel=pow(1.-max(0.,dot(normal,normalize(vViewPosition))),4.);
      #ifdef USE_FOG
      outgoingLight=mix(outgoingLight,fogColor*.85,fresnel*.55);
      #endif
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey=()=>"hearth-water-v3";return m;
}
