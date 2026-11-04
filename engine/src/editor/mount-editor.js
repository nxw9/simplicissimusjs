import * as T from "three";
import { defaultMount, MountSchema, mountEyeOffset } from "../core/mount.js";
import { createEntityObject } from "../render/world.js";
import { MountAnimation } from "../render/mount.js";
import { stopEnemyPreview } from "./enemy-editor.js";

const el = (tag, text = "") => {const n = document.createElement(tag); n.textContent = text; return n;};
export function mountEditor({project, view, modal, commit, importModel}) {
  stopEnemyPreview(view);
  const p = structuredClone(project), entity = p.entities.find(e => e.id === p.rpg?.services.horse);
  const box = el("div"); box.className = "event-editor";
  if (!entity) {box.append(el("p", "Сначала назначьте маунта в правилах RPG проекта.")); modal("Маунт", box); return;}
  const c = p.rpg.mount = structuredClone(p.rpg.mount ?? defaultMount());
  let asset = entity.shape === "model" ? entity.assetId : "", moving = false, preview = null, animation, marker;
  const original = view.objects.get(entity.id), wasVisible = original?.visible;
  const error = el("p"); error.className = "wizard-error"; error.setAttribute("role", "alert");
  const select = (label, value, options, change, id) => {
    const row = el("label", label), s = el("select"); row.className = "field"; if (id) s.id = id;
    for (const [v,t] of options) {const option = el("option", t); option.value = v; s.append(option);}
    s.value = value; s.onchange = () => {change(s.value); refresh();}; row.append(s); box.append(row); return s;
  };
  const number = (label, value, set, min, max, step = 0.05, id) => {
    const row = el("label", label), i = el("input"); row.className = "field";
    Object.assign(i, {type: "number", value, min, max, step}); if (id) i.id = id;
    i.oninput = () => {set(Number(i.value)); refresh();}; row.append(i); box.append(row);
  };
  box.append(el("p", `Маунт: ${entity.name}. GLB может содержать скелет и анимации. Высота задаётся в метрах; размер объекта будет приведён к 1. Седло задаётся относительно центра модели у земли, вперёд — +Z.`));
  select("Модель маунта", asset, [["", "— Выберите GLB —"], ...p.assets.map(a => [a.id, a.name])], v => {
    asset = v; c.idle = null; c.walk = view.assetModels.get(v)?.animations.find(c => /walk|run|ход|бег/i.test(c.name))?.name ?? null; updateClips();
  }, "mount-model");
  const add = el("button", "＋ Импортировать модель маунта GLB"); add.id = "mount-import"; add.disabled = !importModel;
  add.onclick = async () => {if (!asset || await save()) {document.querySelector("#modal").close(); importModel(entity.id, "mount");}};
  box.append(add);
  number("Высота модели, м", c.height, v => c.height = v, 0.3, 12, 0.05, "mount-height");
  number("Поворот модели вперёд, °", c.facing * 180 / Math.PI, v => c.facing = v * Math.PI / 180, -360, 360, 5, "mount-facing");
  for (const [i, label] of ["X · вправо", "Y · высота седла", "Z · вперёд"].entries())
    number(`Посадка ${label}, м`, c.seat[i], v => c.seat[i] = v, i === 1 ? 0.1 : -5, i === 1 ? 12 : 5, 0.05, `mount-seat-${i}`);
  number("Глаза над седлом, м", c.eyeHeight, v => c.eyeHeight = v, 0.2, 2, 0.05, "mount-eye-height");
  number("Скорость шага, м/с", c.speed, v => c.speed = v, 1, 30, 0.5, "mount-speed");
  number("Скорость бега, м/с", c.sprint, v => c.sprint = v, 1, 40, 0.5, "mount-sprint");
  const animations = el("div"); box.append(animations);
  function updateClips() {
    animations.replaceChildren();
    for (const [key, title] of [["idle", "Покой"], ["walk", "Движение"]]) {
      const row = el("label", title), s = el("select"); row.className = "field"; s.id = `mount-${key}`;
      for (const [value, label] of [["", "Без анимации"], ...(view.assetModels.get(asset)?.animations ?? []).map(a => [a.name,a.name])]) {
        const option = el("option", label); option.value = value; s.append(option);
      }
      s.value = c[key] ?? ""; s.onchange = () => {c[key] = s.value || null; refresh();}; row.append(s); animations.append(row);
    }
  }
  updateClips();
  const label = el("label", " Показывать модель во время езды"), show = el("input"); label.className = "check";
  show.type = "checkbox"; show.checked = c.showWhileRiding; show.onchange = () => c.showWhileRiding = show.checked;
  label.prepend(show); box.append(label);
  box.append(el("p", "Золотое кольцо показывает седло, точка выше — положение глаз. Анимация движения должна быть на месте, без перемещения корневой кости: перемещением управляет игра. Это наземная езда; для боя нужно спешиться."));
  const clean = () => {
    animation?.dispose(); animation = null;
    preview?.removeFromParent(); preview = null;
    marker?.traverse(n => {n.geometry?.dispose(); n.material?.dispose();}); marker = null;
    if (original) original.visible = wasVisible;
    view.invalidate(true);
  };
  const stagedEntity = () => ({...entity, shape: "model", assetId: asset, scale: [1,1,1], solid: false});
  function renderPreview() {
    const config = MountSchema.parse(c);
    if (!view.assetModels.has(asset)) throw Error("Выберите или импортируйте модель GLB.");
    clean();
    preview = createEntityObject(stagedEntity(), view.assetModels, [], undefined, config);
    original.parent.add(preview); original.visible = false;
    marker = new T.Group();
    const ring = new T.Mesh(new T.TorusGeometry(0.25, 0.012, 6, 28), new T.MeshBasicMaterial({color: 0xe8b65f, depthTest: false}));
    ring.rotation.x = Math.PI / 2; marker.add(ring);
    const eye = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), new T.MeshBasicMaterial({color: 0xffffff, depthTest: false}));
    eye.position.y = config.eyeHeight; marker.add(eye); marker.position.set(...config.seat); preview.add(marker);
    animation = new MountAnimation(preview.userData.mountModel, preview.userData.mountClips, config);
    view.previewCleanup = clean;
    view.editorPreview = dt => {animation?.update(dt, moving); view.invalidate(true);};
    view.invalidate(true); error.textContent = "";
  }
  function refresh() {if (preview) try {renderPreview();} catch (e) {error.textContent = e.message;}}
  const start = el("button", "▶ Модель и посадка"), walk = el("button", "▶ Движение"), idle = el("button", "Покой"), eye = el("button", "Вид из седла"), stop = el("button", "Закончить просмотр");
  start.id = "mount-preview"; walk.id = "mount-preview-walk"; eye.id = "mount-preview-eye"; stop.id = "mount-stop";
  function focus() {
    view.orbit.target.copy(preview.position).add(new T.Vector3(0, c.height * 0.5, 0));
    view.camera.position.copy(preview.position).add(new T.Vector3(c.height * 1.7, c.height, c.height * 2)); view.orbit.update?.();
  }
  function begin() {try {renderPreview(); document.querySelector("#modal").classList.add("preview-dialog"); return true;} catch (e) {error.textContent = e.message; return false;}}
  start.onclick = () => {moving = false; if (begin()) focus();};
  walk.onclick = () => {moving = true; if (begin()) focus();};
  idle.onclick = () => {moving = false;};
  eye.onclick = () => {
    if (!begin()) return;
    marker.visible = false;
    const yaw = entity.rotation[1], offset = mountEyeOffset(c, yaw);
    view.camera.position.copy(preview.position).add(new T.Vector3(...offset));
    view.orbit.target.copy(view.camera.position).add(new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(5)); view.orbit.update?.();
  };
  stop.onclick = () => stopEnemyPreview(view);
  async function save() {
    try {
      p.rpg.mount = MountSchema.parse(c);
      if (!asset) throw Error("Выберите модель маунта.");
      Object.assign(entity, stagedEntity()); delete entity.motion; delete entity.moonOnly;
      return await commit(p);
    } catch (e) {error.textContent = e.message; return false;}
  }
  const saveButton = el("button", "Сохранить маунта"); saveButton.id = "mount-save"; saveButton.className = "primary";
  saveButton.onclick = async () => {if (await save()) document.querySelector("#modal").close();};
  box.append(start, walk, idle, eye, stop, error, saveButton); modal("Маунт · модель и посадка", box);
}
