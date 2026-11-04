import { DAY_NIGHT_DEFAULTS, timeLabel } from "../core/day-night.js";
import { stopEnemyPreview } from "./enemy-editor.js";
export function dayNightEditor({ project, view, element, modal, commit }) {
  stopEnemyPreview(view);
  const config = { ...DAY_NIGHT_DEFAULTS, ...project.world.dayNight };
  const box = element("div", "", "enemy-editor");
  box.append(
    element(
      "p",
      "Солнце, луна, звёзды, цвет неба и освещение плавно меняются в течение суток. Настройки ниже сразу показываются в сцене; сохраните их для игры.",
    ),
  );
  const enabled = element("input");
  enabled.type = "checkbox";
  enabled.id = "day-night-enabled";
  enabled.checked = config.enabled;
  const label = element("label", " Включить смену дня и ночи", "check");
  label.prepend(enabled);
  box.append(label);
  const duration = element("input");
  duration.type = "number";
  duration.min = 1;
  duration.max = 10080;
  duration.step = 1;
  duration.value = config.dayMinutes;
  duration.id = "day-night-duration";
  const dl = element(
    "label",
    "Полные сутки за сколько реальных минут?",
    "field",
  );
  dl.append(duration);
  box.append(dl);
  const time = element("input");
  time.type = "time";
  time.step = 60;
  time.value = timeLabel(config.startHour);
  time.id = "day-night-start";
  const tl = element("label", "Время в начале новой игры", "field");
  tl.append(time);
  box.append(tl);
  const summary = element("p");
  summary.id = "day-night-summary";
  box.append(summary);
  const error = element("p", "", "wizard-error");
  error.setAttribute("role", "alert");
  box.append(error);
  const read = () => {
    const parts = time.value.split(":").map(Number),
      minutes = Number(duration.value);
    if (
      parts.length !== 2 ||
      !parts.every(Number.isFinite) ||
      parts[0] < 0 ||
      parts[0] >= 24 ||
      parts[1] < 0 ||
      parts[1] >= 60 ||
      !Number.isFinite(minutes) ||
      minutes < 1 ||
      minutes > 10080
    )
      throw Error("Укажите время и длительность суток от 1 до 10080 минут.");
    return {
      enabled: enabled.checked,
      dayMinutes: minutes,
      startHour: parts[0] + parts[1] / 60,
    };
  };
  const preview = () => {
    try {
      const c = read();
      error.textContent = "";
      summary.textContent = `1 игровой час = ${((c.dayMinutes * 60) / 24).toFixed(1)} реальных секунд. Рассвет около 06:00, закат около 18:00.`;
      view.applyTime(c.startHour, c, true);
    } catch (e) {
      error.textContent = e.message;
    }
  };
  enabled.onchange = preview;
  duration.oninput = preview;
  time.oninput = preview;
  const presets = element("div", "", "button-row");
  for (const [hour, title] of [
    [6, "Рассвет"],
    [12, "Полдень"],
    [18, "Закат"],
    [0, "Ночь"],
  ]) {
    const b = element("button", title);
    b.dataset.hour = hour;
    b.onclick = () => {
      time.value = timeLabel(hour);
      preview();
    };
    presets.append(b);
  }
  box.append(
    presets,
    element(
      "small",
      "Время идёт только во время активной игры. Esc, диалог и гибель героя ставят его на паузу. Сейв хранит текущий час; выход из игры возвращает редактор к стартовому времени. Выключение цикла возвращает обычное освещение.",
    ),
  );
  const save = element("button", "✓ Сохранить цикл", "primary");
  save.id = "day-night-save";
  save.onclick = async () => {
    try {
      const next = structuredClone(project);
      next.world.dayNight = read();
      stopEnemyPreview(view);
      if (await commit(next)) document.querySelector("#modal").close();
    } catch (e) {
      error.textContent = e.message;
    }
  };
  box.append(save);
  modal("☀ День и ночь", box);
  view.previewCleanup = () => view.applyTime(undefined, undefined, true);
  preview();
}
