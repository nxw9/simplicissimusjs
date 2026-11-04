import {
  TextureLoader,
  Texture,
  RepeatWrapping,
  SRGBColorSpace,
  MeshStandardMaterial,
  Float32BufferAttribute,
} from "three";
export const MATERIAL_URLS = [
  null,
  new URL("../assets/materials/grass-soil.webp", import.meta.url).href,
  new URL("../assets/materials/grass.webp", import.meta.url).href,
  new URL("../assets/materials/rock.webp", import.meta.url).href,
  new URL("../assets/materials/brick.webp", import.meta.url).href,
];
const textures = new Map();
export const materialListeners = new Set();
export function materialTexture(id) {
  if (!id) return null;
  if (!textures.has(id)) {
    const texture =
      typeof document === "undefined"
        ? new Texture()
        : new TextureLoader().load(MATERIAL_URLS[id], () => {
            for (const f of materialListeners) f();
          });
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    texture.userData.hearthBuiltin = true;
    textures.set(id, texture);
  }
  return textures.get(id);
}
export function paintAttribute(geometry, world) {
  const count = geometry.attributes.position.count;
  let attr = geometry.getAttribute("surfaceWeights");
  if (!attr || attr.count !== count) {
    attr = new Float32BufferAttribute(new Float32Array(count * 4), 4);
    geometry.setAttribute("surfaceWeights", attr);
  }
  attr.array.fill(0);
  for (let i = 0; i < count; i++) {
    const id = world.terrain?.paint?.[i] ?? 0;
    if (id) attr.array[i * 4 + id - 1] = 1;
  }
  attr.needsUpdate = true;
}
export function groundMaterial(color, painted = true) {
  const material = new MeshStandardMaterial({ color, roughness: 1 });
  material.userData.hearthPaint = painted;
  material.defines={HEARTH_DETAIL:2};
  if (!painted) return material;
  material.onBeforeCompile = (shader) => {
    for (let i = 1; i <= 4; i++)
      shader.uniforms["hearthTex" + i] = { value: materialTexture(i) };
    shader.uniforms.hearthGround = { value: material.color };
    shader.vertexShader =
      "attribute vec4 surfaceWeights; varying vec4 hearthWeights; varying vec2 hearthUV; varying vec3 terrainP,terrainN;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nhearthWeights = surfaceWeights; hearthUV = position.xz / 3.0; terrainP=position; terrainN=normal;",
    );
    shader.fragmentShader =
      `varying vec4 hearthWeights; varying vec2 hearthUV; varying vec3 terrainP,terrainN; uniform vec3 hearthGround;
      uniform sampler2D hearthTex1; uniform sampler2D hearthTex2; uniform sampler2D hearthTex3; uniform sampler2D hearthTex4;
      float terrainNoise(vec3 p){return texture2D(hearthTex1,p.xz*.13+vec2(p.y*.07)).g;}
      vec3 terrainTri(sampler2D tex,vec3 p,vec3 n){vec3 w=pow(abs(n),vec3(5.));w/=max(.001,w.x+w.y+w.z);
        return texture2D(tex,p.zy).rgb*w.x+texture2D(tex,p.xz).rgb*w.y+texture2D(tex,p.xy).rgb*w.z;}
      ` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      vec4 weights = max(hearthWeights, vec4(0.0));
      float baseWeight = max(0.0,1.0-dot(weights,vec4(1.0)));
      #if HEARTH_DETAIL == 0
      diffuseColor.rgb = hearthGround*baseWeight+vec3(.11,.22,.075)*weights.x+vec3(.08,.20,.055)*weights.y+vec3(.37,.35,.30)*weights.z+vec3(.26,.21,.15)*weights.w;
      #else
      vec3 soil = texture2D(hearthTex1,hearthUV).rgb;
      float soilLuma=dot(soil,vec3(.2126,.7152,.0722));
      soil=mix(soil,soilLuma*vec3(.58,1.22,.48),.76);
      vec3 grass=texture2D(hearthTex2,hearthUV).rgb;
      float grassLuma=dot(grass,vec3(.2126,.7152,.0722));
      grass=mix(grass,grassLuma*vec3(.53,1.24,.44),.72);
      #if HEARTH_DETAIL > 1
      vec3 rock = terrainTri(hearthTex3,terrainP/3.0,normalize(terrainN));
      float strata=sin(terrainP.y*5.8+terrainNoise(terrainP*.19)*6.0);
      rock*=.88+.12*strata;
      #else
      vec3 rock=texture2D(hearthTex3,hearthUV).rgb;
      #endif
      diffuseColor.rgb = hearthGround*baseWeight
        + soil*weights.x
        + grass*weights.y
        + rock*weights.z
        + texture2D(hearthTex4,hearthUV).rgb*weights.w;
      float slope=1.0-abs(normalize(terrainN).y);
      diffuseColor.rgb=mix(diffuseColor.rgb,rock,smoothstep(.30,.7,slope)*.8);
      #if HEARTH_DETAIL > 1
      float macro=terrainNoise(terrainP*.17);
      diffuseColor.rgb*=.76+macro*.48;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.88,.97,.87),smoothstep(.6,.8,macro)*weights.x*.35);
      #endif
      #endif`,
    );
    shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
      #if HEARTH_DETAIL > 1
      float detail=terrainNoise(terrainP*2.3)*.065;
      vec3 q0=dFdx(vViewPosition),q1=dFdy(vViewPosition);
      vec3 r0=cross(q1,normal),r1=cross(normal,q0);
      float det=dot(q0,r0);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(detail)*r0+dFdy(detail)*r1));
      #endif`);
  };
  material.customProgramCacheKey = () => "hearth-ground-lod-v4";
  return material;
}
/** Real metre-sized masonry joints on built-in stone blocks, independent of object stretching. */
export function masonryMaterial(material,scale) {
  material.flatShading=false;
  material.onBeforeCompile=s=>{
    s.uniforms.masonryScale={value:scale};
    s.vertexShader='uniform vec3 masonryScale; varying vec3 masonryP,masonryN;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec3 blockScale=masonryScale;\n#ifdef USE_INSTANCING\nblockScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));\n#endif\nmasonryP=position*blockScale; masonryN=normal;');
    s.fragmentShader=`varying vec3 masonryP,masonryN;
      float masonryJoint(vec2 p){float row=floor(p.y/.65);vec2 q=vec2(p.x/1.45+mod(row,2.)*.5,p.y/.65);
        vec2 edge=min(fract(q),1.-fract(q));return smoothstep(.008,.035,min(edge.x,edge.y));}
      `+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`
      vec2 stoneUV=abs(masonryN.x)>.5?masonryP.zy:masonryP.xy;
      if(abs(masonryN.y)>.5)stoneUV=masonryP.xz;
      #ifdef USE_MAP
      diffuseColor*=texture2D(map,stoneUV/3.0);
      #endif
      float joint=masonryJoint(stoneUV);
      float stoneVariation=fract(sin(dot(floor(vec2(stoneUV.x/1.45+mod(floor(stoneUV.y/.65),2.)*.5,stoneUV.y/.65)),vec2(127.1,311.7)))*43758.54);
      diffuseColor.rgb*=mix(.28,.84+stoneVariation*.24,joint);`);
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float mortar=joint*.025;vec3 mq0=dFdx(vViewPosition),mq1=dFdy(vViewPosition),mr0=cross(mq1,normal),mr1=cross(normal,mq0);
      float md=dot(mq0,mr0);normal=normalize(abs(md)*normal-sign(md)*(dFdx(mortar)*mr0+dFdy(mortar)*mr1));`);
  };
  material.customProgramCacheKey=()=>"hearth-masonry-v2";return material;
}
/** Planar UVs per block face at 3 metres per tile, preserving physical scale. */
export function blockUV(geometry, scale) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = (p.getX(i) * scale[0]) / 3,
      y = (p.getY(i) * scale[1]) / 3,
      z = (p.getZ(i) * scale[2]) / 3;
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x, z);
    else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}
