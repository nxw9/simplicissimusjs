import { transformEntities } from "../core/bulk-edit.js";

export function bulkEditor({box, project, ids, element, field, commit, remove}) {
  box.append(element("h3", `Выбрано объектов: ${ids.length}`), element("p", "G — двигать группу, R — повернуть, S — равномерно изменить размер. Ctrl/⌘ + щелчок добавляет или убирает объект; Shift в списке выделяет диапазон.", "inspector-hint"));
  const delta=[0,0,0]; let factor=1, spread=true;
  box.append(element("h4", "Сместить всю группу"));
  for(const [i,axis] of ["X","Y","Z"].entries()) {const input=field(box,`Смещение ${axis}, м`,0,"number",v=>delta[i]=v);input.id=`bulk-offset-${i}`;}
  const move=element("button","Применить смещение","primary");move.id="bulk-move";
  const error=element("p","","wizard-error");error.setAttribute("role","alert");
  const apply=async options=>{try{await commit(transformEntities(project,ids,options));}catch(e){error.textContent=e.message;}};
  move.onclick=()=>apply({delta});box.append(move,element("h4","Изменить размер"));
  const size=field(box,"Множитель размера (1 = без изменений)",1,"number",v=>factor=v);size.id="bulk-factor";size.min="0.001";size.step="0.1";
  const label=element("label"," Масштабировать расстояния между объектами","check"),check=element("input");check.type="checkbox";check.checked=true;check.id="bulk-spread";check.onchange=()=>spread=check.checked;label.prepend(check);box.append(label);
  const scale=element("button","Применить масштаб","primary");scale.id="bulk-scale";scale.onclick=()=>apply({factor,spread});box.append(scale,error);
  box.append(element("p","Смещение и размер применяются одним действием. Ctrl/⌘+Z отменяет всю операцию.","inspector-hint"));
  const del=element("button",`Удалить ${ids.length} объектов · Delete`,"danger");del.id="bulk-delete";del.onclick=remove;box.append(del);
}
