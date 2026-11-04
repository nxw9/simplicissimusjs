import { worldBounds, terrainBounds, insideWorld, validateWorldBounds } from "../core/world-bounds.js";
const el=(tag,text="")=>{const n=document.createElement(tag);n.textContent=text;return n;};
const fmt=n=>Number(n.toFixed(2)).toLocaleString("ru-RU");
export function boundaryEditor({project,view,modal,commit,focusObject,expand}) {
  const box=el("div"),world=structuredClone(project.world),bounds=structuredClone(worldBounds(world)??terrainBounds(world)),guides=view.editorGuides;
  box.className="boundary-editor";
  box.append(el("p","Невидимая стена включается и настраивается только здесь. Без ограничения край рельефа не блокирует движение. «Расширить карту» меняет только рельеф; области кисти и событий также не создают стен."));
  const row=el("label","Доступная территория"),mode=el("select");row.className="field";mode.id="boundary-mode";
  for(const [value,title]of [["none","Без ограничения движения"],["custom","Свои границы · четыре стороны"]]){const o=el("option",title);o.value=value;mode.append(o);}
  mode.value=world.playBounds?"custom":"none";row.append(mode);box.append(row);
  const inputs=[];
  for(const [key,index,title]of [["min",0,"Запад · X минимум"],["max",0,"Восток · X максимум"],["min",1,"Север · Z минимум"],["max",1,"Юг · Z максимум"]]) {
    const label=el("label",title+", м"),input=el("input");label.className="field";
    Object.assign(input,{type:"number",step:1,min:-world.size/2,max:world.size/2,value:bounds[key][index]});input.id=`boundary-${key}-${index}`;
    input.oninput=()=>{bounds[key][index]=input.value===""?NaN:Number(input.value);draw();};label.append(input);box.append(label);inputs.push(input);
  }
  const preview=el("div"),info=el("p"),error=el("p");preview.className="world-size-preview";error.className="wizard-error";error.setAttribute("role","alert");
  const apply=el("button","Применить границы");apply.id="boundary-apply";apply.className="primary";
  function draw() {
    world.playBounds=mode.value==="custom"?structuredClone(bounds):null;
    for(const input of inputs)input.disabled=mode.value!=="custom";
    try {
      const b=worldBounds(world)??terrainBounds(world);if(![...b.min,...b.max].every(Number.isFinite))throw Error("Введите координаты всех четырёх сторон.");validateWorldBounds(world);
      const x=v=>20+(v/world.size+.5)*220,y=x,w=(b.max[0]-b.min[0])/world.size*220,h=(b.max[1]-b.min[1])/world.size*220;
      preview.innerHTML=`<svg viewBox="0 0 260 270" role="img" aria-label="Доступная область внутри карты, север сверху"><rect x="20" y="20" width="220" height="220" fill="#26343e" stroke="#60717c"/>${world.playBounds?`<rect x="${x(b.min[0])}" y="${y(b.min[1])}" width="${w}" height="${h}" fill="#234a56" stroke="#64d7f2" stroke-width="2"/>`:""}<circle cx="${x(world.spawn[0])}" cy="${y(world.spawn[2])}" r="4" fill="#efd483"/><text x="130" y="14" text-anchor="middle" fill="#d3e5ec" font-size="12">Север −Z</text><text x="130" y="258" text-anchor="middle" fill="#d3e5ec" font-size="12">Юг +Z · точка — старт игрока</text></svg>`;
      const outside=project.entities.filter(e=>!insideWorld(world,e.position[0],e.position[2],0)).length;
      info.textContent=world.playBounds?`Доступно ${fmt(b.max[0]-b.min[0])} × ${fmt(b.max[1]-b.min[1])} м. До стены остаётся 0,4 м для тела игрока. Объектов за границей: ${outside}.`:"Ограничение выключено. Серый квадрат показывает размер созданного рельефа, а не стену. Игрок может выйти за его край.";
      error.textContent="";apply.disabled=false;if(guides){guides.previewWorld=world;guides.set({bounds:true});}
    }catch(e){error.textContent=e.message;apply.disabled=true;preview.replaceChildren();info.textContent="";}
  }
  mode.onchange=draw;box.append(preview,info,error);
  const full=el("button","Поставить границу по краю рельефа");full.id="boundary-reset";full.onclick=()=>{Object.assign(bounds,terrainBounds(world));mode.value="custom";inputs.forEach(i=>{const [,key,axis]=i.id.split("-");i.value=bounds[key][Number(axis)];});draw();};
  const clear=el("button","Убрать ограничение");clear.id="boundary-clear";clear.onclick=()=>{mode.value="none";draw();};
  const grow=el("button","Нужна территория снаружи? Расширить карту");grow.onclick=()=>{document.querySelector("#modal").close();expand?.();};
  box.append(clear,full,grow,el("p","Если проход внутри голубой границы закрыт: включите «Преграды». Оранжевые объёмы показывают, какие части объектов мешают движению. Крутой склон также блокирует подъём; его можно сгладить."));
  const label=el("label","Показать преграды объектов"),check=el("input");check.type="checkbox";check.id="boundary-collisions";check.checked=!!guides?.showCollisions;
  check.onchange=()=>guides?.set({collisions:check.checked});label.prepend(check);box.append(label);
  const search=el("input");search.placeholder="Найти препятствие по имени…";search.setAttribute("aria-label","Найти объект с коллизией");
  const list=el("div");list.className="boundary-obstacles";box.append(search,list);
  function drawList(){list.replaceChildren();const solid=project.entities.filter(e=>e.solid&&e.kind!=="enemy"&&e.name.toLowerCase().includes(search.value.toLowerCase()));for(const e of solid.slice(0,40)){const button=el("button",`${e.name} · ${e.collision==="box"?"один объём":e.collision==="trunk"?"ствол":"по частям"}`);button.onclick=()=>{document.querySelector("#modal").close();focusObject?.(e.id);};list.append(button);}if(solid.length>40)list.append(el("small",`Показано 40 из ${solid.length}. Уточните имя.`));}
  search.oninput=drawList;drawList();box.append(apply);
  apply.onclick=async()=>{apply.disabled=true;try{const next=structuredClone(project);next.world.playBounds=world.playBounds;validateWorldBounds(next.world);if(await commit(next))document.querySelector("#modal").close();}catch(e){error.textContent=e.message;}finally{apply.disabled=false;}};
  draw();modal("Границы карты · невидимая стена",box);
  document.querySelector("#modal").classList.add("preview-dialog");
  document.querySelector("#modal").addEventListener("close",()=>{if(guides){guides.previewWorld=null;guides.refresh();guides.onChange?.();}},{once:true});
}
