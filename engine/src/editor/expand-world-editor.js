import { expansionPlan, expansionLimit, expandWorld } from "../core/expand-world.js";
const el=(tag,text="")=>{const n=document.createElement(tag);n.textContent=text;return n;};
const fmt=n=>Number(n.toFixed(2)).toLocaleString("ru-RU");
export function expandWorldEditor({project,modal,commit,onExpanded}) {
  const box=el("div"), current=project.world.size,limit=expansionLimit(project.world);box.className="expand-world-editor";
  box.append(el("p",`Основная карта сейчас: ${fmt(current)} × ${fmt(current)} м.`));
  const label=el("label","Новый размер стороны карты, м"),size=el("input");label.className="field";
  Object.assign(size,{type:"number",min:current, max:limit, step:"any",value:Math.min(limit,current*1.25)});size.id="world-new-size";label.append(size);box.append(label);
  const presets=el("div");presets.className="button-row";
  for(const ratio of [1.25,1.5,2]) {const b=el("button",`+${Math.round((ratio-1)*100)}%`);b.disabled=current*ratio>limit+1e-7;b.onclick=()=>{size.value=current*ratio;draw();};presets.append(b);}
  box.append(presets);
  const preview=el("div");preview.className="world-size-preview";preview.setAttribute("aria-label","Предпросмотр границ карты");box.append(preview);
  const info=el("p"), grid=el("p");grid.className="inspector-hint";box.append(info,grid);
  const fillLabel=el("label","Чем заполнить новую территорию"),fill=el("select");fillLabel.className="field";fill.id="world-expansion-fill";
  for(const [v,t] of [["land","Земля"],["water","Морское дно"],["edge","Продолжить высоту старого края"]]) {const o=el("option",t);o.value=v;fill.append(o);}
  fillLabel.append(fill);box.append(fillLabel);
  const heightLabel=el("label","Высота новой территории, м"),height=el("input");heightLabel.className="field";
  Object.assign(height,{type:"number",min:-80,max:80,step:0.5,value:project.rpg?project.rpg.water.height+2:0});height.id="world-expansion-height";heightLabel.append(height);box.append(heightLabel);
  fill.onchange=()=>{height.disabled=fill.value==="edge";height.value=fill.value==="water"?(project.rpg?.water.height??0)-8:project.rpg?project.rpg.water.height+2:0;draw();};
  box.append(el("p","Новая территория добавляется со всех четырёх сторон. Существующие высоты, покрытие, объекты, старт игрока и области событий сохраняются. Ширина округляется до целых клеток; карту можно отменить через Ctrl/⌘+Z."));
  box.append(el("p",project.world.playBounds?"Задана явная граница игрока. Расширение меняет только рельеф; граница останется на своих координатах. Изменить или отключить её можно в «Границы карты».":"Ограничение движения выключено. Расширение добавит рельеф и не создаст невидимых стен. Граница включается только в «Границы карты»."));
  const error=el("p");error.className="wizard-error";error.setAttribute("role","alert");
  const apply=el("button","Расширить основную карту");apply.className="primary";apply.id="world-expand-apply";
  function draw() {
    try {
      const p=expansionPlan(project.world,Number(size.value)),ratio=current/p.size,w=200*ratio,x=(260-w)/2,y=(220-w)/2;
      preview.innerHTML=`<svg viewBox="0 0 260 250" role="img" aria-label="Прежняя карта внутри новой"><rect x="30" y="10" width="200" height="200" fill="${fill.value==="water"?'#244c67':'#365e46'}" stroke="#85c9a0" stroke-width="2"/><rect x="${x}" y="${y}" width="${w}" height="${w}" fill="#25303d" stroke="#e7c77b" stroke-width="2"/><text x="130" y="104" text-anchor="middle" fill="#f2e4c4" font-size="12">Текущая карта</text><text x="130" y="124" text-anchor="middle" fill="#f2e4c4" font-size="14">${fmt(current)} × ${fmt(current)} м</text><text x="130" y="236" text-anchor="middle" fill="#c8e7d4" font-size="12">Новый рельеф: ${fmt(p.size)} × ${fmt(p.size)} м</text></svg>`;
      info.textContent=`Добавится по ${fmt(p.addedPerSide)} м с каждой стороны. Площадь увеличится в ${(p.size*p.size/(current*current)).toFixed(2)} раза.`;
      grid.textContent=`Детализация рельефа сохранится: ${fmt(p.step)} м на клетку. Размер данных вырастет; дальние участки по-прежнему упрощаются и скрываются. Предел для этой карты: ${fmt(limit)} м.`;
      error.textContent="";apply.disabled=false;
    } catch(e) {error.textContent=e.message;apply.disabled=true;info.textContent="";preview.replaceChildren();}
  }
  size.oninput=draw;
  apply.onclick=async()=>{
    apply.disabled=true;
    try {
      const result=expandWorld(project,{size:Number(size.value),fill:fill.value,height:Number(height.value),material:fill.value==="water"?3:1});
      if(await commit(result.project)){document.querySelector("#modal").close();onExpanded?.(result);}
    } catch(e){error.textContent=e.message;}
    finally {apply.disabled=false;}
  };
  box.append(error,apply);draw();modal("Расширить основную карту",box);
}
