import { createMap, validateMapSize, MIN_MAP_SIZE, MAX_MAP_SIZE } from "../core/create-map.js";

export function createMapEditor({ modal, element, commit, onCreated = () => {} }) {
  const form = element("form", "", "expand-world-editor generator-form");
  form.append(element("p", "Создайте пустую ровную карту без объектов, квестов и невидимых стен. Размер задаёт площадь рельефа и не ограничивает перемещение."));
  const title = element("input");
  Object.assign(title, { id: "new-map-title", name: "title", value: "Новая карта", required: true, maxLength: 160 });
  const size = element("input");
  Object.assign(size, { id: "new-map-size", name: "size", type: "number", min: MIN_MAP_SIZE, max: MAX_MAP_SIZE, step: "any", value: 80, required: true });
  for (const [label, input] of [["Название карты", title], ["Размер стороны карты, м", size]]) {
    const row = element("label", label, "field");
    row.append(input);
    form.append(row);
  }
  const hint = element("small", `Длина стороны — от ${MIN_MAP_SIZE} до ${MAX_MAP_SIZE} м. Игрок появится в центре карты.`, "inspector-hint");
  hint.id = "new-map-hint";
  size.setAttribute("aria-describedby", hint.id);
  const preview = element("output");
  preview.id = "new-map-preview";
  preview.setAttribute("aria-live", "polite");
  const error = element("p", "", "wizard-error");
  error.setAttribute("role", "alert");
  const note = element("p", "Текущий проект будет заменён. Его можно вернуть кнопкой ↶ или Ctrl/⌘+Z. Для отдельной копии сначала скачайте проект.");
  const actions = element("div", "", "button-row");
  const cancel = element("button", "Отмена");
  cancel.type = "button";
  cancel.id = "new-map-cancel";
  cancel.onclick = () => document.querySelector("#modal").close();
  const apply = element("button", "Создать карту", "primary");
  apply.type = "submit";
  apply.id = "new-map-create";
  actions.append(cancel, apply);
  form.append(hint, preview, error, note, actions);
  let submitting = false;
  function draw() {
    try {
      const value = validateMapSize(size.valueAsNumber).toLocaleString("ru-RU");
      preview.textContent = `${value} × ${value} м · Ограничение движения выключено`;
      error.textContent = "";
      apply.disabled = submitting;
    } catch (e) {
      preview.textContent = "";
      error.textContent = e.message;
      apply.disabled = true;
    }
  }
  size.oninput = draw;
  title.oninput = () => { error.textContent = ""; };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    apply.disabled = cancel.disabled = true;
    title.disabled = size.disabled = true;
    form.setAttribute("aria-busy", "true");
    error.textContent = "";
    try {
      const next = createMap({ title: title.value, size: size.valueAsNumber });
      if (await commit(next)) {
        document.querySelector("#modal").close();
        onCreated(next);
      } else {
        error.textContent = "Не удалось создать карту. Текущий проект сохранён; попробуйте ещё раз.";
      }
    } catch (e) {
      error.textContent = e.message;
    } finally {
      submitting = false;
      apply.disabled = cancel.disabled = false;
      title.disabled = size.disabled = false;
      form.removeAttribute("aria-busy");
    }
  };
  draw();
  modal("Создать карту без границ", form);
}
