import * as T from "three";
import { heightAt } from "../core/terrain.js";
import { npcConfig } from "../render/npcs.js";
import { stopEnemyPreview } from "./enemy-editor.js";
export function npcEditor({
  entity,
  project,
  view,
  element,
  modal,
  field,
  commit,
  importModel,
}) {
  let asset = entity.shape === "model" ? entity.assetId : "builtin";
  const cfg = npcConfig(entity, view.assetModels.get(asset)?.animations ?? []),
    box = element("div", "", "npc-editor");
  let dialogue = entity.dialogue;
  box.append(
    element(
      "p",
      "1. Выберите модель → 2. Назначьте покой и разговор → 3. Напишите реплику. В игре подойдите к NPC и нажмите E.",
    ),
  );
  const label = element("label", "Модель NPC", "field"),
    select = element("select");
  select.id = "npc-model";
  for (const a of [
    { id: "builtin", name: "Встроенный персонаж · готовые жесты" },
    ...project.assets,
  ]) {
    const o = element("option", a.name);
    o.value = a.id;
    select.append(o);
  }
  select.value = asset;
  label.append(select);
  box.append(label);
  const upload = element("button", "＋ Импортировать GLB NPC с анимациями");
  upload.id = "npc-import";
  upload.onclick = () => {
    stopEnemyPreview(view);
    document.querySelector("#modal").close();
    importModel(entity.id);
  };
  box.append(upload);
  const animations = element("div");
  box.append(animations);
  const show = () => {
    animations.replaceChildren();
    const clips = view.assetModels.get(asset)?.animations ?? [];
    animations.append(
      element(
        "p",
        asset === "builtin"
          ? "Встроенный персонаж жестикулирует во время разговора."
          : clips.length
            ? `В GLB найдено клипов: ${clips.length}. Выберите нужные.`
            : "Анимаций в GLB нет. NPC будет статичным. Экспортируйте модель и клипы вместе.",
      ),
    );
    for (const [key, name] of [
      ["idle", "Покой"],
      ["talk", "Разговор"],
    ]) {
      const l = element("label", name, "field"),
        s = element("select");
      s.id = "npc-" + key;
      for (const c of [{ name: "", duration: 0 }, ...clips]) {
        const o = element(
          "option",
          c.name ? `${c.name} · ${c.duration.toFixed(2)} с` : "Без клипа",
        );
        o.value = c.name;
        s.append(o);
      }
      s.value = cfg[key] ?? "";
      s.disabled = asset === "builtin";
      s.onchange = () => (cfg[key] = s.value || null);
      l.append(s);
      animations.append(l);
      const preview = element("button", `▶ Проверить: ${name.toLowerCase()}`);
      preview.dataset.npcPreview = key;
      preview.disabled =
        asset !== (entity.shape === "model" ? entity.assetId : "builtin");
      preview.title = preview.disabled
        ? "Сначала сохраните новую модель, затем откройте настройки снова"
        : "";
      preview.onclick = () => {
        stopEnemyPreview(view);
        document.querySelector("#modal").classList.add("preview-dialog");
        const o = view.objects.get(entity.id),
          model = o.userData.npcModel;
        let time = 0,
          mixer;
        const clip = clips.find((c) => c.name === cfg[key]);
        if (model && clip) {
          mixer = new T.AnimationMixer(model);
          mixer.clipAction(clip).play();
        }
        view.editorPreview = (dt) => {
          time += dt;
          mixer?.update(dt);
          o.userData.npcPose?.(key, time);
          view.invalidate(true);
        };
        view.previewCleanup = () => {
          mixer?.stopAllAction();
          if (model) mixer?.uncacheRoot(model);
          o.userData.npcPose?.("idle", 0);
        };
        view.orbit.target.copy(o.position).y += 1;
        view.camera.position.copy(o.position).add(new T.Vector3(3, 2, 4));
        view.orbit.update?.();
      };
      animations.append(preview);
    }
  };
  select.onchange = () => {
    stopEnemyPreview(view);
    asset = select.value;
    Object.assign(
      cfg,
      npcConfig({}, view.assetModels.get(asset)?.animations ?? []),
    );
    show();
  };
  field(
    box,
    "Поворот модели, °",
    (cfg.facing * 180) / Math.PI,
    "number",
    (v) => (cfg.facing = (Number(v) * Math.PI) / 180),
  );
  field(
    box,
    "Обычная реплика (без дерева диалога)",
    dialogue,
    "textarea",
    (v) => (dialogue = v),
  );
  box.append(
    element(
      "p",
      "Ветки разговора настраиваются отдельно: выберите NPC → «Диалоги и ответы». Клипы должны быть в одном GLB и использовать скелет этой модели. Разговор зациклен, пока открыто окно диалога. Если клипа разговора нет, остаётся покой. Рост — 1.8 м; размер меняется масштабом в свойствах.",
    ),
  );
  const save = element("button", "✓ Сохранить NPC", "primary");
  save.id = "npc-save";
  save.onclick = async () => {
    stopEnemyPreview(view);
    const p = structuredClone(project),
      e = p.entities.find((e) => e.id === entity.id),
      shape = asset === "builtin" ? "humanoid" : "model";
    if (
      e.shape !== shape ||
      e.assetId !== (asset === "builtin" ? undefined : asset)
    ) {
      e.scale = [1, 1, 1];
      e.position[1] = heightAt(p.world, e.position[0], e.position[2]);
    }
    e.shape = shape;
    e.npc = cfg;
    e.dialogue = dialogue;
    e.solid = false;
    if (asset === "builtin") delete e.assetId;
    else e.assetId = asset;
    if (await commit(p)) document.querySelector("#modal").close();
  };
  box.append(save);
  show();
  modal(`NPC: ${entity.name}`, box);
}
