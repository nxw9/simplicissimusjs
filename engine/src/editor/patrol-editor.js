import * as T from "three";
import { heightAt } from "../core/terrain.js";
import { PATROL_LIMIT } from "../core/patrol.js";
import { enemyConfig } from "../core/enemy.js";

export function patrolInspector({box, entity, project, tools, element, field, commit, refresh}) {
  if (!entity || !["enemy", "npc"].includes(entity.kind)) {
    box.append(element("p", "Выберите врага или NPC, затем откройте его маршрут."));
    return;
  }
  const route = entity.patrol;
  const update = async fn => {
    tools.patrolPointIndex = null;
    const next = structuredClone(project), actor = next.entities.find(e => e.id === entity.id);
    fn(actor);
    await commit(next);
  };
  box.append(element("h3", `Маршрут · ${entity.name}`), element("p",
    tools.patrolPointIndex == null
      ? "Щёлкайте по земле: точки соединяются в порядке добавления. Первый маршрут начинается у врага."
      : `Щёлкните по земле, чтобы перенести точку ${tools.patrolPointIndex+1}.`, "inspector-hint"));
  const add = element("button", "＋ Добавлять точки на карте", "primary");
  add.id = "patrol-add";
  add.onclick = () => {tools.patrolPointIndex = null; refresh();};
  box.append(add);
  if (route) {
    const enabled = element("label", " Патрулировать", "check"), check = element("input");
    check.id = "patrol-enabled"; check.type = "checkbox"; check.checked = route.enabled;
    check.onchange = () => update(e => {e.patrol.enabled = check.checked;});
    enabled.prepend(check); box.append(enabled);
    const label = element("label", "Режим движения", "field"), mode = element("select");
    mode.id = "patrol-mode";
    for (const [value, text] of [["pingpong","Туда-обратно"],["loop","По кругу"],["once","Один проход"]]) {
      const option = element("option",text); option.value = value; mode.append(option);
    }
    mode.value = route.mode; mode.onchange = () => update(e => {e.patrol.mode = mode.value;});
    label.append(mode); box.append(label);
    const pause = field(box, "Пауза в каждой точке, с", route.pause, "number", v => update(e => {e.patrol.pause = Number(v);}));
    pause.id = "patrol-pause"; pause.min=0; pause.max=60; pause.step=.5;
    const speed = field(box, "Скорость, м/с", enemyConfig(entity).speed, "number", v => update(e => {e.enemy = {...enemyConfig(e), speed:Number(v)};}));
    speed.id = "patrol-speed"; speed.min=0; speed.max=10; speed.step=.1;
    box.append(element("h4", `Точки: ${route.points.length} / ${PATROL_LIMIT}`));
    const list = element("div", "", "patrol-points");
    route.points.forEach((point,index) => {
      const row = element("div", "", "patrol-point");
      row.dataset.patrolPoint = index;
      row.append(element("b", String(index+1)));
      for (const [axis, name] of [[0,"X"],[1,"Z"]]) {
        const input = field(row, name, +point[axis].toFixed(2), "number", v => update(e => {e.patrol.points[index][axis] = Number(v);}));
        input.step=.5; input.min=-project.world.size/2; input.max=project.world.size/2;
        input.setAttribute("aria-label", `Точка ${index+1}, ${name}`);
      }
      for (const [text, title, action, disabled] of [
        ["◎","Перенести точку щелчком",() => {tools.patrolPointIndex=index; refresh();},false],
        ["↑","Выше в порядке маршрута",() => update(e => {const p=e.patrol.points; [p[index-1],p[index]]=[p[index],p[index-1]];}),index===0],
        ["↓","Ниже в порядке маршрута",() => update(e => {const p=e.patrol.points; [p[index+1],p[index]]=[p[index],p[index+1]];}),index===route.points.length-1],
        ["×","Удалить точку",() => update(e => {e.patrol.points.splice(index,1); if(e.patrol.points.length<2)delete e.patrol;}),false],
      ]) {
        const button=element("button",text); button.title=title; button.setAttribute("aria-label",`${title} ${index+1}`);
        button.disabled=disabled; button.onclick=action; row.append(button);
      }
      list.append(row);
    });
    box.append(list);
    const clear=element("button","Убрать весь маршрут"); clear.id="patrol-clear";
    clear.onclick=()=>update(e=>{delete e.patrol;}); box.append(clear);
  }
  box.append(element("small", "В бою маршрут приостанавливается; после боя враг идёт к текущей точке. Точки задавайте по свободной земле: стены и крутые склоны блокируют движение. Ctrl/⌘+Z отменяет правку. При запуске игры патруль начинается сначала."));
  const done=element("button","✓ Закончить маршрут"); done.id="patrol-done";
  done.onclick=()=>tools.setMode("move"); box.append(done);
}

/** Editor-only terrain-following arrows and numbered waypoint labels. */
export class PatrolGuide {
  constructor(view) {
    this.view=view; this.labels=[];
    this.line=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x7de6d7,depthTest:false,fog:false}));
    this.line.renderOrder=24; this.line.frustumCulled=false; this.line.raycast=()=>{};
    view.scene.add(this.line); this.line.visible=false;
  }
  set(entity,world) {
    this.labels.forEach(l=>l.node.remove()); this.labels=[];
    this.line.geometry.dispose(); this.line.geometry=new T.BufferGeometry();
    const route=entity?.patrol;
    this.line.visible=!!route&&!this.view.playing;
    if(!route)return;
    this.line.material.color.set(route.enabled?0x7de6d7:0x9da4a5);
    const points=route.points, vertices=[];
    const at=([x,z])=>[x,heightAt(world,x,z)+.18,z];
    const segment=(a,b)=>vertices.push(...at(a),...at(b));
    for(let i=0;i<points.length;i++) {
      const a=points[i], b=points[i+1]??(route.mode==="loop"?points[0]:null);
      if(b) {
        const dx=b[0]-a[0], dz=b[1]-a[1], length=Math.hypot(dx,dz), count=Math.min(512,Math.max(1,Math.ceil(length/.75)));
        for(let j=0;j<count;j++)segment([a[0]+dx*j/count,a[1]+dz*j/count],[a[0]+dx*(j+1)/count,a[1]+dz*(j+1)/count]);
        if(length>.5) {
          const x=a[0]+dx*.6,z=a[1]+dz*.6,s=Math.min(1,length*.15),ux=dx/length,uz=dz/length;
          segment([x,z],[x-ux*s-uz*s*.55,z-uz*s+ux*s*.55]);
          segment([x,z],[x-ux*s+uz*s*.55,z-uz*s-ux*s*.55]);
        }
      }
      for(let j=0;j<16;j++)segment([a[0]+.4*Math.cos(j*Math.PI/8),a[1]+.4*Math.sin(j*Math.PI/8)], [a[0]+.4*Math.cos((j+1)*Math.PI/8),a[1]+.4*Math.sin((j+1)*Math.PI/8)]);
      const node=document.createElement("span"); node.className="patrol-label";node.textContent=i+1;node.hidden=true;
      this.view.renderer.domElement.parentElement?.append(node);
      this.labels.push({node,position:new T.Vector3(...at(a)).add(new T.Vector3(0,.5,0))});
    }
    this.line.geometry.setAttribute("position",new T.Float32BufferAttribute(vertices,3));
    this.view.invalidate?.(); this.update();
  }
  update() {
    const visible=this.line.visible&&!this.view.playing;
    const rect=this.view.renderer.domElement.getBoundingClientRect();
    this.view.camera.updateMatrixWorld();
    for(const label of this.labels) {
      const p=label.position.clone().project(this.view.camera);
      label.node.hidden=!visible||p.z < -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;
      if(!label.node.hidden) {label.node.style.left=`${(p.x+1)*rect.width/2}px`;label.node.style.top=`${(1-p.y)*rect.height/2}px`;}
    }
  }
}
