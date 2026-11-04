import * as T from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { randomSeed, hashString, noise2 } from "../core/landscape.js";

// Shared uniforms also drive depth/shadow shaders: leaves and their shadows sway together.
export const natureTime = { value: 0 }, natureWind = { value: .65 };
function windShader(shader) {
  shader.uniforms.hearthTime=natureTime; shader.uniforms.hearthWind=natureWind;
  shader.vertexShader = "uniform float hearthTime,hearthWind;\n"+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
    if (hearthWind > .001) {
    vec4 windWorld=vec4(transformed,1.0);
    #ifdef USE_INSTANCING
      windWorld=instanceMatrix*windWorld;
    #endif
    windWorld=modelMatrix*windWorld;
    float sway=(sin(hearthTime*1.1+windWorld.x*.31+windWorld.z*.24)*.7+sin(hearthTime*2.2+windWorld.x*.9)*.3)*hearthWind;
    transformed.x+=sway*min(.18,max(0.0,position.y)*.025);
    transformed.z+=sway*.045;
    }
  `);
}
export function animateFoliage(material) {
  material.onBeforeCompile=windShader;
  material.customProgramCacheKey=()=>"hearth-foliage-v1";
  return material;
}
const leafTextures=new Map();
function leafMipmaps(bytes,size) {
  const coverage=Array.from(bytes).filter((v,i)=>i%4===3&&v>=128).length/(size*size);
  const levels=[{data:bytes,width:size,height:size}];
  while(size>1) {
    const next=size/2,source=levels.at(-1).data,data=new Uint8Array(next*next*4);
    for(let y=0;y<next;y++)for(let x=0;x<next;x++)for(let c=0;c<4;c++) {
      const at=(y*2*size+x*2)*4+c;
      data[(y*next+x)*4+c]=Math.round((source[at]+source[at+4]+source[at+size*4]+source[at+size*4+4])/4);
    }
    // Keep cutout coverage stable as leaves become subpixel; otherwise distant trees look bare.
    let low=0,high=8;
    for(let i=0;i<12;i++) {
      const scale=(low+high)/2;let covered=0;
      for(let p=3;p<data.length;p+=4)if(data[p]*scale>=128)covered++;
      if(covered/(next*next)<coverage)low=scale;else high=scale;
    }
    for(let p=3;p<data.length;p+=4)data[p]=Math.min(255,Math.round(data[p]*high));
    levels.push({data,width:next,height:next});size=next;
  }
  return levels;
}
/** Four single-leaf silhouettes per species; no repeated wreath or whole-canopy sprite. */
function leafTexture(species) {
  if(leafTextures.has(species))return leafTextures.get(species);
  const n=128,tile=n/2,bytes=new Uint8Array(n*n*4),pine=species==='stonePine';
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const variant=Math.floor(x/tile)+2*Math.floor(y/tile),u=(x%tile+.5)/tile,v=(y%tile+.5)/tile;
    const t=(v-.07)/.86,curve=Math.sin(Math.PI*Math.max(0,Math.min(1,t))),bend=(variant-1.5)*.035*curve;
    let alpha=0,shade=.94;
    if(t>0&&t<1) {
      if(pine) {
        // Pine needles naturally grow in small bundles, with staggered tips.
        for(let k=0;k<3;k++) {
          const end=.90+k*.045,nt=t/end,axis=.5+(k-1)*(.03+t*.23)+bend;
          if(nt<1&&Math.abs(u-axis)<.025*Math.pow(Math.sin(Math.PI*nt),.4))alpha=255;
        }
      } else {
        const lobes=species==='oak'?1+.13*Math.sin(t*21+variant*.5):1;
        const serration=species==='hornbeam'||species==='chestnut'?1+.035*Math.sin(t*72):1;
        const half=.41*Math.pow(curve,.76+variant*.065)*lobes*serration;
        const across=Math.abs(u-.5-bend);
        if(across<half)alpha=255;
        shade=.88+.13*(1-Math.min(1,across/.42));
        if(across<.009)shade+=.035;
      }
    }
    const i=(y*n+x)*4;
    // Fill even transparent texels with the same restrained green: filtered edges cannot pick up a bright matte.
    bytes[i]=Math.round((pine?77:94)*shade);bytes[i+1]=Math.round((pine?108:128)*shade);
    bytes[i+2]=Math.round((pine?66:73)*shade);bytes[i+3]=alpha;
  }
  const texture=new T.DataTexture(bytes,n,n);texture.colorSpace=T.SRGBColorSpace;
  texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
  texture.mipmaps=leafMipmaps(bytes,n);texture.generateMipmaps=false;
  texture.needsUpdate=true;texture.anisotropy=2;texture.userData.hearthBuiltin=true;
  leafTextures.set(species,texture);return texture;
}
function leafCard(base,direction,width,length,roll,variant,tint) {
  const up=new T.Vector3(0,1,0),side=direction.clone().cross(up).normalize().applyAxisAngle(direction,roll);
  const normal=side.clone().cross(direction).normalize(),basis=new T.Matrix4().makeBasis(side,direction,normal);
  const g=new T.PlaneGeometry(width,length);g.translate(0,length*.5,0);g.applyMatrix4(basis);g.translate(...base.toArray());
  const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+(variant%2))/2,(uv.getY(i)+Math.floor(variant/2))/2);
  return colored(g,new T.Color().setRGB(tint,tint,tint));
}
function leafLOD(cards,stride,enlarge) {
  const selected=[];
  for(let i=0;i<cards.length;i+=stride) {
    const g=cards[i].clone(),p=g.attributes.position,c=new T.Vector3();
    for(let j=0;j<p.count;j++)c.add(new T.Vector3().fromBufferAttribute(p,j));c.multiplyScalar(1/p.count);
    g.translate(-c.x,-c.y,-c.z);g.scale(enlarge,enlarge,enlarge);g.translate(c.x,c.y,c.z);selected.push(g);
  }
  const result=mergeGeometries(selected);for(const g of selected)g.dispose();return result;
}

function cylinder(a,b,r1,r2,segments=7,open=false) {
  const d=b.clone().sub(a),g=new T.CylinderGeometry(r2,r1,d.length(),segments,1,open);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));
  g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());return g;
}
function colored(g, color) {
  const c=new T.Color(color),n=g.attributes.position.count,a=new Float32Array(n*3);
  for(let i=0;i<n;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;}
  g.setAttribute("color",new T.BufferAttribute(a,3));return g;
}
export function barkMaterial() {
  const m=new T.MeshStandardMaterial({color:"#716454",roughness:.95});
  m.onBeforeCompile=s=>{
    s.vertexShader="varying vec3 barkP;\n"+s.vertexShader;
    s.vertexShader=s.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nbarkP=position;");
    s.fragmentShader="varying vec3 barkP;\n"+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace("#include <color_fragment>",`#include <color_fragment>
      float grooves=sin((barkP.x+barkP.z)*81.0+sin(barkP.y*4.0)*1.3)*sin((barkP.x-barkP.z)*53.0+barkP.y*.7);
      diffuseColor.rgb*=.78+grooves*.22+sin(barkP.y*16.0)*.055;`);
  };
  m.customProgramCacheKey=()=>"hearth-bark-v1";return m;
}
/** Cache is scoped to one world load, so disposing a project never invalidates another. */
export function vegetationObject(entity, cache=new Map()) {
  const species=entity.vegetation?.species??"oak",seed=(entity.vegetation?.seed??hashString(entity.id))%4;
  const key=`${species}:${seed}`;
  if(!cache.has(key)) {
    const rand=randomSeed(seed+hashString(species)), shrub=["laurel","arbutus"].includes(species),pine=species==="stonePine";
    const height=(shrub?2.7:pine?10.5:species==="hornbeam"?9:8.2)*(.94+seed*.04);
    const wood=[],mediumWood=[],lowWood=[],foliage=[];
    const trunkTop=new T.Vector3(.32*(rand()-.5),height*(pine?.73:.56),.38*(rand()-.5));
    const trunk=cylinder(new T.Vector3(),trunkTop,shrub?.09:.3,shrub?.035:.14,7);
    wood.push(trunk);mediumWood.push(trunk);lowWood.push(trunk);
    const leader=trunkTop.clone().add(new T.Vector3(.12,height*(pine?.18:.34),-.08));
    wood.push(cylinder(trunkTop,leader,shrub?.035:.14,.006,6));
    mediumWood.push(cylinder(trunkTop,leader,shrub?.035:.14,.006,4));
    lowWood.push(cylinder(trunkTop,leader,shrub?.035:.14,0,3,true));
    // Visible buttress roots and irregular boughs; no intersecting cone crown.
    if(!shrub)for(let i=0;i<5;i++) {
      const a=i*1.256+rand()*.2;
      wood.push(cylinder(new T.Vector3(Math.cos(a)*.9,.04,Math.sin(a)*.9),new T.Vector3(0,.7,0),.035,.16));
    }
    const branchCount=shrub?6:pine?8:9;
    for(let i=0;i<branchCount;i++) {
      const angle=i*2.399+rand()*1.05, f=(i+rand()*.45)/branchCount;
      const start=trunkTop.clone().multiplyScalar(pine?.72+f*.28:.38+f*.62);
      const radius=(shrub?1.2:pine?3.5:species==="hornbeam"?2:3.1)*(1-f*.42);
      const end=new T.Vector3(Math.cos(angle)*radius,height*(pine?.8+f*.12:.5+f*.44),Math.sin(angle)*radius);
      const mid=start.clone().lerp(end,.55);mid.y-=.25;
      const bough=cylinder(start,mid,shrub?.045:.11*(1-f*.65),.045,6),twig=cylinder(mid,end,.045,.014,5);
      wood.push(bough,twig);
      mediumWood.push(cylinder(start,mid,shrub?.045:.11*(1-f*.65),.045,4),cylinder(mid,end,.045,.014,4));
      // Keep every limb even in the cheapest LOD, using three-face tapered branches.
      lowWood.push(cylinder(start,mid,shrub?.045:.11*(1-f*.65),0,3,true),cylinder(mid,end,.045,0,3,true));
      for(let j=0;j<3;j++) {
        const twigStart=mid.clone().lerp(end,rand()*.12+j*.08);
        const radial=new T.Vector3(Math.cos(angle),0,Math.sin(angle)),lateral=new T.Vector3(-radial.z,0,radial.x);
        const twigEnd=end.clone().addScaledVector(radial,.25+rand()*.55).addScaledVector(lateral,(j-1)*(.85+rand()*.4));
        twigEnd.y+=-.1+rand()*.9;
        wood.push(cylinder(twigStart,twigEnd,.018,.002,3));
        const simpleTwig=cylinder(twigStart,twigEnd,.018,0,3,true);mediumWood.push(simpleTwig);lowWood.push(simpleTwig);
        const axis=twigEnd.clone().sub(twigStart).normalize(),out=new T.Vector3(-axis.z,0,axis.x).normalize();
        const count=shrub?12:pine?11:18;
        for(let k=0;k<count;k++) {
          if(rand()<.06)continue;
          const t=(k+.2+rand()*.6)/count,side=k%2?1:-1;
          const base=twigStart.clone().lerp(twigEnd,t);
          const dir=axis.clone().multiplyScalar(.2+rand()*.55).addScaledVector(out,side*(.5+rand()*.5));
          dir.y+=(rand()-.45)*.8;dir.normalize();
          const size=.75+rand()*.5,length=(shrub?.27:pine?.46:species==='chestnut'?.47:.36)*size;
          const width=(shrub?.16:pine?.23:species==='chestnut'?.16:species==='hornbeam'?.17:.23)*size;
          foliage.push(leafCard(base,dir,width,length,(rand()-.5)*1.25,Math.floor(rand()*4),.80+rand()*.20));
        }
      }
    }

    const g=new T.Group(),bark=new T.Mesh(mergeGeometries(wood),barkMaterial());
    bark.name="Trunk";bark.lodGeometries=[bark.geometry,mergeGeometries(mediumWood),mergeGeometries(lowWood)];g.add(bark);
    const material=animateFoliage(new T.MeshLambertMaterial({map:leafTexture(species),alphaTest:.50,
      side:T.DoubleSide,vertexColors:true,color:'#ffffff'}));
    material.alphaToCoverage=false;material.userData.hearthCanopy=true;
    // Thin leaves receive diffuse light on both faces. No specular rim or additive emission.
    material.onBeforeCompile=shader=>{
      windShader(shader);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal*=faceDirection;
        #endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if(!gl_FrontFacing)diffuseColor.rgb*=.72;`);
    };
    material.customProgramCacheKey=()=>"hearth-leaf-diffuse-v2";
    const leaves=new T.Mesh(mergeGeometries(foliage),material);leaves.name="Canopy";
    leaves.lodGeometries=[leaves.geometry,leafLOD(foliage,3,1.35),leafLOD(foliage,10,2.1)];
    leaves.customDepthMaterial=animateFoliage(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:material.map,alphaTest:.50,side:T.DoubleSide}));
    g.add(leaves);
    for(const a of new Set([...wood,...mediumWood,...lowWood,...foliage]))a.dispose();
    g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.geometry.userData.natureKey=key+o.name;}});
    cache.set(key,g);
  }
  const source=cache.get(key),copy=source.clone();
  copy.children.forEach((child,i)=>{child.customDepthMaterial=source.children[i].customDepthMaterial;child.lodGeometries=source.children[i].lodGeometries;});
  return copy;
}
export function rockObject(entity,cache=new Map()) {
  const seed=(entity.vegetation?.seed??hashString(entity.id))%7,key=`rock:${seed}`;
  if(!cache.has(key)) {
    const raw=new T.IcosahedronGeometry(.55,2);raw.deleteAttribute('normal');raw.deleteAttribute('uv');
    const g=mergeVertices(raw),p=g.attributes.position;raw.dispose();
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=.78+noise2(x*4+seed,z*4-y*2)*.5;
      p.setXYZ(i,x*r,Math.max(-.44,y*r),z*r);
    }
    g.computeVertexNormals();g.userData.natureKey=key;
    cache.set(key,g);
  }
  const m=new T.MeshStandardMaterial({color:entity.color,roughness:.97});
  m.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 rockP;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nrockP=position;');
    s.fragmentShader='varying vec3 rockP;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float vein=sin(rockP.y*43.0+sin(rockP.x*15.0+rockP.z*12.0)*1.5);
      float fleck=fract(sin(dot(floor(rockP*170.0),vec3(127.1,311.7,74.7)))*43758.5);
      diffuseColor.rgb*=.78+.18*vein+.16*fleck;`);
  };
  m.customProgramCacheKey=()=>"hearth-limestone-v1";
  return new T.Mesh(cache.get(key),m);
}
