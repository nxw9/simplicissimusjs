import { defaultRanged } from "../core/ranged.js";
export function rangedFields({box, cfg, project, element, field, importAsset}) {
  box.append(element("h3", "5 · Дальний бой и снаряд"));
  const label = element("label", " Стрелять снарядами", "check"), enabled = element("input");
  enabled.type = "checkbox"; enabled.id = "enemy-ranged-enabled"; enabled.checked = !!cfg.ranged;
  label.prepend(enabled); box.append(label);
  const fields = element("div"); box.append(fields);
  const ranged = structuredClone(cfg.ranged ?? defaultRanged());
  const refresh = () => {fields.hidden = !enabled.checked; if (enabled.checked) cfg.ranged = ranged; else delete cfg.ranged;};
  enabled.onchange = refresh; refresh();
  const row = element("label", "Модель снаряда", "field"), select = element("select"); select.id = "enemy-projectile-model";
  for (const a of [{id: "", name: "Встроенная стрела"}, ...project.assets]) {const option = element("option", a.name); option.value = a.id; select.append(option);}
  select.value = ranged.assetId ?? ""; select.onchange = () => ranged.assetId = select.value || null;
  row.append(select); fields.append(row);
  for (const [key, label, min, max, step] of [
    ["range", "Дальность выстрела, м", 3, 100, 1], ["preferredDistance", "Дистанция удержания, м", 1, 100, 1],
    ["speed", "Скорость снаряда, м/с", 2, 120, 1], ["gravity", "Гравитация, м/с² (0 — прямой полёт)", 0, 40, 0.1],
    ["radius", "Радиус попадания, м", 0.02, 1, 0.01], ["length", "Размер модели снаряда, м", 0.05, 6, 0.05],
  ]) {const input = field(fields, label, ranged[key], "number", v => ranged[key] = Number(v)); input.id = "enemy-projectile-" + key; Object.assign(input, {min, max, step});}
  for (const [i, axis] of ["X", "Y", "Z"].entries()) {
    field(fields, `Точка вылета ${axis}, м`, ranged.muzzle[i], "number", v => ranged.muzzle[i] = Number(v));
    field(fields, `Поворот модели снаряда ${axis}, °`, ranged.rotation[i] * 180 / Math.PI, "number", v => ranged.rotation[i] = Number(v) * Math.PI / 180);
  }
  fields.append(element("p", "Модель летит вперёд по +Z. Точка вылета задана в метрах от земли относительно направления врага. Урон, интервал и момент выстрела задаются выше. Снаряд не преследует цель и останавливается о препятствия."));
  const button = element("button", "＋ Импортировать GLB снаряда"); button.id = "enemy-projectile-import"; button.onclick = () => importAsset("projectile"); fields.append(button);
  return {refresh};
}
