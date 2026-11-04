import { BoundaryGuides } from "./boundary-guides.js";
import { DEFAULT_WALL } from "../core/walls.js";
import { castleWallAsset, wallInspector } from "./wall-editor.js";
import { patrolInspector } from "./patrol-editor.js";
import { boundaryEditor } from "./boundary-editor.js";
import { Selection } from "./selection.js";
import { bulkEditor } from "./bulk-editor.js";
import { deleteEntities } from "../core/bulk-edit.js";
import { expandWorldEditor } from "./expand-world-editor.js";
import { createMapEditor } from "./create-map-editor.js";
import { defaultRanged } from "../core/ranged.js";
import { defaultHeldWeapon } from "../render/held-weapon.js";
import {QUALITY_OPTIONS} from "../core/quality.js";
import { landscapeEditor, vegetationFields } from "./landscape-editor.js";
import {
  worldEventsEditor,
  spawnEditor,
  heldWeaponEditor,
  moonDoorEditor,
  bookEditor,
} from "./world-events-editor.js";
import { defaultMount } from "../core/mount.js";
import { mountEditor } from "./mount-editor.js";
import { rpgEditor } from "./rpg-editor.js";
import { generatorEditor } from "./generator-editor.js";
import { itemEditor, characterSettings } from "./character-settings.js";
import { installMobileEditor } from "./mobile.js";
import { exportEditorHTML } from "../core/export-editor.js";
import { videoEditor } from "./video-editor.js";
import { audioEditor } from "./audio-editor.js";
import { decodeGLB } from "../core/assets.js";
import { importOptions, fileData, processModel } from "./model-import.js";
import { dialogueEditor } from "./dialogue-editor.js";
import { questTargets } from "../core/quests.js";
import gameTemplate from "virtual:hearth-game-template";
import { exportGameHTML } from "../core/export-html.js";
import { MATERIALS, paintTerrain } from "../core/materials.js";
import { MATERIAL_URLS } from "../render/materials.js";
import "../style.css";
import { dayNightEditor } from "./day-night-editor.js";
import { enemyConfig, suggestClips } from "../core/enemy.js";
import { npcEditor } from "./npc-editor.js";
import { motionEditor } from "./motion-editor.js";
import { defaultMotion } from "../core/mechanisms.js";
import { questWizard } from "./quest-editor.js";
import { enemyEditor, stopEnemyPreview } from "./enemy-editor.js";
import { Box3, Vector3 } from "three";
import { heightAt, createTerrain, createRegion } from "../core/terrain.js";
import { demoProject } from "../core/demo.js";
import {
  readProject,
  serializeProject,
  createEntity,
} from "../core/project.js";
import { History } from "../core/game.js";
import { draft, download, errorText } from "../core/storage.js";
import { WorldView } from "../render/world.js";
import { SceneTools } from "./tools.js";
import { Session } from "../render/session.js";
const embeddedProject = document.getElementById("hearth-editor-project");
const editorSnapshot = embeddedProject
  ? "<!doctype html>\n" + document.documentElement.outerHTML
  : null;
const $ = (s) => document.querySelector(s);
$("#app").innerHTML = `
<header><div class="brand"><span class="brand-icon">✳</span> HEARTH <small>RPG STUDIO</small></div><div class="project-heading"><span class="status-dot"></span><b id="project-title"></b><span class="version">0.38.0 · ENGINE</span></div><button id="help">Руководство ↗</button></header>
<nav class="toolbar"><div><button id="new">Новый</button><button id="create-map" title="Пустая карта заданного размера без границ движения">＋ Создать карту</button><button id="generate-adventure" class="primary">✦ Создать приключение</button><button id="open">Открыть</button><button id="export">Скачать проект</button><span class="separator"></span><button id="undo" title="Отменить">↶</button><button id="redo" title="Повторить">↷</button></div><div><button id="rpg-settings">RPG · правила</button><button id="day-night-settings">☀ День и ночь</button><button id="world-events-settings">☽ События и стиль</button><button id="landscape-open">⛰ Ландшафт</button><button id="map-boundaries">▱ Границы карты</button><button id="expand-world" class="primary">⤢ Расширить карту</button><button id="environment-open">＋ Объекты окружения</button></div><div><button id="weapon-settings">⚔ Оружие игрока</button><button id="download-editor" title="Редактор вместе с текущим проектом, без установки">Скачать редактор HTML</button><button id="build">Скачать игру HTML</button><button id="play" class="primary">▶ Играть</button></div></nav>
<main class="studio"><aside class="hierarchy"><div class="panel-heading">Сцена <span id="entity-count"></span></div><input id="search" placeholder="Найти объект…" aria-label="Поиск объектов"><section class="player-panel"><b>♙ Игрок · точка старта</b><small>Синяя фигурка — место появления.<br>Стрелка — направление взгляда.</small><button id="place-player" class="primary">＋ Поставить игрока на карту</button><div class="player-actions"><button id="find-player">◎ Показать</button><button id="play-player">▶ Играть отсюда</button></div><output id="spawn-coordinates"></output><small id="spawn-instructions">Нажмите «Поставить», затем щёлкните по земле.</small></section><section class="player-panel enemy-panel"><b>♟ Враги</b><button id="add-enemy" class="primary">＋ Добавить врага</button><small>Поставьте на землю → настройте ID, бой, модель и анимации.</small></section><div class="world-label">⌘ &nbsp; Долина / объекты</div><div class="selection-actions"><span id="selection-count">Выбрано: 1</span><button id="select-visible" title="Выделить все объекты текущего списка · Ctrl/⌘+A">Все</button><button id="clear-selection">Снять</button></div><small class="selection-help">Ctrl/⌘ + щелчок — несколько · Shift — диапазон.<br>Флажки работают и на сенсорном экране.</small><div id="tree"></div><div class="terrain-section"><b>Рельеф</b><select id="terrain-region" aria-label="Участок рельефа"></select><button id="terrain-add">▱ Выделить область</button><small>Область ограничивает работу кисти. Для новой территории нажмите «Расширить карту».</small></div><div class="add-row"><button id="add" class="primary">＋ Добавить объект</button></div></aside>
<section class="viewport-wrap"><div id="viewport"></div><div class="scene-toolbar"><div class="tool-group"><button id="add-top" class="primary">＋ Объект</button><button data-tool="select" title="Выделить объекты рамкой · B">▱ Выделить</button><button data-tool="move" title="Выбрать и переместить · G">↔ Двигать</button><button data-tool="rotate" title="Повернуть · R">↻ Вращать</button><button data-tool="scale" title="Масштаб · S">⤢ Размер</button></div><div class="tool-group"><button data-tool="area">▱ Область</button><button data-tool="raise">↑ Поднять</button><button data-tool="lower">↓ Опустить</button><button data-tool="smooth">≈ Сгладить</button><button data-tool="flatten">▰ Выровнять</button><button data-tool="cliff">⛰ Скалы</button><button data-tool="wall" title="Строить стены кистью">▤ Стены</button><button id="wall-straight-toggle" hidden aria-pressed="false" title="Переключить свободную кисть / прямую линию · L">╱ Прямая · L</button><button data-tool="road">⌁ Дорога</button></div><div class="tool-group"><button data-tool="spawn">♙ Поставить игрока</button><button id="focus">◎ Фокус</button><button id="home">⌂ Обзор</button><button id="show-boundaries" aria-pressed="false" title="Голубая граница — только в редакторе">Граница</button><button id="show-collisions" aria-pressed="false" title="Оранжевые объёмы, мешающие проходу">Преграды</button></div></div>
<div id="boundary-legend" class="boundary-legend" hidden></div><div class="brush-settings" hidden><label>Радиус <input id="brush-radius" type="range" min="1" max="15" step="0.5" value="4"><output id="radius-value">4 м</output></label><label>Сила <input id="brush-strength" type="range" min="0.5" max="8" step="0.5" value="2"><output id="strength-value">2</output></label></div>
<div id="placement-settings" hidden><b id="placement-name"></b><label>Масштаб × <input id="placement-scale" type="number" min="0.001" max="1000" step="0.1" value="1"></label><label>Поворот Y, ° <input id="placement-angle" type="number" step="15" value="0"></label><button id="placement-turn-left">↶ 90°</button><button id="placement-turn-right">↷ 90°</button><label><input id="placement-repeat" type="checkbox"> Расставлять несколько</label><small>Наведите на землю → щёлкните. Esc — закончить.</small></div><div class="editor-guide"><b id="tool-title">Перемещение объектов</b><span id="tool-hint">Выберите объект и перетащите его мышью или за цветную стрелку.</span><small>ПКМ — вращать камеру · Средняя кнопка — сдвиг · Колесо — масштаб</small><button id="cancel-tool" hidden>Отмена · Esc</button></div>
<div class="play-controls" hidden><button id="save-game">Сохранить игру</button><button id="load-game">Загрузить</button><button id="download-save">Скачать сейв</button><button id="import-save">Открыть сейв</button><button id="mouse-report">Скачать диагностику мыши</button></div></section>
<aside class="inspector"><div class="panel-heading">Свойства <span>◇</span></div><div id="inspector"></div><div class="quest-section"><div class="panel-heading">Квесты <button id="new-quest">＋ Создать квест</button></div><div id="quests"></div></div></aside>
<section class="assets"><div class="asset-side"><span class="eyebrow">БИБЛИОТЕКА</span><h3>Ваш мир.<br>Ваши модели.</h3><button id="video-settings">▶ Видео / катсцены</button><button id="audio-settings">♫ Звуки</button><button id="import-model">＋ Объект окружения (GLB)</button></div><div id="asset-list"></div><div class="asset-note">GLB 2.0<br><span>Модели и текстуры внутри проекта.<br>Никаких внешних CDN.</span></div></section></main>
<footer><span id="status">Загрузка мира…</span><label>Качество <select id="quality">${QUALITY_OPTIONS.map(([id,label])=>`<option value="${id}" ${id==='balanced'?'selected':''}>${label}</option>`).join('')}</select></label><span>WebGL 2 · Three.js <span id="render-stats"></span></span><span>Формат проекта v25</span></footer>
<input type="file" id="project-file" accept=".json" hidden><input type="file" id="model-file" accept=".glb" hidden><input type="file" id="save-file" accept=".json" hidden>
<dialog id="modal"><div class="modal-top"><h2 id="modal-title"></h2><button id="close-modal">✕</button></div><div id="modal-body"></div></dialog><div id="toast" role="status" hidden></div>`;
let project = demoProject(),
  selected = "warden",
  session = null,
  busy = false;
const selection = new Selection([selected]);
const history = new History(20);
let view,
  tools,
  terrainId = null,
  snapToGround = true;
let toastTimer;
let editorMode = "move";
const landscapeModes = new Set([
  "area",
  "raise",
  "lower",
  "smooth",
  "flatten",
  "paint",
  "cliff",
  "road",
]);
let actorImportId = null;
let actorImportSlot = "model";
let importingModel = false;
let brushMaterial = 1,
  paintWithSculpt = false;
let roadMaterial = 4, roadGrade = 0;
const wallSettings = {...DEFAULT_WALL};
function wallSettingsChanged() {
  tools?.updateCircle();
  const button = $("#wall-straight-toggle");
  button.setAttribute("aria-pressed", String(wallSettings.straight));
  button.textContent = "╱ Прямая · L";
}
function toggleWallLine() {
  wallSettings.straight = !wallSettings.straight;
  wallSettingsChanged(); renderInspector();
}
// Floating brush controls follow the actual wrapped toolbar height on every screen.
if (globalThis.ResizeObserver) {
  const toolbar = $(".scene-toolbar");
  new ResizeObserver(() => {
    const top = `${toolbar.offsetTop + toolbar.offsetHeight + 8}px`;
    $(".brush-settings").style.top = top;
    $("#placement-settings").style.top = top;
  }).observe(toolbar);
}
function notify(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
function modal(title, content) {
  $("#modal").classList.remove("preview-dialog");
  $("#modal-title").textContent = title;
  $("#modal-body").replaceChildren();
  if (typeof content === "string") $("#modal-body").innerHTML = content;
  else $("#modal-body").append(content);
  $("#modal").showModal();
}
$("#close-modal").onclick = () => $("#modal").close();
$("#modal").addEventListener("close", () => {
  if (view) stopEnemyPreview(view);
  $("#modal").classList.remove("preview-dialog");
});
$("#modal").addEventListener("cancel", () => {
  if (view) stopEnemyPreview(view);
});
async function persist() {
  try {
    await draft("write", project);
    $("#status").textContent = "● Черновик сохранён на этом устройстве";
  } catch {
    $("#status").textContent = "Не удалось сохранить черновик";
    notify(
      "Память браузера недоступна или заполнена. Скачайте проект, чтобы сохранить изменения.",
    );
  }
}
async function commit(next, { record = true } = {}) {
  if (busy || session) return false;
  stopEnemyPreview(view);
  tools?.cancel();
  busy = true;
  document.body.classList.add("busy");
  try {
    next = readProject(next);
    await view.syncProject(next);
    if (record) history.push(project);
    project = next;
    selection.retain(project.entities); selected = selection.primary;
    render();
    await persist();
    return true;
  } catch (error) {
    await view.load(project);
    render();
    notify(errorText(error));
    return false;
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
}
function change(fn) {
  const next = structuredClone(project);
  fn(next);
  return commit(next);
}
function visibleEntities() {const query=$("#search").value.toLowerCase();return project.entities.filter(e=>e.name.toLowerCase().includes(query));}
function selectionChanged() {
  selected=selection.primary; view.select(selection.ids); renderInspector(); renderTree(); tools?.attach();
}
function select(id, options = {}) {
  if (busy || session) return;
  selection.choose(id,options,visibleEntities().map(e=>e.id)); selectionChanged();
}
function selectMany(ids, additive = false) {
  if (busy || session) return;
  selection.set(additive ? [...selection.ids,...ids] : ids); selectionChanged();
}
async function deleteSelection() {
  if (busy || session || !selection.ids.length) return;
  tools?.cancel();
  try {const count=selection.ids.length; if(await commit(deleteEntities(project,selection.ids))) notify(`Удалено объектов: ${count}. Ctrl/⌘+Z — вернуть.`);}
  catch(error) {notify(error.message);}
}
function openExpansion() {
  if (busy || session) return; tools.cancel();
  expandWorldEditor({project,modal,commit,onExpanded:({plan,regionId})=>{if(regionId)terrainId=regionId;tools.setMode("move");renderTerrain();$("#home").click();notify(`Карта расширена до ${plan.size.toFixed(1)} × ${plan.size.toFixed(1)} м. Новая территория добавлена по краям.`);}});
}
function element(tag, text, className) {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}
function renderTree() {
  const list = $("#tree");
  list.replaceChildren();
  for (const e of visibleEntities()) {
    const row=element("div","","tree-entry"), checkbox=element("input"); checkbox.type="checkbox"; checkbox.dataset.selectionCheck=""; checkbox.checked=selection.has(e.id);checkbox.setAttribute("aria-label",`Выделить: ${e.name}`);
    checkbox.onchange=()=>select(e.id,{toggle:true});
    const b=element("button",`${{npc:"♙",prop:"◇",enemy:"♜",item:"✧"}[e.kind]}  ${e.name}`,selection.has(e.id)?"tree-row selected":"tree-row");
    b.setAttribute("aria-pressed",String(selection.has(e.id)));
    b.onclick=event=>select(e.id,{toggle:event.ctrlKey||event.metaKey,range:event.shiftKey});row.append(checkbox,b);list.append(row);
  }
  $("#selection-count").textContent=`Выбрано: ${selection.ids.length}`;
  $("#entity-count").textContent = project.entities.length;
}
function field(parent, label, value, type, onchange) {
  const l = element("label", label, "field");
  const i = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") i.type = type;
  i.value = value;
  if (type === "number") i.step = "0.1";
  i.onchange = () => onchange(type === "number" ? Number(i.value) : i.value);
  l.append(i);
  parent.append(l);
  return i;
}
function renderInspector() {
  const box = $("#inspector");
  box.replaceChildren();
  if (editorMode === "wall") {
    wallInspector({box,settings:wallSettings,element,field,changed:wallSettingsChanged,undo:()=>$("#undo").click()});
    return;
  }
  if (editorMode === "place" && tools?.pending) {
    box.append(
      element("h3", "Размещение объекта"),
      element("strong", tools.pending.name),
      element(
        "p",
        `1. Наведите на землю.
2. Подберите масштаб и поворот над сценой.
3. Щёлкните, чтобы поставить.`,
        "inspector-hint",
      ),
      element(
        "p",
        "«Расставлять несколько» оставляет инструмент активным для следующей копии. Esc — закончить.",
      ),
    );
    const cancel = element("button", "Отменить размещение");
    cancel.onclick = () => {
      tools.cancel();
      tools.setMode("move");
    };
    box.append(cancel);
    return;
  }
  if (landscapeModes.has(editorMode)) {
    renderLandscapePanel(box);
    return;
  }
  if (editorMode === "patrol") {
    patrolInspector({box,entity:project.entities.find(e=>e.id===selected),project,tools,element,field,commit,refresh:renderInspector});
    return;
  }
  if (selection.ids.length > 1) {bulkEditor({box,project,ids:[...selection.ids],element,field,commit,remove:deleteSelection});return;}
  const e = project.entities.find((e) => e.id === selected);
  if (!e) {
    box.append(
      element("p", "Выберите объект в сцене или добавьте новый.", "empty"),
    );
    field(box, "Название проекта", project.title, "text", (value) =>
      change((p) => (p.title = value)),
    );
    return;
  }
  const head = element("div", "", "object-summary");
  head.append(
    element(
      "div",
      { npc: "♙", prop: "◇", enemy: "♜", item: "✧" }[e.kind],
      "object-icon",
    ),
    element("strong", e.name),
    element(
      "small",
      e.kind === "prop"
        ? "Объект окружения"
        : `${e.kind.toUpperCase()} / ${e.shape.toUpperCase()}`,
    ),
  );
  box.append(head);
  const moonLabel = element("label", " Только при красной луне", "check"), moonCheck = element("input");
  moonCheck.type = "checkbox"; moonCheck.checked = !!e.moonOnly;
  moonCheck.onchange = () => {const next = structuredClone(project); next.entities.find(x => x.id === e.id).moonOnly = moonCheck.checked; commit(next);};
  moonLabel.prepend(moonCheck); box.append(moonLabel);
  if (e.id === project.rpg?.services.horse) {
    const mount = element("button", "Маунт · модель и посадка", "primary");
    mount.id = "mount-settings"; mount.onclick = showMount; box.append(mount);
  }
  if (["enemy", "npc"].includes(e.kind)) {
    const behavior = element("button", "Поведение и добыча", "primary");
    behavior.id = "character-settings";
    behavior.onclick = () =>
      characterSettings({ entity: e, project, element, field, modal, commit });
    box.append(behavior);
    for (const [title, fn] of [
      ["⚔ Оружие в руке", heldWeaponEditor],
      ["◷ Появление по времени", spawnEditor],
    ]) {
      const button = element("button", title);
      button.onclick = () => fn({ entity: e, project, view, modal, commit, importModel: chooseActorModel });
      box.append(button);
    }
    if (e.kind === "npc") {
      const combat = element(
        "button",
        "Бой, ходьба, смерть — модели и анимации",
      );
      combat.onclick = () =>
        enemyEditor({
          entity: e,
          project,
          view,
          element,
          field,
          modal,
          commit,
          selectEntity: select,
          importModel: (id, slot = "model") => {
            $("#model-file").multiple = false;
            actorImportSlot = slot;
            actorImportId = id;
            $("#model-file").click();
          },
        });
      box.append(combat);
    }
  }
  if (e.kind === "item") {
    const equipment = element(
      "button",
      "Предмет: экипировка и владелец",
      "primary",
    );
    equipment.id = "item-equipment";
    equipment.onclick = () =>
      itemEditor({ entity: e, project, element, field, modal, commit });
    box.append(equipment);
  }
  if (e.kind === "enemy") {
    const settings = element("button", "♟ Настроить врага", "primary");
    settings.id = "enemy-settings";
    settings.onclick = () => showActor(e.id);
    box.append(settings);
    box.append(element("code", `ID: ${e.id}`));
    box.append(
      element(
        "p",
        "В игре враг заметит игрока, подойдёт и атакует. Настройте радиус и анимации кнопкой выше.",
        "inspector-hint",
      ),
    );
  }
  if (["enemy", "npc"].includes(e.kind)) {
    const route=element("button", "⌁ Маршрут хождения", "primary");
    route.id="patrol-edit";route.onclick=()=>tools.setMode("patrol");box.append(route);
    if(e.patrol)box.append(element("small",`Точек: ${e.patrol.points.length} · ${e.patrol.enabled?"патруль включён":"патруль выключен"}`));
  }
  if (e.kind === "npc") {
    const settings = element("button", "♙ Модель и анимации NPC", "primary");
    settings.id = "npc-settings";
    settings.onclick = () => showActor(e.id);
    box.append(settings);
    const dialogue = element("button", "☷ Диалоги и ответы");
    dialogue.id = "dialogue-settings";
    dialogue.onclick = () => {
      if (busy || session) return;
      tools.cancel();
      dialogueEditor({ entity: e, project, element, modal, commit });
    };
    box.append(dialogue);
  }
  if (e.kind === "prop") {
    const motion = element(
      "button",
      e.motion
        ? "⚙ Настроить дверь / движение"
        : "⚙ Добавить дверь / движение",
    );
    motion.id = "motion-settings";
    motion.onclick = () => {
      if (busy || session) return;
      tools.cancel();
      motionEditor({ entity: e, project, view, element, modal, field, commit });
    };
    box.append(motion);
  }
  if (e.kind === "prop") {
    const l = element("label", "Заменить модель объекта", "field"),
      s = element("select");
    for (const [id, name] of [
      ["", "Встроенный блок"],
      ...project.assets.map((a) => [a.id, a.name]),
    ]) {
      const o = element("option", name);
      o.value = id;
      s.append(o);
    }
    s.value = e.assetId ?? "";
    s.onchange = () =>
      change((p) => {
        const n = p.entities.find((x) => x.id === e.id);
        n.shape = s.value ? "model" : "box";
        if (s.value) n.assetId = s.value;
        else delete n.assetId;
      });
    l.append(s);
    box.append(l);
  }
  if (e.shape === "model" && e.kind === "prop") {
    const equip = element("button", "⚔ Экипировать игроку", "primary");
    equip.id = "equip-selected";
    equip.onclick = () => equipWeapon(e.assetId);
    box.append(equip);
  }
  const snapLabel = element(
    "label",
    "При перетаскивании ставить на землю",
    "check",
  );
  const snap = document.createElement("input");
  snap.type = "checkbox";
  snap.id = "snap-ground";
  snap.checked = snapToGround;
  snap.onchange = () => (snapToGround = snap.checked);
  snapLabel.prepend(snap);
  box.append(snapLabel);
  const groundButton = element("button", "↓ На землю", "ground-button");
  groundButton.onclick = () => {
    const object = view.objects.get(e.id);
    view.groundObject(object);
    change(
      (p) =>
        (p.entities.find((x) => x.id === e.id).position =
          object.position.toArray()),
    );
  };
  box.append(
    groundButton,
    element(
      "p",
      "Перетаскивайте объект в сцене. Цветные стрелки двигают его по отдельным осям.",
      "inspector-hint",
    ),
  );

  const update = (key, value) =>
    change((p) => {
      p.entities.find((x) => x.id === e.id)[key] = value;
    });
  vegetationFields({ entity: e, box, element, commit, project });
  field(box, "Имя", e.name, "text", (v) => update("name", v));
  for (const [key, label] of [
    ["position", "Позиция · метры"],
    ["rotation", "Поворот · градусы"],
    ["scale", "Масштаб"],
  ]) {
    box.append(element("h4", label));
    const row = element("div", "", "vector");
    e[key].forEach((v, i) => {
      const input = field(
        row,
        ["X", "Y ↑", "Z"][i],
        Math.round((key === "rotation" ? (v * 180) / Math.PI : v) * 100) / 100,
        "number",
        (n) => {
          const value = [...e[key]];
          value[i] = key === "rotation" ? (n * Math.PI) / 180 : n;
          update(key, value);
        },
      );
      input.dataset.transform = key;
      input.dataset.axis = String(i);
    });
    box.append(row);
  }
  field(box, "Цвет", e.color, "color", (v) => update("color", v));
  if (e.kind === "prop" && e.shape === "box") {
    box.append(element("h4", "Материал блока"));
    materialPicker(
      box,
      e.surface ?? 0,
      (id) => update("surface", id),
      "object-materials",
    );
    box.append(
      element(
        "small",
        "Текстура заменяет цвет блока. «Без текстуры» возвращает выбранный цвет.",
      ),
    );
  }

  collisionControl(
    box,
    e.solid ? (e.collision ?? "meshes") : "none",
    (value) =>
      change((p) => {
        const target = p.entities.find((item) => item.id === e.id);
        target.solid = value !== "none";
        if (value !== "none") target.collision = value;
      }),
    "object-collision",
  );
  if (e.kind === "npc")
    field(box, "Диалог", e.dialogue, "textarea", (v) => update("dialogue", v));
  if (["item", "prop"].includes(e.kind) && !e.motion) {
    const label = element("label", "Осматривать по E", "field"),
      checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.id = "inspect-enabled";
    checkbox.checked = e.inspection?.enabled ?? e.kind === "item";
    checkbox.onchange = () =>
      update("inspection", {
        enabled: checkbox.checked,
        description: e.inspection?.description ?? "",
      });
    label.append(checkbox);
    box.append(label);
    field(
      box,
      "Описание при осмотре",
      e.inspection?.description ?? "",
      "textarea",
      (v) =>
        update("inspection", {
          enabled: e.inspection?.enabled ?? e.kind === "item",
          description: v,
        }),
    );
    if (e.kind === "prop") {
      const takeable = element("button", "Сделать переносимым предметом");
      takeable.id = "make-item";
      takeable.onclick = () =>
        change((p) => {
          const item = p.entities.find((x) => x.id === e.id);
          item.kind = "item";
          item.environment = false;
          item.solid = false;
          item.inspection = {
            enabled: true,
            description: item.inspection?.description ?? "",
          };
        });
      box.append(takeable);
    } else {
      const label = element("label", "Модель предмета", "field"),
        select = element("select");
      select.id = "item-model";
      for (const a of [
        { id: "", name: "Встроенная сфера" },
        ...project.assets,
      ]) {
        const option = element("option", a.name);
        option.value = a.id;
        select.append(option);
      }
      select.value = e.assetId ?? "";
      select.onchange = () =>
        change((p) => {
          const item = p.entities.find((x) => x.id === e.id);
          item.shape = select.value ? "model" : "sphere";
          if (select.value) item.assetId = select.value;
          else delete item.assetId;
        });
      label.append(select);
      box.append(
        label,
        element(
          "small",
          "В игре: E → осмотреть → забрать. I или кнопка 🎒 — инвентарь. Выброшенный предмет можно подобрать снова.",
        ),
      );
    }
  }
  if (e.kind === "enemy")
    field(box, "Здоровье", e.health, "number", (v) => update("health", v));
  const row = element("div", "", "button-row");
  const duplicate = element("button", "Дублировать");
  duplicate.onclick = () =>
    change((p) => {
      const clone = structuredClone(e);
      clone.id = crypto.randomUUID();
      clone.name += " (копия)";
      clone.position[0] += 2;
      p.entities.push(clone);
      selection.set([clone.id]); selected = clone.id;
    });
  if (["prop", "item"].includes(e.kind)) {
    const book = element("button", "Книга · страницы и автор");
    book.onclick = () => bookEditor({ entity: e, project, modal, commit });
    box.append(book);
  }
  if (e.kind === "prop") {
    const moon = element("button", "☽ Тайная дверь красной луны");
    moon.onclick = () => moonDoorEditor({ entity: e, project, modal, commit });
    box.append(moon);
  }
  const remove = element("button", "Удалить", "danger");
  remove.onclick = deleteSelection;
  row.append(duplicate, remove);
  box.append(row);
}
function renderAssets() {
  const box = $("#asset-list");
  box.replaceChildren();
  for (const [name, shape, symbol] of [
    ["Куб", "box", "◇"],
    ["Дерево", "tree", "♧"],
    ["Скала", "rock", "◆"],
    ["Арка", "ruin", "Π"],
  ]) {
    const b = element("button", "", "asset-card");
    b.append(
      element("span", symbol),
      element("strong", name),
      element("small", "Нажмите → укажите место"),
    );
    b.onclick = () => add("prop", shape);
    box.append(b);
  }
  for (const a of project.assets) {
    const b = element("button", "", "asset-card");
    b.append(
      element("span", "⬡"),
      element("strong", a.name),
      element("small", "Нажмите → укажите место"),
    );
    b.onclick = () => placeEnvironment(a.id);
    const card = element("div", "", "asset-model-actions");
    const process = element("button", "Обработать копию");
    process.dataset.processAsset = a.id;
    process.onclick = async () => {
      if (busy || session || importingModel) return;
      try {
        await importModelFile(
          new File([decodeGLB(a.data)], a.name, { type: "model/gltf-binary" }),
        );
      } catch (error) {
        notify(errorText(error));
      }
    };
    card.append(b, process);
    box.append(card);
  }
}
async function startLandscape(full = false) {
  if (busy || session) return;
  if (!full && project.world.terrain?.regions.length) {
    tools.setMode("raise");
    return;
  }
  if (!full) {
    tools.setMode("area");
    return;
  }
  const next = structuredClone(project);
  next.world.terrain ??= createTerrain();
  const half = next.world.size / 2;
  let region = next.world.terrain.regions.find(
    (r) =>
      r.min[0] === -half &&
      r.min[1] === -half &&
      r.max[0] === half &&
      r.max[1] === half,
  );
  if (!region) {
    region = createRegion(next.world, [-half, -half], [half, half]);
    region.name = "Весь мир";
    next.world.terrain.regions.push(region);
  }
  terrainId = region.id;
  if (await commit(next)) tools.setMode("raise");
}
function renderLandscapePanel(box) {
  box.append(
    element("h3", "⛰ Ландшафт"),
    element(
      "p",
      "1. Выберите область. 2. Выберите кисть. 3. Зажмите ЛКМ и водите по земле.",
      "inspector-hint",
    ),
  );
  const expand=element("button","⤢ Расширить основную карту","primary");expand.onclick=openExpansion;box.append(expand);
  const full = element("button", "Лепить весь мир", "primary");
  full.id = "landscape-full";
  full.onclick = () => startLandscape(true);
  box.append(full);
  const area = element("button", "▱ Выделить отдельный участок");
  area.id = "landscape-area";
  area.onclick = () => tools.setMode("area");
  box.append(area);
  const regions = project.world.terrain?.regions ?? [],
    select = element("select");
  select.id = "landscape-region";
  select.setAttribute("aria-label", "Где изменять ландшафт");
  if (!regions.length)
    select.append(element("option", "Сначала выберите весь мир или участок"));
  for (const r of regions) {
    const o = element("option", r.name);
    o.value = r.id;
    select.append(o);
  }
  select.value = terrainId ?? regions[0]?.id ?? "";
  select.onchange = () => {
    terrainId = select.value;
    renderTerrain();
    tools.setMode("raise");
  };
  box.append(select);
  const region = regions.find((r) => r.id === select.value);
  if (region) {
    const focus = element("button", "◎ Показать выбранную область");
    focus.onclick = () => {
      const x = (region.min[0] + region.max[0]) / 2,
        z = (region.min[1] + region.max[1]) / 2,
        d = Math.max(
          12,
          Math.min(
            100,
            region.max[0] - region.min[0],
            region.max[1] - region.min[1],
          ),
        );
      view.orbit.target.set(x, heightAt(project.world, x, z), z);
      view.camera.position.set(x + d * 0.5, d, z + d * 0.5);
      view.orbit.update?.();
      view.invalidate();
    };
    box.append(focus);
  }
  box.append(element("h4", "Что изменить"));
  for (const [mode, title, desc] of [
    ["cliff", "⛰ Большие скалы", "Каждый щелчок добавляет каменный уступ"],
    ["road", "⌁ Дорога / перевал", "Проложить ровный проход сквозь горы"],
    ["raise", "↑ Холм", "Поднять землю"],
    ["lower", "↓ Впадина", "Опустить землю"],
    ["smooth", "≈ Сгладить", "Смягчить резкие склоны"],
    ["flatten", "▰ Площадка", "Высота берётся в начале мазка"],
    ["paint", "▧ Материал", "Рисовать по земле без изменения высоты"],
  ]) {
    const b = element(
      "button",
      `${title} · ${desc}`,
      editorMode === mode ? "primary" : "",
    );
    b.dataset.landscapeBrush = mode;
    b.disabled = !regions.length;
    b.setAttribute("aria-pressed", String(editorMode === mode));
    b.onclick = () => tools.setMode(mode);
    box.append(b);
  }
  if (editorMode === "road") {
    const grade=field(box,"Уклон дороги, % (0 — ровно)",roadGrade,"number",v=>{roadGrade=Math.max(-30,Math.min(30,Number(v)||0));grade.value=roadGrade;});
    grade.id="road-grade";grade.min=-30;grade.max=30;grade.step=1;
    box.append(element("p","Начните на земле у подножия и ведите через гору: дорога срежет скалу на высоте начала мазка. Уклон задаёт плавный подъём или спуск вдоль мазка. Ширина — удвоенный радиус, по краям добавляются откосы. Это открытый проход, а не тоннель.","inspector-hint"));
  }
  if (editorMode === "cliff") box.append(element("p","Щёлкайте по одному месту: скала растёт с каждым нажатием. Ведите с зажатой ЛКМ, чтобы создать хребет. Радиус задаёт размер, сила — прибавку высоты. Максимальная высота рельефа — 80 м; камень наносится автоматически.","inspector-hint"));
  if (editorMode !== "cliff") {
  box.append(element("h4", editorMode === "road" ? "Покрытие дороги" : "Материал земли"));
  materialPicker(
    box,
    editorMode === "road" ? roadMaterial : brushMaterial,
    (id) => {
      if (editorMode === "road") roadMaterial = id;
      else brushMaterial = id;
    },
    "terrain-materials",
  );
  }
  const together = element(
      "label",
      "Наносить материал при изменении высоты",
      "check",
    ),
    check = element("input");
  check.type = "checkbox";
  check.id = "paint-with-sculpt";
  check.checked = paintWithSculpt;
  check.onchange = () => {
    paintWithSculpt = check.checked;
  };
  together.prepend(check);
  together.hidden = ["cliff", "road"].includes(editorMode);
  box.append(together);
  const fill = element("button", "Залить выбранный участок материалом");
  fill.id = "terrain-fill-material";
  fill.disabled = !region;
  fill.hidden = ["cliff", "road"].includes(editorMode);
  fill.onclick = async () => {
    tools.cancel();
    const next = structuredClone(project);
    if (paintTerrain(next.world, region, 0, 0, 0, editorMode === "road" ? roadMaterial : brushMaterial, true))
      await commit(next);
  };
  box.append(
    fill,
    element(
      "small",
      "Кисть «Материал» меняет только покрытие. Размер кисти задаётся ниже. «Без текстуры» стирает покрытие. Граница смешивается между вершинами сетки; Ctrl+Z отменяет мазок или заливку.",
    ),
  );
  const radius = $("#brush-radius"),
    diameter = field(
      box,
      "Размер кисти — диаметр, м",
      Number(radius.value) * 2,
      "range",
      () => {},
    );
  diameter.id = "landscape-size";
  diameter.min = Number(radius.min) * 2;
  diameter.max = Number(radius.max) * 2;
  diameter.step = 1;
  const size = element("output", `${Number(radius.value) * 2} м`);
  box.append(size);
  diameter.oninput = () => {
    radius.value = Number(diameter.value) / 2;
    $("#radius-value").textContent = radius.value + " м";
    size.textContent = diameter.value + " м";
    tools.updateCircle();
  };
  const strength = $("#brush-strength"),
    power = field(box, editorMode === "cliff" ? "Сила роста скалы" : "Скорость изменения", strength.value, "range", () => {});
  power.id = "landscape-power";
  power.min = 0.5;
  power.max = 8;
  power.step = 0.5;
  power.parentElement.hidden = editorMode === "road";
  power.oninput = () => {
    strength.value = power.value;
    $("#strength-value").textContent = power.value;
  };
  box.append(
    element(
      "p",
      "Круг на земле показывает размер кисти. Вне выбранного участка земля не меняется. Один мазок — одно действие отмены.",
      "inspector-hint",
    ),
  );
  const undo = element("button", "↶ Отменить последний мазок");
  undo.disabled = !history.undoStack.length;
  undo.onclick = () => $("#undo").click();
  box.append(undo);
  const done = element("button", "✓ Закончить ландшафт");
  done.id = "landscape-done";
  done.onclick = () => tools.setMode("move");
  box.append(done);
}
function materialPicker(box, value, onChange, id) {
  const palette = element("div", "", "material-palette");
  palette.id = id;
  for (const material of MATERIALS) {
    const button = element("button", "", "material-card");
    button.type = "button";
    button.dataset.material = material.id;
    button.setAttribute("aria-pressed", String(material.id === value));
    if (material.file) {
      const img = element("img");
      img.src = MATERIAL_URLS[material.id];
      img.alt = "";
      img.loading = "lazy";
      button.append(img);
    }
    button.append(element("span", material.name));
    button.onclick = () => {
      for (const b of palette.querySelectorAll("button"))
        b.setAttribute("aria-pressed", String(b === button));
      onChange(material.id);
    };
    palette.append(button);
  }
  box.append(palette);
}
function collisionControl(box, value, onChange, id) {
  const label = element("label", "Коллизия — что мешает проходу"),
    select = element("select");
  select.id = id;
  for (const [key, text] of [
    ["box", "Простой объём · здание снаружи, камень"],
    ["trunk", "Узкий ствол · дерево"],
    ["meshes", "По частям модели · стены, арки"],
    ["wall", "Вдоль стены · любой угол"],
    ["none", "Без коллизии · трава, мелкий декор"],
  ]) {
    const option = element("option", text);
    option.value = key;
    select.append(option);
  }
  select.value = value;
  const hint = element("small");
  const explain = () => {
    hint.textContent = {
      box: "Один прямоугольный объём: быстро, но закрывает внутренние проходы здания.",
      trunk:
        "Один узкий объём по центру: 20% меньшей ширины модели, полная высота. Крона не мешает. Подходит для дерева с прямым центральным стволом.",
      meshes:
        "Отдельный прямоугольный объём на каждый меш. Для проходов стены должны быть отдельными мешами; единая модель дома закроет проём. Чем больше частей, тем выше нагрузка.",
      wall: "Узкие объёмы вдоль стены: коллизия следует её повороту и не перекрывает большой прямоугольник вокруг диагональной стены.",
      none: "Игрок и враги проходят насквозь. Проверки столкновений не выполняются.",
    }[select.value];
  };
  select.onchange = () => {
    explain();
    onChange(select.value);
  };
  explain();
  label.append(select);
  box.append(label, hint);
}
function showEnvironment() {
  if (busy || session) return;
  tools.cancel();
  const box = element("div", "", "environment-catalog");
  box.append(
    element(
      "p",
      "Здания, деревья, камни и декор — объекты окружения. Импортируйте GLB или выберите модель, задайте размер и коллизию, затем поставьте на карту щелчком.",
    ),
  );
  const upload = element("button", "＋ Выбрать GLB с компьютера", "primary");
  upload.id = "environment-import";
  upload.onclick = () => {
    actorImportId = null;
    $("#modal").close();
    $("#model-file").click();
  };
  box.append(upload);
  const drop = element(
    "div",
    "Или перетащите один файл .glb сюда",
    "model-drop",
  );
  drop.id = "environment-drop";
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("dragging");
  };
  drop.ondragleave = () => drop.classList.remove("dragging");
  drop.ondrop = async (e) => {
    e.preventDefault();
    drop.classList.remove("dragging");
    const files = e.dataTransfer.files;
    if (files.length !== 1 || !files[0].name.toLowerCase().endsWith(".glb")) {
      notify("Перетащите один файл .glb.");
      return;
    }
    $("#modal").close();
    await importModelFile(files[0]);
  };
  box.append(drop);
  box.append(
    element(
      "small",
      "GLB включает модель и текстуры. Для FBX/OBJ экспортируйте GLB из 3D-редактора.",
    ),
  );
  for (const [name, shape] of [
    ["Дерево", "tree"],
    ["Скала", "rock"],
    ["Каменная арка", "ruin"],
    ["Блок / платформа", "box"],
  ]) {
    const b = element("button", name);
    b.onclick = () => {
      $("#modal").close();
      add("prop", shape);
    };
    box.append(b);
  }
  box.append(element("h3", "Импортированные модели"));
  if (!project.assets.length)
    box.append(
      element("p", "Моделей пока нет. Начните с кнопки импорта выше."),
    );
  for (const asset of project.assets) {
    const b = element("button", `⬡ ${asset.name} → Разместить`);
    b.dataset.environmentAsset = asset.id;
    b.onclick = () => placeEnvironment(asset.id);
    box.append(b);
  }
  modal("Объекты окружения · здания, деревья, декор", box);
}
function placeEnvironment(assetId) {
  if (busy || session) return;
  tools.cancel();
  const asset = project.assets.find((a) => a.id === assetId),
    model = view.assetModels.get(assetId)?.scene;
  if (!model) return;
  model.updateMatrixWorld(true);
  const size = new Box3().setFromObject(model).getSize(new Vector3()),
    span = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(span) || span < 1e-8) {
    notify("В модели нет видимой геометрии.");
    return;
  }
  const box = element("div", "", "environment-model");
  box.append(
    element("h3", asset.name),
    element(
      "p",
      `Размер в файле: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} м.`,
    ),
  );
  let length = Math.min(20, Math.max(0.1, span)),
    angle = 0,
    collision = "box";
  field(
    box,
    "Размер по большей стороне, м",
    length,
    "number",
    (v) => (length = Number(v)),
  );
  field(box, "Поворот Y, °", 0, "number", (v) => (angle = Number(v)));
  collisionControl(
    box,
    collision,
    (value) => (collision = value),
    "environment-collision",
  );
  box.append(
    element(
      "small",
      "Объекты окружения статичны: встроенные анимации GLB не запускаются. Проверяются только соседние коллизии, без перебора треугольников.",
    ),
  );
  const error = element("p", "", "wizard-error"),
    place = element("button", "Разместить на карте →", "primary");
  place.id = "environment-place";
  place.onclick = () => {
    if (
      !Number.isFinite(length) ||
      length <= 0 ||
      length / span > 1000 ||
      !Number.isFinite(angle)
    ) {
      error.textContent = "Укажите положительный размер и числовой поворот.";
      return;
    }
    const e = createEntity("prop", "model");
    e.name = asset.name;
    e.assetId = assetId;
    e.scale = [length / span, length / span, length / span];
    e.rotation[1] = (angle * Math.PI) / 180;
    e.solid = collision !== "none";
    e.collision = collision === "none" ? "box" : collision;
    e.environment = true;
    $("#modal").close();
    tools.place(e);
  };
  box.append(
    error,
    place,
    element(
      "p",
      "Далее появится зелёный предпросмотр. Наведите его на землю и щёлкните. Высота устанавливается автоматически; Esc отменяет размещение.",
    ),
  );
  modal("Объект окружения · размещение", box);
}
$("#landscape-open").onclick = () => {
  if (!busy && !session)
    tools.setMode(project.world.terrain?.regions.length ? "raise" : "area");
};
$("#environment-open").onclick = showEnvironment;
for (const id of ["placement-scale", "placement-angle"])
  $("#" + id).oninput = () =>
    tools.configurePlacement(
      Number($("#placement-scale").value),
      (Number($("#placement-angle").value) * Math.PI) / 180,
    );

for (const [id, delta] of [
  ["placement-turn-left", -90],
  ["placement-turn-right", 90],
])
  $("#" + id).onclick = () => {
    $("#placement-angle").value = Number($("#placement-angle").value) + delta;
    tools.configurePlacement(
      Number($("#placement-scale").value),
      (Number($("#placement-angle").value) * Math.PI) / 180,
    );
  };
const defaultWeapon = (assetId) => ({
  assetId,
  rotation: [0, 0, 0],
  length: 1.08,
  grip: 0.16,
});
async function equipWeapon(assetId) {
  if (
    await change((p) => {
      p.weapon = defaultWeapon(assetId);
    })
  ) {
    notify("Меч экипирован. Нажмите «Играть» → ЛКМ.");
    weaponSettings();
  }
}
function weaponSettings() {
  if (session || busy) return;
  tools?.cancel();
  const box = element("div"),
    label = element("label", "Меч в руке игрока"),
    select = element("select");
  select.id = "weapon-asset";
  for (const [value, name] of [
    ["none", "Без оружия"],
    ["builtin", "Учебный меч"],
    ...project.assets.map((a) => [a.id, a.name]),
  ]) {
    const option = element("option", name);
    option.value = value;
    select.append(option);
  }
  select.value = project.weapon
    ? (project.weapon.assetId ?? "builtin")
    : "none";
  label.append(select);
  box.append(label);
  const config = structuredClone(project.weapon ?? defaultWeapon(null));
  box.append(
    element(
      "p",
      "Выберите импортированный GLB или учебный меч. После сохранения нажмите «Играть». Удар — ЛКМ.",
    ),
  );
  field(
    box,
    "Длина меча, м (0.2–2)",
    config.length,
    "number",
    (v) => (config.length = Number(v)),
  );
  field(
    box,
    "Место хвата (0 — низ, 1 — верх)",
    config.grip,
    "number",
    (v) => (config.grip = Number(v)),
  );
  ["X", "Y", "Z"].forEach((axis, i) =>
    field(
      box,
      `Поворот ${axis}, °`,
      (config.rotation[i] * 180) / Math.PI,
      "number",
      (v) => (config.rotation[i] = (Number(v) * Math.PI) / 180),
    ),
  );
  box.append(
    element(
      "p",
      "Лезвие должно смотреть вверх (+Y). Для лежащей модели попробуйте поворот X или Z на 90°. Хват отсчитывается после поворота.",
    ),
  );
  const flip = element("button", "↕ Перевернуть меч на 180°");
  flip.type = "button";
  flip.onclick = () => {
    config.rotation[2] += Math.PI;
    const inputs = box.querySelectorAll("input");
    inputs[inputs.length - 1].value = (config.rotation[2] * 180) / Math.PI;
  };
  box.append(flip);
  const save = element("button", "Сохранить экипировку", "primary");
  save.id = "weapon-save";
  save.onclick = async () => {
    const next = structuredClone(project);
    next.weapon =
      select.value === "none"
        ? null
        : {
            ...config,
            assetId: select.value === "builtin" ? null : select.value,
          };
    if (await commit(next)) {
      $("#modal").close();
      notify(next.weapon ? "Меч экипирован · Играть → ЛКМ" : "Оружие снято");
    }
  };
  box.append(save);
  modal("Оружие игрока", box);
}
$("#weapon-settings").onclick = weaponSettings;
function renderQuests() {
  const box = $("#quests");
  box.replaceChildren();
  for (const q of project.quests) {
    const row = element("div", "", "quest-row");
    row.append(
      element("strong", q.title),
      element(
        "small",
        `${q.type === "collect" ? "Собрать предмет" : "Победить врагов"} · ${q.reward} золота`,
      ),
    );
    row.append(
      element(
        "small",
        `Выдаёт: ${project.entities.find((e) => e.id === q.giver)?.name} → Цели: ${questTargets(
          q,
        )
          .map((id) => project.entities.find((e) => e.id === id)?.name)
          .join(", ")} → Вернуться за наградой`,
      ),
    );
    const edit = element("button", "Изменить");
    edit.onclick = () => openQuest(q);
    row.append(edit);
    const b = element("button", "Удалить");
    b.onclick = () =>
      change((p) => (p.quests = p.quests.filter((x) => x.id !== q.id)));
    row.append(b);
    box.append(row);
  }
  if (!project.quests.length)
    box.append(element("p", "Добавьте первый квест.", "empty"));
}
function render() {
  $("#map-boundaries").textContent=project.world.playBounds?"▱ Границы карты · вкл":"▱ Границы карты · выкл";
  document.title = `${project.title} — Hearth`;
  $("#project-title").textContent = project.title;

  $("#undo").disabled = !history.undoStack.length;
  $("#redo").disabled = !history.redoStack.length;
  view.editorGuides?.refresh();view.editorGuides?.onChange?.();
  renderTree();
  renderInspector();
  renderAssets();
  renderQuests();
  view.select(selection.ids);
  renderTerrain();
  tools?.attach();
  tools?.updateOutline();
  tools?.updateSpawn();
  const [sx, , sz] = project.world.spawn;
  $("#spawn-coordinates").textContent =
    `Старт: X ${sx.toFixed(1)} · Z ${sz.toFixed(1)}`;
}
$("#add-enemy").onclick = () => {
  $("#placement-repeat").checked = false;
  add("enemy", "humanoid");
  notify("Щёлкните по земле: после установки откроются параметры врага.");
};
function add(kind, shape, assetId) {
  if (busy || session) return;
  const e = createEntity(kind, shape);
  if (assetId) {
    e.assetId = assetId;
    e.name = project.assets.find((a) => a.id === assetId).name;
  } else
    e.name =
      {
        tree: "Дуб",
        rock: "Скала",
        ruin: "Арка",
        box: "Куб",
        sphere:
          kind === "npc" ? "Персонаж" : kind === "item" ? "Предмет" : "Сфера",
      }[shape] ?? e.name;
  if (kind === "enemy") {
    e.name = "Противник";
    e.enemy = enemyConfig(e);
    e.scale = [1, 1, 1];
    e.position[1] = 0;
  }
  if (kind === "npc") {
    e.name = "Персонаж";
    e.position[1] = 0;
    e.color = "#7daea6";
  }
  if (shape === "door") {
    e.name = "Дверь";
    e.motion = defaultMotion(true);
    e.color = "#836448";
    e.position[1] = 0;
  }
  tools.place(e);
}
function renderTerrain() {
  const step = project.world.size / (project.world.terrain?.resolution ?? 128),
    radius = $("#brush-radius");
  radius.min = String(Math.max(0.5, step));
  radius.max = String(Math.max(30, Math.min(100, project.world.size / 4), step * 12));
  radius.value = String(
    Math.max(
      Number(radius.min),
      Math.min(Number(radius.max), Number(radius.value)),
    ),
  );
  $("#radius-value").textContent = Number(radius.value).toFixed(1) + " м";
  const list = $("#terrain-region"),
    regions = project.world.terrain?.regions ?? [];
  if (!regions.some((r) => r.id === terrainId))
    terrainId = regions[0]?.id ?? null;
  list.replaceChildren();
  if (!regions.length) list.append(element("option", "Участков пока нет"));
  for (const r of regions) {
    const option = element(
      "option",
      `${r.name} · ${(r.max[0] - r.min[0]).toFixed(1)} × ${(r.max[1] - r.min[1]).toFixed(1)} м`,
    );
    option.value = r.id;
    list.append(option);
  }
  if (terrainId) list.value = terrainId;
  for (const name of ["raise", "lower", "smooth", "flatten"])
    document.querySelector(`[data-tool="${name}"]`).disabled = !regions.length;
}
function showCatalog() {
  const content = element("div", "", "catalog");
  content.append(
    element(
      "p",
      "1. Выберите объект.  2. Укажите место на земле.  3. Щёлкните для установки.",
      "catalog-guide",
    ),
  );
  for (const [name, kind, shape, description] of [
    ["Куб", "prop", "box", "Стены, платформы и блоки"],
    ["Дерево", "prop", "tree", "Дуб, граб, каштан, пиния, лавр, земляничное дерево"],
    ["Скала", "prop", "rock", "Неровная природная скала"],
    ["Арка", "prop", "ruin", "Каменная арка"],
    ["NPC", "npc", "humanoid", "Персонаж с диалогом и анимацией разговора"],
    ["Дверь", "prop", "door", "Открывается по E · можно добавить условие"],
    ["Предмет", "item", "sphere", "Объект для подбора"],
    [
      "Противник",
      "enemy",
      "humanoid",
      "Страж с ходьбой и ударом · свою GLB можно назначить в свойствах",
    ],
  ]) {
    const b = element("button", "", "catalog-card");
    b.append(element("strong", name), element("small", description));
    b.onclick = () => {
      $("#modal").close();
      add(kind, shape);
    };
    content.append(b);
  }
  const importButton = element(
    "button",
    "＋ Своя модель GLB",
    "catalog-import",
  );
  importButton.onclick = () => {
    $("#modal").close();
    actorImportId = null;
    $("#model-file").click();
  };
  content.append(importButton);
  modal("Добавить объект", content);
}
$("#add-top").onclick = showCatalog;
$("#terrain-add").onclick = () => tools.setMode("area");
$("#terrain-region").onchange = (e) => {
  terrainId = e.target.value;
  tools.setMode("raise");
};
for (const button of document.querySelectorAll("[data-tool]"))
  button.onclick = () => tools.setMode(button.dataset.tool);
$("#wall-straight-toggle").onclick = () => { tools.cancel(); toggleWallLine(); };
$("#cancel-tool").onclick = () => {
  tools.cancel();
  tools.setMode("move");
};
$("#brush-radius").oninput = (e) => {
  $("#radius-value").textContent = e.target.value + " м";
  tools.updateCircle();
};
$("#brush-strength").oninput = (e) =>
  ($("#strength-value").textContent = e.target.value);
function modeChanged(mode) {
  editorMode = mode;
  const descriptions = {
    select:["Выделение объектов рамкой","Протяните рамку мышью. Ctrl/⌘ или Shift добавляет объекты к выделению. Delete — удалить, G — двигать, S — размер."],
    move: [
      "Перемещение объектов",
      "ЛКМ — выбрать и перетащить. Ctrl/⌘ + щелчок — добавить объект. Стрелки двигают всё выделение. Delete — удалить.",
    ],
    rotate: [
      "Поворот объекта",
      "Выберите объект и потяните за цветное кольцо. Точные углы можно ввести справа.",
    ],
    scale: [
      "Размер объекта",
      "Выберите объекты и потяните за маркер. Группа масштабируется равномерно вокруг общего центра.",
    ],
    area: [
      "Выделите участок рельефа",
      "Зажмите ЛКМ на земле и протяните прямоугольник. Отпустите — появится область для кисти.",
    ],
    cliff: ["Вырастить большую скалу", "Щёлкайте, чтобы наращивать высоту. Ведите с зажатой ЛКМ, чтобы создать хребет. Радиус и сила — в настройках кисти."],
    wall: ["Постройте стену кистью", "Зажмите ЛКМ и ведите по земле. Ширина и высота — справа. «Прямая» / L — линия под любым углом; Esc — отмена."],
    road: ["Проложить дорогу через гору", "Начните у подножия и ведите через скалу. Высота берётся в начале мазка, уклон и покрытие задаются справа."],
    patrol: ["Траектория хождения врага", "Щёлкайте по земле, чтобы добавить точки. Справа — порядок, перенос, пауза и режим патруля. Esc — закончить."],
    paint: [
      "Нарисуйте материал земли",
      "Выберите материал справа и ведите по участку с зажатой ЛКМ. Высота не изменяется.",
    ],
    raise: [
      "Поднять землю",
      "Зажмите ЛКМ внутри выделенного участка. Удерживайте или водите кистью, чтобы создать холм.",
    ],
    lower: [
      "Опустить землю",
      "Зажмите ЛКМ внутри выделенного участка, чтобы создать впадину.",
    ],
    smooth: [
      "Сгладить склон",
      "Водите кистью с зажатой ЛКМ по неровностям. Один мазок — одно действие отмены.",
    ],
    place: [
      "Установите объект",
      "Наведите мышь на землю: появится предпросмотр. ЛКМ — установить, Esc — отменить.",
    ],
    flatten: [
      "Выровнять площадку",
      "Нажмите на нужную высоту и водите кистью: мазок выравнивает поверхность по высоте первого нажатия.",
    ],
    spawn: [
      "Поставьте игрока на карту",
      "Наведите на землю: зелёная фигурка — новое место. ЛКМ — поставить, Esc — отменить. Красная — место занято.",
    ],
  };
  const text = descriptions[mode] ?? descriptions.move;
  $("#place-player").classList.toggle("active", mode === "spawn");
  $("#place-player").setAttribute("aria-pressed", String(mode === "spawn"));
  $("#spawn-instructions").textContent =
    mode === "spawn"
      ? "Наведите на землю → зелёная фигурка → щёлкните. Esc — отмена."
      : "Синяя фигурка — текущий старт. Кнопка «Показать» найдёт её на карте.";
  $("#tool-title").textContent = text[0];
  $("#tool-hint").textContent = text[1];
  for (const button of document.querySelectorAll("[data-tool]")) {
    button.classList.toggle("active", button.dataset.tool === mode);
    button.setAttribute("aria-pressed", String(button.dataset.tool === mode));
  }
  $(".brush-settings").hidden = ![
    "raise",
    "lower",
    "smooth",
    "flatten",
    "paint",
    "cliff",
    "road",
  ].includes(mode);
  $("#brush-strength").parentElement.hidden = mode === "road";
  $("#wall-straight-toggle").hidden = mode !== "wall";
  wallSettingsChanged();
  $("#placement-settings").hidden = mode !== "place";
  if (mode === "place" && tools?.pending) {
    $("#placement-name").textContent = tools.pending.name;
    $("#placement-scale").value = tools.pending.scale[0];
    $("#placement-angle").value = (tools.pending.rotation[1] * 180) / Math.PI;
    $("#placement-materials")?.remove();
    if (tools.pending.kind === "prop" && tools.pending.shape === "box")
      materialPicker(
        $("#placement-settings"),
        tools.pending.surface ?? 0,
        (surface) => {
          tools.place({ ...tools.pending, surface });
        },
        "placement-materials",
      );
  }
  renderInspector();
  $("#cancel-tool").hidden = !["area", "place", "spawn", "patrol", "cliff", "road", "wall"].includes(mode);
}
$("#place-player").onclick = () => {
  if (!busy && !session) tools.setMode("spawn");
};
$("#find-player").onclick = () => {
  if (busy || session) return;
  tools.updateSpawn();
  const p = tools.spawnMarker.position;
  view.orbit.target.copy(p).y += 0.8;
  view.camera.position.set(p.x + 5, p.y + 5, p.z + 7);
  view.orbit.update?.();
  view.invalidate();
  notify("Синяя фигурка — старт героя. Стрелка показывает, куда он смотрит.");
};
$("#play-player").onclick = () => {
  if (!busy && !session) $("#play").click();
};
$("#generate-adventure").onclick = () => {
  if (busy || session) return;
  generatorEditor({
    modal,
    element,
    commit,
    onCreated: () => {
      select("guide");
      $("#home").click();
      notify(
        "Приключение готово. Нажмите «Играть» и поговорите с хранителем у старта.",
      );
    },
  });
};
$("#create-map").onclick = () => {
  if (busy || session) return;
  tools.cancel();
  createMapEditor({
    modal,
    element,
    commit,
    onCreated: (next) => {
      terrainId = next.world.terrain.regions[0].id;
      $("#search").value = "";
      tools.setMode("move");
      render();
      $("#home").click();
      const size = next.world.size.toLocaleString("ru-RU");
      notify(`Создана карта ${size} × ${size} м без границ движения. Можно лепить рельеф и добавлять объекты.`);
    },
  });
};
$("#new").onclick = () => {
  if (busy || session) return;
  const form = document.createElement("form");
  field(form, "Название проекта", "Моя RPG", "text", () => {}).name = "title";
  const note = element(
    "p",
    "Текущий проект останется в истории отмены. Для отдельной копии сначала скачайте его.",
  );
  const label = element("label", "Начать с демонстрационной сцены", "check");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  label.prepend(checkbox);
  const button = element("button", "Создать проект", "primary");
  button.type = "submit";
  form.append(label, note, button);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const next = demoProject();
    next.id = crypto.randomUUID();
    next.title = new FormData(form).get("title");
    if (!checkbox.checked) {
      next.entities = [];
      next.quests = [];
    }
    if (await commit(next)) $("#modal").close();
  };
  modal("Новый проект", form);
};
$("#project-title").title = "Настройки проекта";
$("#project-title").style.cursor = "pointer";
$("#project-title").onclick = () => {
  if (busy || session) return;
  const form = document.createElement("form");
  field(form, "Название проекта", project.title, "text", () => {}).name =
    "title";
  field(
    form,
    "Версия совместимости игрового контента",
    project.contentVersion,
    "number",
    () => {},
  ).name = "version";
  form.append(
    element(
      "p",
      "Увеличьте версию при несовместимом изменении квестов или объектов. Старые сейвы будут отклонены.",
    ),
  );
  const button = element("button", "Применить", "primary");
  button.type = "submit";
  form.append(button);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    if (
      await change((p) => {
        p.title = data.get("title");
        p.contentVersion = Number(data.get("version"));
      })
    )
      $("#modal").close();
  };
  modal("Настройки проекта", form);
};
$("#search").oninput = renderTree;
$("#select-visible").onclick=()=>{tools.cancel();selectMany(visibleEntities().map(e=>e.id));};
$("#clear-selection").onclick=()=>{tools.cancel();selectMany([]);};
$("#expand-world").onclick=openExpansion;
$("#map-boundaries").onclick=()=>{
  if(busy||session)return;tools.cancel();$("#home").click();
  boundaryEditor({project,view,modal,commit,expand:openExpansion,focusObject:id=>{select(id);$("#focus").click();}});
  $("#show-boundaries").setAttribute("aria-pressed","true");
};
$("#show-boundaries").onclick=()=>{const g=view.editorGuides;g.set({bounds:!g.showBounds});$("#show-boundaries").setAttribute("aria-pressed",String(g.showBounds));};
$("#show-collisions").onclick=()=>{const g=view.editorGuides;g.set({collisions:!g.showCollisions});$("#show-collisions").setAttribute("aria-pressed",String(g.showCollisions));};
$("#add").onclick = showCatalog;
$("#undo").onclick = async () => {
  if (busy || session) return;
  const u = [...history.undoStack],
    r = [...history.redoStack];
  const next = history.undo(project);
  if (next && !(await commit(next, { record: false }))) {
    history.undoStack = u;
    history.redoStack = r;
    render();
  }
};
$("#redo").onclick = async () => {
  if (busy || session) return;
  const u = [...history.undoStack],
    r = [...history.redoStack];
  const next = history.redo(project);
  if (next && !(await commit(next, { record: false }))) {
    history.undoStack = u;
    history.redoStack = r;
    render();
  }
};
$("#export").onclick = () =>
  download(`${project.id}.hearth.json`, serializeProject(project));
$("#open").onclick = () => $("#project-file").click();
$("#project-file").onchange = async (e) => {
  const file = e.target.files[0];
  try {
    if (file) {
      await commit(readProject(await file.text()));
    }
  } catch (err) {
    notify(errorText(err));
  }
  e.target.value = "";
};
$("#import-model").onclick = () => {
  actorImportId = null;
  $("#model-file").click();
};
function chooseActorModel(id, slot = "model") {
  $("#model-file").multiple = false; actorImportSlot = slot; actorImportId = id; $("#model-file").click();
}
function showMount() { mountEditor({project, view, modal, commit, importModel: chooseActorModel}); }
function showHeld(id) {heldWeaponEditor({entity: project.entities.find(e => e.id === id), project, view, modal, commit, importModel: chooseActorModel});}
async function importModelFile(input, forActor = null, slot = "model") {
  if (importingModel || busy || session) return;
  const files = Array.isArray(input) ? input : input ? [input] : [];
  if (!files.length) return;
  importingModel = true;
  try {
    const mode = await importOptions({ files, element, modal });
    if (!mode) return;
    const added = [],
      reports = [];
    for (const f of files) {
      notify(`Обработка: ${f.name}…`);
      const result = await processModel(await fileData(f), mode);
      reports.push(`${f.name}: ${result.report}`);
      added.push({
        id: crypto.randomUUID(),
        name:
          mode === "original"
            ? f.name
            : f.name.replace(/\.glb$/i, "") + "-" + mode + ".glb",
        data: result.data,
      });
    }
    const next = structuredClone(project),
      id = added[0].id;
    next.assets.push(...added);
    let changedModel = false;
    if (forActor) {
      const actor = next.entities.find((e) => e.id === forActor);
      if (!actor) throw Error("Персонаж больше не существует.");
      if (slot === "projectile")
        actor.enemy = {...enemyConfig(actor), ranged: {...(actor.enemy?.ranged ?? defaultRanged()), assetId: id}};
      else if (slot === "weapon" || slot === "held")
        actor.heldWeapon = {...(actor.heldWeapon ?? defaultHeldWeapon()), assetId: id};
      else if (slot === "mount") {
        if (next.rpg?.services.horse !== actor.id) throw Error("Маунт больше не назначен в правилах RPG.");
        actor.shape = "model"; actor.assetId = id; actor.solid = false; actor.scale = [1,1,1];
        delete actor.motion; delete actor.moonOnly;
        next.rpg.mount = {...(next.rpg.mount ?? defaultMount()), idle: null, walk: null};
      }
      else if (slot === "corpse")
        actor.enemy = { ...enemyConfig(actor), corpseAssetId: id };
      else if (slot !== "animations" || actor.shape !== "model") {
        changedModel = true;
        actor.shape = "model";
        actor.assetId = id;
        actor.solid = false;
        actor.scale = [1, 1, 1];
        if (actor.kind === "enemy")
          actor.enemy = {
            ...enemyConfig(actor),
            idle: null,
            walk: null,
            attack: null,
            death: null,
            animationSources: {},
          };
        delete actor.npc;
        actor.position[1] = heightAt(
          next.world,
          actor.position[0],
          actor.position[2],
        );
      }
    }
    // WorldView validates every GLB before swapping the scene: the batch is atomic.
    if (await commit(next)) {
      if (forActor) {
        if (changedModel) {
          const actor = project.entities.find((e) => e.id === forActor);
          if (actor.kind === "enemy") {
            const configured = structuredClone(project);
            Object.assign(
              configured.entities.find((e) => e.id === forActor).enemy,
              suggestClips(view.assetModels.get(id)?.animations ?? []),
            );
            await commit(configured);
          }
        }
        if (slot === "mount") {
          const configured = structuredClone(project), clips = view.assetModels.get(id)?.animations ?? [];
          configured.rpg.mount.idle = clips.find(c => /idle|stand|стой/i.test(c.name))?.name ?? null;
          configured.rpg.mount.walk = clips.find(c => /walk|run|ход|бег/i.test(c.name))?.name ?? null;
          await commit(configured); showMount();
        } else if (slot === "held") showHeld(forActor);
        else showActor(forActor);
        if (slot === "animations")
          notify(
            `Добавлено файлов: ${added.length}. Для каждого действия выберите файл анимации и клип.`,
          );
      } else placeEnvironment(id);
      const report = element("p", reports.join("\n"), "model-import-report");
      report.style.whiteSpace = "pre-line";
      $("#modal-body").prepend(report);
      notify(
        "Модели импортированы. Результат обработки показан в окне настроек.",
      );
    }
  } catch (err) {
    notify(errorText(err));
  } finally {
    importingModel = false;
  }
}
$("#model-file").onchange = async (e) => {
  const actor = actorImportId,
    slot = actorImportSlot;
  const files =
    slot === "animations" && actor
      ? Array.from(e.target.files)
      : Array.from(e.target.files).slice(0, 1);
  actorImportId = null;
  actorImportSlot = "model";
  await importModelFile(files, actor, slot);
  e.target.value = "";
  e.target.multiple = false;
};
$("#focus").onclick = () => {
  const bounds=new Box3();for(const id of selection.ids){const o=view.objects.get(id);if(o)bounds.expandByObject(o);}
  if(!bounds.isEmpty()){const center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3()).length();view.orbit.target.copy(center);view.camera.position.copy(center).add(new Vector3(1,.8,1).normalize().multiplyScalar(Math.max(7,size*1.3)));view.orbit.update?.();view.invalidate();}
};
$("#home").onclick = () => {
  if (project.world.size > 160) {
    const size = project.world.size;
    view.camera.position.set(size * 0.6, size * 0.65, size * 0.65);
    view.orbit.target.set(0, Math.max(0, heightAt(project.world, 0, 0) / 2), 0);
  } else {
    view.camera.position.set(24, 23, 29);
    view.orbit.target.set(0, 0, -3);
  }
  view.orbit.update?.();
  view.invalidate();
};
$("#play").onclick = () => {
  if (busy) return;
  tools.cancel();
  if (session) {
    session.dispose();
    session = null;
    document.body.classList.remove("playing");
    $("#play").textContent = "▶ Играть";
    $(".play-controls").hidden = true;
    view.select(selection.ids);
  } else {
    session = new Session(view, project, $("#viewport"), notify, {
      onExit: () => $("#play").click(),
    });
    document.body.classList.add("playing");
    $("#play").textContent = "■ Редактор";
    $(".play-controls").hidden = false;
    notify("Нажмите на сцену для управления. Esc — открыть меню паузы.");
  }
  tools.playChanged();
};
const saveKey = () => `hearth-save:${project.id}:${project.contentVersion}`;
$("#save-game").onclick = () => {
  try {
    localStorage.setItem(saveKey(), session.game.save());
    notify("Игра сохранена на этом устройстве.");
  } catch {
    notify("Не удалось сохранить. Скачайте сейв.");
  }
};
$("#load-game").onclick = () => {
  try {
    const raw = localStorage.getItem(saveKey());
    if (!raw) throw Error("Сохранения пока нет.");
    session.load(raw);
    notify("Сохранение загружено.");
  } catch (err) {
    notify(errorText(err));
  }
};
$("#mouse-report").onclick = () => {
  if (session) download("hearth-mouse.json", session.mouseReport());
};
$("#download-save").onclick = () =>
  download(`${project.id}.save.json`, session.game.save());
$("#import-save").onclick = () => $("#save-file").click();
$("#save-file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024)
        throw Error("Слишком большой файл сохранения");
      session.load(await file.text());
    }
  } catch (err) {
    notify(errorText(err));
  }
  e.target.value = "";
};
$("#world-events-settings").onclick = () =>
  worldEventsEditor({ project, modal, commit });
$("#day-night-settings").onclick = () => {
  if (busy || session) return;
  tools.cancel();
  dayNightEditor({ project, view, element, modal, commit });
};
function openQuest(existing) {
  if (busy || session) return;
  tools.cancel();
  questWizard({ project, modal, element, commit, existing });
}
function showActor(id) {
  if (busy || session) return;
  tools.cancel();
  const entity = project.entities.find((e) => e.id === id);
  if (!entity) return;
  (entity.kind === "npc" ? npcEditor : enemyEditor)({
    entity,
    project,
    view,
    element,
    modal,
    field,
    commit,
    selectEntity: select,
    editPatrol: id => {select(id);tools.setMode("patrol");},
    importModel: (target, slot = "model") => {
      $("#model-file").multiple = slot === "animations";
      actorImportSlot = slot;
      actorImportId = target;
      $("#model-file").click();
    },
  });
}
$("#new-quest").onclick = () => openQuest();
$("#download-editor").onclick = async () => {
  if (busy || session) return;
  tools.cancel();
  const button = $("#download-editor");
  button.disabled = true;
  try {
    const snapshot = serializeProject(project);
    let template = editorSnapshot;
    if (!template) {
      const response = await fetch(new URL("./editor.html", document.baseURI));
      if (!response.ok)
        throw Error("Не удалось загрузить редактор. Проверьте соединение.");
      template = await response.text();
    }
    download(
      "hearth-editor.html",
      exportEditorHTML(template, readProject(snapshot)),
      "text/html;charset=utf-8",
    );
    notify(
      "Редактор и текущий проект сохранены. Откройте HTML в браузере; после изменений скачайте его снова.",
    );
  } catch (err) {
    notify(errorText(err));
  } finally {
    button.disabled = false;
  }
};
$("#build").onclick = () => {
  if (busy || session) return;
  tools.cancel();
  try {
    download(
      `${project.id}.game.html`,
      exportGameHTML(gameTemplate, project),
      "text/html;charset=utf-8",
    );
    notify(
      "Готовая игра скачана одним HTML-файлом: карта, модели и текстуры внутри. Сейвы прохождения создаются отдельно в игровом меню.",
    );
  } catch (err) {
    notify(errorText(err));
  }
};
$("#help").onclick = () =>
  modal(
    "От сцены до приключения",
    `<ol><li><b>Создать карту:</b> кнопка «＋ Создать карту» создаёт пустой ровный рельеф. Задайте название и размер стороны от 20 до 2000 м. Игрок начинает в центре; невидимые границы движения выключены. Весь рельеф сразу доступен для лепки. Предыдущий проект можно вернуть через ↶.</li><li><b>Создать приключение:</b> кнопка «✦ Создать приключение» генерирует мир, сюжет, диалоги и квесты. Выберите вид игры: приключение, лабиринт с ключами и дверями или холмистую долину четырёх городов. Задайте seed и сложность, затем нажмите «Создать игру». Начните разговор с хранителем у старта. Текущую сцену можно вернуть через ↶.</li><li><b>Добавить объект:</b> кнопка «＋ Объект», выбор типа, затем щелчок по земле. До щелчка виден полупрозрачный предпросмотр.</li><li><b>Передвинуть:</b> «Двигать» (G), выберите объект и перетащите его мышью или за цветную стрелку. Y — высота. Кнопка «На землю» ставит объект на поверхность.</li><li><b>Повернуть / изменить размер:</b> кнопки «Вращать» (R) / «Размер» (S), затем кольца или маркеры на объекте. Справа доступны точные числа.</li><li><b>Рельеф:</b> «Область», протяните прямоугольник по земле. «Поднять», «Опустить», «Сгладить»: зажмите ЛКМ и рисуйте кистью. Размер и сила сверху. Esc отменяет незавершённое действие.</li><li><b>Проверить склон:</b> «Старт героя», укажите место, затем «Играть». Герой следует поверхности. Подъёмы круче 50° блокируются; сгладьте их.</li><li><b>Камера редактора:</b> ПКМ — вращение, средняя кнопка — сдвиг, колесо — приближение.</li><li><b>Диалоги:</b> выберите NPC → «Диалоги и ответы». Добавьте реплики, ответы, переходы и условия. Для выдачи задания выберите действие «Принять квест», для отказа оставьте «Только разговор».</li><li>Скачайте проект: он включает рельеф, модели и игровые данные.</li></ol><p>Рельеф — карта высот без пещер и нависающих поверхностей. Пробел — прыжок. Старые проекты открываются в формате v24. Выделение: Ctrl/⌘ + щелчок, Shift в списке — диапазон, B — рамка; Delete удаляет выделение. Ctrl/⌘+Z отменяет, Ctrl/⌘+Shift+Z возвращает действие. Кнопка «Расширить карту» добавляет территорию по краям; «Область» только ограничивает кисть. «Границы карты» задаёт доступную игроку область. Переключатели «Граница» и «Преграды» показывают невидимые ограничения только в редакторе. Для оружия выберите персонажа → «Оружие в руке»: кисть определяется автоматически, затем можно уточнить кость, хват, смещение и поворот. RPG · правила — настои, награды, конь и корабль.</p>`,
  );
try {
  try {
    const saved = embeddedProject
      ? embeddedProject.textContent
      : await draft("read");
    if (saved) project = readProject(saved);
    else if (!embeddedProject) {
      const response = await fetch("./world.json");
      if (response.ok) project = readProject(await response.text());
    }
  } catch (err) {
    notify("Черновик не загружен: " + errorText(err));
  }
  view = new WorldView($("#viewport"));
  await view.load(project);
  view.editorGuides = new BoundaryGuides(view);
  view.editorGuides.onChange=()=>{const g=view.editorGuides;$("#show-boundaries").setAttribute("aria-pressed",String(g.showBounds));$("#show-collisions").setAttribute("aria-pressed",String(g.showCollisions));const legend=$("#boundary-legend");legend.hidden=!g.showBounds&&!g.showCollisions;legend.textContent=[g.showBounds?(g.previewWorld??view.project.world).playBounds?"Голубой — явно заданная граница игрока":"Ограничение движения выключено":"",g.showCollisions?"Оранжевый — преграды объектов":""].filter(Boolean).join(" · ");};
  if (project.world.size > 160) $("#home").click();
  tools = new SceneTools(view, {
    getProject: () => project,
    getSelected: () => selected,
    getSelection: () => [...selection.ids],
    selectMany,
    selectAll: () => selectMany(visibleEntities().map(e=>e.id)),
    deleteSelection,
    undo: () => $("#undo").click(),
    redo: () => $("#redo").click(),
    getRegion: () =>
      project.world.terrain?.regions.find((r) => r.id === terrainId),
    setRegion: (id) => (terrainId = id),
    commit,
    select,
    notify,
    isBusy: () => busy || Boolean(session),
    snap: () => snapToGround,
    brush: () => ({
      radius: Number($("#brush-radius").value),
      strength: Number($("#brush-strength").value),
      material: brushMaterial,
      paintWithSculpt,
      roadMaterial,
      roadGrade,
    }),
    wallBrush: () => ({...wallSettings, asset:castleWallAsset}),
    toggleWallLine,
    modeChanged,
    repeatPlacement: (e) =>
      e?.kind !== "enemy" &&
      e?.shape !== "door" &&
      $("#placement-repeat").checked,
    placed: (e) => {
      if (e.kind === "enemy") showActor(e.id);
      if (e.shape === "door") {
        tools.cancel();
        motionEditor({
          entity: project.entities.find((x) => x.id === e.id),
          project,
          view,
          element,
          modal,
          field,
          commit,
        });
      }
    },
    spawnHint: (text) => {
      $("#spawn-instructions").textContent = text;
    },
    gestureChanged: (active) =>
      document.body.classList.toggle("editing-gesture", active),
    transformsPreview: ids => {view.touchObjects(ids);view.editorGuides?.refresh();},
    transformPreview: (object) => {
      view.touchObject(object.userData.id);
      view.editorGuides?.refresh();
      if(selection.ids.length>1)return;
      for (const input of document.querySelectorAll("[data-transform]")) {
        const key = input.dataset.transform,
          axis = Number(input.dataset.axis),
          value =
            key === "rotation"
              ? [object.rotation.x, object.rotation.y, object.rotation.z]
              : object[key].toArray();
        input.value = (
          value[axis] * (key === "rotation" ? 180 / Math.PI : 1)
        ).toFixed(2);
      }
    },
  });
  installMobileEditor(view, tools);
  render();
  try{const saved=localStorage.getItem("hearth-editor-quality:v1");if(QUALITY_OPTIONS.some(([id])=>id===saved))$("#quality").value=saved;}catch{}
  view.setQuality($("#quality").value);
  $("#quality").onchange=e=>{view.setQuality(e.target.value);try{localStorage.setItem("hearth-editor-quality:v1",e.target.value);}catch{}};
  const natureButton=element("button","♧ Ландшафт");natureButton.id="landscape-settings";natureButton.onclick=()=>landscapeEditor({project,element,modal,commit});$("#quality").closest("label").before(natureButton);
  // Overlay and gizmo interactions can change visibility without moving the camera.
  for (const event of ["pointerdown", "pointerup", "keydown", "click", "input"])
    document.addEventListener(event, () => view.invalidate());
  $("#status").textContent = "● Готово к работе";
  setInterval(
    () =>
      ($("#render-stats").textContent =
        `· ${view.renderer.info.render.triangles.toLocaleString()} треуг.`),
    1000,
  );
} catch (err) {
  $("#status").textContent = "Ошибка запуска";
  notify("Не удалось запустить WebGL: " + errorText(err));
}

$("#rpg-settings").onclick = () => {
  if (!busy && !session) rpgEditor({ project, element, field, modal, commit, openMount: showMount });
};

$("#audio-settings").onclick = () => {
  if (busy || session) return;
  tools.cancel();
  audioEditor({ project, element, modal, commit });
};

$("#video-settings").onclick = () => {
  if (busy || session) return;
  tools.cancel();
  videoEditor({ project, element, modal, commit });
};
