import * as T from "three";
import { skyState } from "../core/day-night.js";
import { natureTime } from "./nature.js";
export class DayNight {
  constructor(view) {
    this.view = view;
    this.shadowTime = 0;
    this.hemi =
      view.hemisphere ?? new T.HemisphereLight("#d9e9ef", "#354233", 2.6);
    if (!this.hemi.parent) view.scene.add(this.hemi);
    this.sun = view.sun ?? new T.DirectionalLight("#ffe5b3", 3.2);
    if (!this.sun.parent) view.scene.add(this.sun);
    this.moon = new T.DirectionalLight("#a9c5ff", 0);
    view.scene.add(this.moon);
    const uniforms = {
      top: { value: new T.Color() },
      horizon: { value: new T.Color() },
      sunDir: { value: new T.Vector3() },
      sunPower: { value: 0 },
      stars: { value: 0 },
      night: { value: 0 },
      blood: { value: 0 },
      skyTime: natureTime,
    };
    this.sky = new T.Mesh(
      new T.SphereGeometry(180, 32, 16),
      new T.ShaderMaterial({
        uniforms,
        defines:{HEARTH_CLOUDS:2},
        side: T.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        vertexShader:
          "varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          `varying vec3 vDirection; uniform vec3 top,horizon,sunDir; uniform float sunPower,stars,night,blood,skyTime;
      float cloudHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float cloudNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(cloudHash(i),cloudHash(i+vec2(1,0)),f.x),mix(cloudHash(i+vec2(0,1)),cloudHash(i+1.),f.x),f.y);}
      void main(){vec3 d=normalize(vDirection); float y=max(0.,d.y); vec3 c=mix(horizon,top,pow(y,.45));
      float s=dot(d,sunDir),m=dot(d,-sunDir);
      c+=vec3(1.,.8,.45)*pow(max(s,0.),64.)*.18*sunPower;
      c=mix(c,vec3(1.,.95,.8),smoothstep(.99977,.99984,s)*sunPower);
      #if HEARTH_CLOUDS > 0
      if(d.y>.035){vec2 cp=d.xz/(d.y+.18)*3.0+vec2(skyTime*.004,skyTime*.001);
      float cloud=cloudNoise(cp);
      #if HEARTH_CLOUDS > 1
      cloud=cloud*.7+cloudNoise(cp*2.1)*.3;
      #endif
      #if HEARTH_CLOUDS > 2
      cloud=cloud*.9+cloudNoise(cp*4.2)*.1;
      #endif
      float amount=smoothstep(.51,.74,cloud)*smoothstep(.035,.3,d.y)*.8;
      vec3 cloudColor=mix(horizon*.65,vec3(.9,.91,.88),sunPower*.7+.15);
      c=mix(c,cloudColor,amount);}
      #endif
      c+=vec3(.45,.015,.008)*pow(max(m,0.),160.)*blood*.6;
      c=mix(c,mix(vec3(.67,.75,.9),vec3(.85,.07,.025),blood),smoothstep(mix(.9998,.9985,blood),mix(.99987,.9987,blood),m)*night);
      vec3 cell=floor(d*500.); float h=fract(sin(dot(cell,vec3(127.1,311.7,74.7)))*43758.5453);
      c+=vec3(.65,.75,1.)*step(.9992,h)*stars*smoothstep(0.,.18,d.y);
      gl_FragColor=vec4(c,1.); #include <colorspace_fragment>
      }`.replace(" #include", "\n#include"),
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    view.scene.add(this.sky);
  }
  apply(hour, config, force = false, dt = 0) {
    const v = this.view;
    if (!config?.enabled) {
      this.sky.visible = false;
      this.moon.intensity = 0;
      this.sun.position.copy(this.sun.target.position).add(new T.Vector3(-38, 65, 26));
      this.sun.color.set("#ffe5b3");
      this.sun.intensity = 3.2;
      this.hemi.color.set("#d9e9ef");
      this.hemi.groundColor.set("#354233");
      this.hemi.intensity = 2.6;
      v.scene.background?.set(v.project.world.sky);
      v.scene.fog?.color.set(v.project.world.sky);
      if (force) v.invalidate(true);
      return;
    }
    this.sky.visible = true;
    const s = skyState(hour),
      u = this.sky.material.uniforms;
    u.sunDir.value.set(...s.direction).normalize();
    this.sun.position.copy(u.sunDir.value).multiplyScalar(90).add(this.sun.target.position);
    this.moon.position.copy(u.sunDir.value).multiplyScalar(-90);
    this.sun.intensity = s.sun;
    this.moon.intensity = s.moon;
    this.sun.color.set("#ffe5b3").lerp(new T.Color("#ff873f"), s.dusk * 0.85);
    this.hemi.intensity = s.ambient * (v.project.world.landscape?.enabled ? .48 : 1);
    this.hemi.color.set("#263d68").lerp(new T.Color("#d9e9ef"), s.daylight);
    this.hemi.groundColor
      .set("#111522")
      .lerp(new T.Color("#354233"), s.daylight);
    u.top.value.set("#020610").lerp(new T.Color("#398bc4"), s.daylight);
    u.horizon.value
      .set("#101a2c")
      .lerp(new T.Color(v.project.world.sky), s.daylight)
      .lerp(new T.Color("#e99566"), s.dusk * 0.65);
    u.sunPower.value = s.sun / 3.2;
    u.stars.value = s.stars;
    u.night.value = s.moon / 0.22;
    const blood = this.view.redMoonActive ? 1 : 0;
    u.blood.value = blood;
    this.moon.color.set(blood ? "#ff4937" : "#a9c5ff");
    this.moon.intensity *= blood ? 2.5 : 1;
    if (blood) {
      u.top.value.lerp(new T.Color("#25070d"), 0.7);
      u.horizon.value.lerp(new T.Color("#5d191c"), 0.75);
      this.hemi.color.lerp(new T.Color("#b54843"), 0.65);
      this.hemi.intensity = Math.max(0.48, this.hemi.intensity);
    }
    v.scene.fog?.color.copy(u.horizon.value);
    v.scene.background?.copy(u.top.value);
    this.followCamera();
    this.shadowTime += dt;
    const shadows = force || this.shadowTime >= 0.25;
    if (shadows) this.shadowTime = 0;
    v.invalidate(shadows);
  }
  followCamera() {
    this.sky.position.copy(this.view.camera.position);
  }
  dispose() {
    this.sky.removeFromParent();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.moon.removeFromParent();
  }
}
