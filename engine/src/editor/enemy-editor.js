import { rangedFields } from "./ranged-fields.js";
import { defaultHeldWeapon } from "../render/held-weapon.js";
import * as T from "three";
import { clipFits } from "../render/enemy-clips.js";
import { heightAt } from "../core/terrain.js";
import { enemyConfig, suggestClips } from "../core/enemy.js";
import { readProject, renameEntity } from "../core/project.js";
export function stopEnemyPreview(view) {
  if (!view) return;
  view.previewCleanup?.();
  view.previewCleanup = null;
  view.editorPreview = null;
  view.invalidate?.(true);
}
export function enemyEditor({
  entity,
  project,
  view,
  element,
  modal,
  field,
  commit,
  importModel,
  selectEntity,
  editPatrol,
}) {
  const cfg = enemyConfig(entity);
  const held = structuredClone(entity.heldWeapon ?? defaultHeldWeapon());
  let heldEnabled = !!entity.heldWeapon;
  let asset = entity.shape === "model" ? entity.assetId : "builtin";
  if (!entity.enemy && asset !== "builtin")
    Object.assign(
      cfg,
      suggestClips(view.assetModels.get(asset)?.animations ?? []),
    );
  const box = element("div", "", "enemy-editor");
  box.append(
    element(
      "p",
      "Враг уже стоит на карте. Настройте его, сохраните и нажмите «Играть». Повторно открыть эту форму можно в свойствах врага.",
    ),
  );
  box.append(element("h3", "1 · Имя и цель для квестов"));
  const name = field(box, "Имя в игре", entity.name, "text", () => {});
  name.id = "enemy-name";
  const id = field(box, "ID врага", entity.id, "text", () => {});
  id.id = "enemy-id";
  id.maxLength = 80;
  box.append(
    element(
      "small",
      "Уникальный ID: латинские буквы, цифры, _ и -. В квесте выбирайте врага по имени и ID. Смена ID обновит ссылки квестов и дверей и повысит версию контента: прежние игровые сейвы после этого не загрузятся.",
    ),
  );
  const health = field(box, "Здоровье", entity.health, "number", () => {});
  health.id = "enemy-health";
  health.min = 1;
  health.max = 10000;
  health.step = 1;
  box.append(element("h3", "2 · Модель и анимации"));
  const assetSelect = (label, selected, empty, nodeId) => {
    const l = element("label", label, "field"),
      s = element("select");
    s.id = nodeId;
    for (const a of [{ id: "builtin", name: empty }, ...project.assets]) {
      const o = element("option", a.name);
      o.value = a.id;
      s.append(o);
    }
    s.value = selected || "builtin";
    l.append(s);
    box.append(l);
    return s;
  };
  const model = assetSelect(
    "Живой враг",
    asset,
    "Встроенный страж",
    "enemy-model",
  );
  const importButton = element(
    "button",
    "＋ Импортировать GLB врага с анимациями",
  );
  importButton.id = "enemy-import";
  box.append(importButton);
  box.append(
    element(
      "small",
      "Можно выбрать несколько GLB сразу и добавлять новые позже. Первый файл задаёт модель, если её ещё нет; следующие добавляют клипы. Основная модель и назначенные действия не заменяются. Для каждого действия выберите ассет из списка ниже.",
    ),
  );
  const anim = element("div");
  box.append(anim);
  const animations = () => {
    anim.replaceChildren();
    const ownClips = view.assetModels.get(asset)?.animations ?? [];
    const clips = project.assets.flatMap(
      (a) => view.assetModels.get(a.id)?.animations ?? [],
    );
    anim.append(
      element(
        "p",
        asset === "builtin"
          ? "Страж уже умеет двигаться. Чтобы использовать свои анимации, сначала выберите свою модель в списке «Живой враг»."
          : clips.length
            ? "Выберите ассет для каждого действия. Здесь видны все импортированные GLB, включая основную модель. Серые пункты объясняют, почему ассет нельзя использовать."
            : "Клипов нет: ходьба и удар будут без анимации, смерть — простое падение. Импортируйте GLB с анимациями на одном скелете.",
      ),
    );
    for (const [key, label] of [
      ["idle", "Покой"],
      ["walk", "Ходьба"],
      ["attack", "Удар"],
      ["death", "Смерть"],
    ]) {
      const sourceLabel = element("label", label, "field");
      const source = element("select");
      source.id = "enemy-" + key + "-source";
      const none = element(
        "option",
        asset === "builtin" ? "Готовая анимация стража" : "Без анимации",
      );
      none.value = "";
      source.append(none);
      for (const a of project.assets) {
        const available = view.assetModels.get(a.id)?.animations ?? [];
        const fits = available.some(
          (c) =>
            a.id === asset || clipFits(c, view.assetModels.get(asset)?.scene),
        );
        const note = !available.length
          ? " — нет анимаций"
          : asset !== "builtin" && !fits
            ? " — не подходит к этой модели"
            : "";
        const option = element("option", a.name + note);
        option.value = a.id;
        option.disabled = !available.length || (asset !== "builtin" && !fits);
        source.append(option);
      }
      source.value = cfg[key]
        ? (cfg.animationSources[key] ?? (asset === "builtin" ? "" : asset))
        : "";
      source.disabled = asset === "builtin";
      source.onchange = () => {
        stopEnemyPreview(view);
        const selected = source.value;
        if (selected && selected !== asset)
          cfg.animationSources[key] = selected;
        else delete cfg.animationSources[key];
        const available = (
          view.assetModels.get(selected)?.animations ?? []
        ).filter(
          (c) =>
            selected === asset ||
            clipFits(c, view.assetModels.get(asset)?.scene),
        );
        cfg[key] = suggestClips(available)[key] ?? available[0]?.name ?? null;
        if (key === "attack" && cfg[key]) {
          cfg.duration = Math.max(
            0.3,
            Math.min(5, available.find((c) => c.name === cfg[key]).duration),
          );
          duration.value = cfg.duration;
        }
        animations();
      };
      sourceLabel.append(source);
      anim.append(sourceLabel);
      const clips = view.assetModels.get(source.value)?.animations ?? [];
      if (clips.length > 1) {
        const l = element(
            "label",
            "В этом ассете несколько анимаций — выберите нужную",
            "field",
          ),
          s = element("select");
        s.id = "enemy-" + key;
        for (const c of clips) {
          const option = element("option", c.name);
          option.value = c.name;
          option.disabled =
            source.value !== asset &&
            !clipFits(c, view.assetModels.get(asset)?.scene);
          s.append(option);
        }
        s.value = cfg[key] ?? "";
        s.onchange = () => {
          stopEnemyPreview(view);
          cfg[key] = s.value;
          if (key === "attack") {
            cfg.duration = Math.max(
              0.3,
              Math.min(5, clips.find((c) => c.name === s.value).duration),
            );
            duration.value = cfg.duration;
          }
        };
        l.append(s);
        anim.append(l);
      }
      const preview = element("button", `▶ Проверить: ${label.toLowerCase()}`);
      preview.disabled =
        asset !== (entity.shape === "model" ? entity.assetId : "builtin");
      preview.title = preview.disabled
        ? "Сохраните новую модель и откройте настройки снова"
        : "";
      preview.onclick = () => {
        stopEnemyPreview(view);
        document.querySelector("#modal").classList.add("preview-dialog");
        const o = view.objects.get(entity.id),
          m = o.userData.enemyModel;
        const original = o.rotation.clone(),
          position = o.position.clone();
        const clip = clips.find((c) => c.name === cfg[key]);
        let time = 0,
          mixer;
        if (m && clip && source.value && !clipFits(clip, m)) {
          error.textContent =
            "Клип не подходит к основной модели: имена узлов/костей не совпадают.";
          return;
        }
        if (m && clip) {
          mixer = new T.AnimationMixer(m);
          const action = mixer.clipAction(clip);
          if (key === "death") {
            action.setLoop(T.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          action.play();
        }
        view.editorPreview = (dt) => {
          time += dt;
          mixer?.update(dt);
          if (key === "death" && !mixer) {
            const p = Math.min(1, time);
            o.rotation.x = original.x - (Math.PI / 2) * p * p * (3 - 2 * p);
            o.updateMatrixWorld(true);
            const b = new T.Box3().setFromObject(o);
            o.position.y +=
              heightAt(project.world, o.position.x, o.position.z) - b.min.y;
          } else
            o.userData.enemyPose?.(
              key,
              time,
              (time % cfg.duration) / cfg.duration,
            );
          view.invalidate(true);
        };
        view.previewCleanup = () => {
          mixer?.stopAllAction();
          if (m) mixer?.uncacheRoot(m);
          o.rotation.copy(original);
          o.position.copy(position);
          o.userData.enemyPose?.("idle", 0);
          o.updateMatrixWorld(true);
        };
        view.orbit.target.copy(o.position);
        view.orbit.target.y += 1;
        view.camera.position.copy(o.position).add(new T.Vector3(3, 2, 4));
        view.orbit.update?.();
      };
      anim.append(preview);
    }
  };
  model.onchange = () => {
    stopEnemyPreview(view);
    asset = model.value;
    const suggested = suggestClips(
      view.assetModels.get(asset)?.animations ?? [],
    );
    for (const key of ["idle", "walk", "attack", "death"])
      if (!cfg.animationSources[key]) cfg[key] = suggested[key];
    animations();
  };
  box.append(element("h3", "3 · После смерти"));
  const corpse = assetSelect(
    "Модель трупа",
    cfg.corpseAssetId,
    "Оставить врага в конечной позе смерти",
    "enemy-corpse",
  );
  corpse.onchange = () =>
    (cfg.corpseAssetId = corpse.value === "builtin" ? null : corpse.value);
  const importCorpse = element("button", "＋ Импортировать GLB трупа");
  importCorpse.id = "enemy-corpse-import";
  box.append(importCorpse);
  const corpseScale = field(
    box,
    "Масштаб модели трупа ×",
    cfg.corpseScale,
    "number",
    (v) => (cfg.corpseScale = Number(v)),
  );
  corpseScale.id = "enemy-corpse-scale";
  corpseScale.min = 0.001;
  corpseScale.max = 1000;
  field(
    box,
    "Поворот модели трупа, °",
    (cfg.corpseFacing * 180) / Math.PI,
    "number",
    (v) => (cfg.corpseFacing = (Number(v) * Math.PI) / 180),
  );
  box.append(
    element(
      "small",
      "Отдельный труп появляется после анимации смерти. Подготовьте лежащую модель: 1 единица = 1 метр, Y вверх. Основание ставится на землю, масштаб врага также учитывается. Труп декоративный: не атакует, не блокирует проход и не выдаёт повторную награду.",
    ),
  );
  box.append(element("h3", "4 · Бой и движение"));
  for (const [key, label, min, max, step] of [
    ["damage", "Сила атаки · урон за удар", 1, 100, 1],
    ["speed", "Скорость ходьбы, м/с", 0, 10, 0.1],
    ["notice", "Замечает игрока, м", 1, 100, 0.1],
    ["reach", "Дальность удара, м", 0.5, 5, 0.1],
    ["cooldown", "Интервал атак, с", 0.3, 10, 0.1],
  ]) {
    const i = field(
      box,
      label,
      cfg[key],
      "number",
      (v) => (cfg[key] = Number(v)),
    );
    i.id = "enemy-" + key;
    i.min = min;
    i.max = max;
    i.step = step;
  }
  const duration = field(
    box,
    "Длительность удара, с",
    cfg.duration,
    "number",
    (v) => (cfg.duration = Number(v)),
  );
  duration.min = 0.3;
  duration.max = 5;
  field(
    box,
    "Попадание на % анимации (10–90)",
    cfg.impact * 100,
    "number",
    (v) => (cfg.impact = Number(v) / 100),
  );
  field(
    box,
    "Поворот живой модели, °",
    (cfg.facing * 180) / Math.PI,
    "number",
    (v) => (cfg.facing = (Number(v) * Math.PI) / 180),
  );
  box.append(
    element(
      "small",
      "Живая модель приводится к росту 1.8 м. Ходьба должна быть на месте (in-place). Клипы можно брать из нескольких GLB с совместимым скелетом. FBX/BVH и перенос между разными скелетами не поддерживаются.",
    ),
  );
  rangedFields({box, cfg, project, element, field, importAsset: slot => runImport(slot)});
  const weapon = assetSelect("Оружие в руке", held.assetId, "Без оружия / оставить встроенное", "enemy-held-model");
  weapon.onchange = () => {heldEnabled = weapon.value !== "builtin"; held.assetId = heldEnabled ? weapon.value : null;};
  const importWeapon = element("button", "＋ Импортировать GLB оружия");
  importWeapon.id = "enemy-held-import"; importWeapon.onclick = () => runImport("weapon"); box.append(importWeapon);
  box.append(element("small", "Кисть, место хвата, размер и поворот настраиваются кнопкой «Оружие в руке» в свойствах персонажа."));
  const error = element("p", "", "wizard-error");
  error.id = "enemy-error";
  error.setAttribute("role", "alert");
  box.append(error);
  const saveData = async () => {
    stopEnemyPreview(view);
    try {
      for (const key of ["idle", "walk", "attack", "death"]) {
        const source = cfg.animationSources[key];
        if (source && cfg[key]) {
          const clip = view.assetModels
            .get(source)
            ?.animations?.find((c) => c.name === cfg[key]);
          if (!clip || !clipFits(clip, view.assetModels.get(asset)?.scene))
            throw Error(
              `Анимация ${key}: файл несовместим с выбранной моделью.`,
            );
        }
      }
      const next = structuredClone(project),
        e = next.entities.find((e) => e.id === entity.id);
      renameEntity(next, entity.id, id.value.trim());
      e.name = name.value.trim();
      e.health = Number(health.value);
      e.enemy = { ...cfg };
      if (heldEnabled) e.heldWeapon = held; else delete e.heldWeapon;
      e.solid = false;
      const nextAsset = asset === "builtin" ? undefined : asset;
      if (
        entity.assetId !== nextAsset ||
        entity.shape !== (nextAsset ? "model" : "humanoid")
      ) {
        e.scale = [1, 1, 1];
        e.position[1] = heightAt(next.world, e.position[0], e.position[2]);
      }
      e.shape = nextAsset ? "model" : "humanoid";
      if (nextAsset) e.assetId = nextAsset;
      else delete e.assetId;
      const checked = readProject(next);
      if (!(await commit(checked))) {
        error.textContent =
          "Не удалось сохранить. Проверьте сообщение в редакторе.";
        return false;
      }
      selectEntity?.(e.id);
      return e.id;
    } catch (err) {
      error.textContent =
        "Проверьте ID, ссылки на модели и диапазоны числовых параметров. " +
        err.message;
      return false;
    }
  };
  const runImport = async (target) => {
    const id = await saveData();
    if (!id) return;
    document.querySelector("#modal").close();
    importModel(id, target);
  };
  importButton.onclick = () => runImport("animations");
  importCorpse.onclick = () => runImport("corpse");
  const save = element("button", "✓ Сохранить врага", "primary");
  save.id = "enemy-save";
  save.onclick = async () => {
    if (await saveData()) document.querySelector("#modal").close();
  };
  box.append(save);
  if (editPatrol) {
    const route = element("button", "⌁ Сохранить и задать маршрут на карте");
    route.id = "enemy-patrol-edit";
    route.onclick = async () => {
      const id = await saveData();
      if (id) {document.querySelector("#modal").close();editPatrol(id);}
    };
    box.append(route);
  }
  animations();
  modal(`Враг: ${entity.name}`, box);
}
