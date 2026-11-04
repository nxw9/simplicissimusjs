import { TOUCH, Vector3 } from "three";

export function installMobileEditor(view, tools) {
  const media = window.matchMedia?.("(pointer: coarse), (max-width: 900px)");
  if (!media) return;
  const bar = document.createElement("nav");
  bar.className = "mobile-editor";
  bar.setAttribute("aria-label", "Мобильный редактор");
  bar.innerHTML = `<div class="mobile-panels"><button data-panel="map">Карта</button><button data-panel="scene">Объекты</button><button data-panel="properties">Свойства</button><button data-panel="assets">Ассеты</button></div><div class="mobile-camera"><button data-camera="rotate">↻ Обзор</button><button data-camera="pan">↔ Сдвиг</button><button data-camera="edit">✎ Правка</button><button data-zoom="0.8" aria-label="Приблизить">＋</button><button data-zoom="1.25" aria-label="Отдалить">−</button><button data-home>⌂</button></div><small class="mobile-hint"></small>`;
  document.getElementById("app").append(bar);
  const panel = (value) => {
    document.body.dataset.mobilePanel = value;
    bar.querySelectorAll("[data-panel]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.panel === value)));
    view.invalidate?.();
  };
  const camera = (value) => {
    if (view.playing) return;
    if (tools.gesture) tools.cancel();
    tools.touchNavigation = media.matches && value !== "edit";
    view.orbit.touches = { ONE: value === "pan" ? TOUCH.PAN : TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    tools.attach();
    bar.querySelectorAll("[data-camera]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.camera === value)));
    bar.querySelector(".mobile-hint").textContent = value === "edit"
      ? "Касание — выбрать / поставить. Ведите пальцем — двигать объект или лепить рельеф."
      : "Один палец — " + (value === "pan" ? "сдвиг" : "обзор") + ". Два — масштаб и сдвиг. Для изменений нажмите «Правка».";
    panel("map");
  };
  bar.querySelectorAll("[data-panel]").forEach(b => b.onclick = () => panel(b.dataset.panel));
  bar.querySelectorAll("[data-camera]").forEach(b => b.onclick = () => camera(b.dataset.camera));
  bar.querySelectorAll("[data-zoom]").forEach(b => b.onclick = () => {
    if (view.playing) return;
    const offset = new Vector3().subVectors(view.camera.position, view.orbit.target);
    const distance = Math.max(2, Math.min(160, offset.length() * Number(b.dataset.zoom)));
    view.camera.position.copy(view.orbit.target).add(offset.setLength(distance));
    view.orbit.update(); view.invalidate?.();
  });
  bar.querySelector("[data-home]").onclick = () => document.getElementById("home").click();
  const modeChanged = tools.cb.modeChanged;
  tools.cb.modeChanged = (mode) => {
    modeChanged(mode);
    if (media.matches) camera("edit");
  };
  const update = () => {
    document.body.classList.toggle("mobile-studio", media.matches);
    camera(media.matches ? "rotate" : "edit");
  };
  media.addEventListener("change", update);
  update();
}
