import castleWallURL from "../assets/models/castle-wall.glb?url&inline";
export const castleWallAsset = {
  id: "hearth_castle_wall", name: "Замковая стена · Meshy",
  data: castleWallURL.replace(/^data:[^;]+;/, "data:model/gltf-binary;"),
};

export function wallInspector({box, settings, element, field, changed, undo}) {
  box.append(element("h3", "▤ Постройка стен"));
  box.append(element("p", "Зажмите ЛКМ и ведите по земле. Отпустите, чтобы построить стену. Область рельефа выделять не нужно.", "inspector-hint"));
  const label = element("label", "Вид стены", "field"), model = element("select");
  model.id = "wall-model";
  for (const [value, title] of [["castle", "Замковая · ваша GLB-модель"], ["stone", "Каменные блоки"]]) {
    const option = element("option", title); option.value = value; model.append(option);
  }
  model.value = settings.model; label.append(model); box.append(label);
  model.onchange = () => {settings.model = model.value; changed();};
  const width = field(box, "Ширина кисти / толщина стены, м", settings.width, "range", () => {});
  width.id = "wall-width"; width.min = .25; width.max = 30; width.step = .25;
  const widthValue = element("output", `${settings.width} м`); box.append(widthValue);
  width.oninput = () => {settings.width = Number(width.value); widthValue.textContent = `${settings.width} м`; changed();};
  const height = field(box, "Высота над землёй, м", settings.height, "number", value => {
    settings.height = Math.max(.5,Math.min(40,Number.isFinite(value) ? value : 4)); height.value = settings.height; changed();
  });
  height.id = "wall-height"; height.min = .5; height.max = 40; height.step = .5;
  const modes = element("div", "", "wall-mode-buttons");
  const free = element("button", "⌁ Свободно"), line = element("button", "╱ Прямая");
  free.id = "wall-mode-free"; line.id = "wall-mode-line"; modes.append(free,line); box.append(modes);
  const angleLabel = element("label", " Зафиксировать угол", "check"), lock = element("input");
  lock.type = "checkbox"; lock.id = "wall-angle-lock"; lock.checked = settings.lockAngle;
  angleLabel.prepend(lock); box.append(angleLabel);
  const angle = field(box, "Угол, ° (0° — X, 90° — Z)", settings.angle, "number", value => {
    settings.angle = ((Number.isFinite(value) ? value : 0) % 360 + 360) % 360;
    angle.value = settings.angle; changed();
  });
  angle.id = "wall-angle"; angle.step = 1;
  const presets = element("div", "", "wall-angle-presets");
  for (const value of [0,45,90,135]) {
    const b = element("button", `${value}°`);
    b.onclick = () => {settings.angle = value; settings.straight = true; settings.lockAngle = true; lock.checked = true; angle.value = value; sync(); changed();};
    presets.append(b);
  }
  box.append(presets);
  function sync() {
    free.setAttribute("aria-pressed", String(!settings.straight)); line.setAttribute("aria-pressed", String(settings.straight));
    lock.disabled = !settings.straight; angle.disabled = !settings.straight || !settings.lockAngle;
  }
  free.onclick = () => {settings.straight = false; sync(); changed();};
  line.onclick = () => {settings.straight = true; sync(); changed();};
  lock.onchange = () => {settings.lockAngle = lock.checked; sync(); changed();};
  sync();
  box.append(element("p", "Прямая: нажмите в начале и тяните к концу — направление свободное. Включите фиксацию для точного угла. L — переключить режим; Shift при начале мазка — временная прямая. Esc — отменить.", "inspector-hint"));
  box.append(element("p", "Секции повторяются вдоль линии и подстраиваются под рельеф. Ширина кисти меняет толщину, высота задаётся отдельно. После постройки секции можно выделять и править как обычные объекты. Один мазок — одна отмена.", "inspector-hint"));
  const back = element("button", "↶ Отменить последний мазок"); back.onclick = undo; box.append(back);
}
