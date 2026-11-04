import { LANDSCAPE_DEFAULTS, SPECIES } from "../core/landscape.js";
export function landscapeEditor({project,element,modal,commit}) {
  const cfg={...LANDSCAPE_DEFAULTS,...project.world.landscape},box=element("div","","enemy-editor");
  box.append(element("p","Трава следует материалу земли: растёт на траве и почве, оставляет свободными камень, тропы, воду и места вокруг объектов. Деревья остаются отдельными редактируемыми объектами."));
  const fields={};
  for(const [key,label,min,max,step] of [
    ["enabled","Травяной покров",0,1,1],["density","Густота травы",0,1,.05],
    ["wind","Сила ветра",0,2,.05],["haze","Дымка вдали",0,1,.05],["seed","Вариант размещения",0,2147483647,1],
  ]) {
    const row=element("label",label,"field"),input=element("input");input.id="landscape-"+key;
    input.type=key==="enabled"?"checkbox":"number";input.min=min;input.max=max;input.step=step;
    if(key==="enabled")input.checked=cfg[key];else input.value=cfg[key];fields[key]=input;row.append(input);box.append(row);
  }
  const error=element("p","","wizard-error"),save=element("button","✓ Сохранить ландшафт","primary");save.id="landscape-save";
  save.onclick=async()=>{
    try {
      const next=structuredClone(project);next.world.landscape={};
      for(const [k,input] of Object.entries(fields))next.world.landscape[k]=k==="enabled"?input.checked:Number(input.value);
      if(await commit(next))document.querySelector("#modal").close();
    }catch(e){error.textContent=e.message;}
  };
  box.append(element("small","«Минимальное» и «Низкое» отключают траву, тени и облака, снижают разрешение и детализацию вдали. «Быстрое» оставляет немного травы без теней. Тени: 1024 px на сбалансированном, 2048 px на высоком."),error,save);
  modal("♧ Ландшафт и атмосфера",box);
}
export function vegetationFields({entity,box,element,commit,project}) {
  if(entity.shape!=="tree")return;
  const row=element("label","Порода дерева","field"),select=element("select");select.id="tree-species";
  for(const [id,name] of Object.entries(SPECIES)){const o=element("option",name);o.value=id;select.append(o);}
  select.value=entity.vegetation?.species??"oak";row.append(select);box.append(row);
  const seedRow=element("label","Вариант кроны (0–3)","field"),seed=element("input");seed.id="tree-seed";seed.type="number";seed.min=0;seed.max=3;seed.step=1;seed.value=(entity.vegetation?.seed??0)%4;seedRow.append(seed);box.append(seedRow);
  const save=async()=>{const next=structuredClone(project),e=next.entities.find(x=>x.id===entity.id);e.vegetation={species:select.value,seed:Number(seed.value)};await commit(next);};
  select.onchange=save;seed.onchange=save;
}
