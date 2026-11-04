import { canSimplify } from "./model-geometry.js";
import { BufferGeometryLoader } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { decodeGLB } from "../core/assets.js";
// Keep the WASM simplifier in its worker, not the editor's main bundle.
export function importOptions({ files, element, modal }) {
  return new Promise((resolve) => {
    const box = element("div");
    box.append(
      element(
        "p",
        `Файлов: ${files.length}. Размер: ${(files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1)} МиБ. Лимита размера нет; доступный объём зависит от памяти браузера.`,
      ),
    );
    const label = element("label", "Обработка модели", "field"),
      select = element("select");
    select.id = "model-processing";
    for (const [value, text] of [
      ["original", "Как есть — сохранить исходный GLB"],
      ["medium", "Умеренное — около 50% вершин, текстуры до 2048 px"],
      ["strong", "Сильное — около 25% вершин, текстуры до 1024 px"],
    ]) {
      const o = element("option", text);
      o.value = value;
      select.append(o);
    }
    label.append(select);
    box.append(label);
    box.append(
      element(
        "p",
        "Упрощение меняет форму статических мешей. Скелет, морфы и сложные группы геометрии не упрощаются; текстуры могут уменьшиться. Анимации сохраняются. Фактический результат зависит от модели. Оригинал на диске не изменяется.",
      ),
    );
    const start = element("button", "Импортировать", "primary");
    start.id = "model-import-confirm";
    box.append(start);
    const dialog = document.querySelector("#modal");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener("close", cancel);
      resolve(value);
    };
    const cancel = () => finish(null);
    modal("Импорт 3D-модели", box);
    dialog.addEventListener("close", cancel);
    start.onclick = () => {
      finish(select.value);
      dialog.close();
    };
  });
}
export function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        "data:model/gltf-binary;base64," + String(reader.result).split(",")[1],
      );
    reader.onerror = () =>
      reject(reader.error ?? Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}
export async function processModel(data, mode) {
  const buffer = decodeGLB(data);
  if (mode === "original")
    return {
      data,
      report: `Без изменений · ${(buffer.byteLength / 1048576).toFixed(1)} МиБ`,
    };
  if (!["medium", "strong"].includes(mode))
    throw Error("Неизвестный режим обработки");
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    seen = new Set();
  let worker;
  let before = 0,
    after = 0,
    skipped = 0;
  try {
    const meshes = [];
    for (const scene of gltf.scenes)
      scene.traverse((o) => {
        if (seen.has(o)) return;
        seen.add(o);
        if (o.geometry) geometries.add(o.geometry);
        for (const m of (Array.isArray(o.material)
          ? o.material
          : [o.material]
        ).filter(Boolean)) {
          materials.add(m);
          for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
        }
        if (o.isMesh) meshes.push(o);
      });
    // A geometry shared with a skinned/morph/instanced mesh must remain intact.
    const protectedGeometry = new Set(
      meshes.filter((m) => !canSimplify(m)).map((m) => m.geometry),
    );
    const cache = new Map();
    worker = new Worker(new URL("./model-worker.js", import.meta.url), {
      type: "module",
    });
    for (const mesh of meshes) {
      const g = mesh.geometry,
        count = (g.index?.count ?? g.attributes.position?.count ?? 0) / 3;
      before += count;
      if (canSimplify(mesh) && !protectedGeometry.has(g) && count > 12) {
        if (!cache.has(g)) {
          const result = await new Promise((resolve, reject) => {
            worker.onmessage = ({ data }) =>
              data.error ? reject(Error(data.error)) : resolve(data.result);
            worker.onerror = (e) =>
              reject(Error(e.message || "Ошибка обработки модели"));
            worker.postMessage({
              geometry: g.toJSON(),
              ratio: mode === "medium" ? 0.5 : 0.25,
            });
          });
          const reduced = new BufferGeometryLoader().parse(result);
          geometries.add(reduced);
          cache.set(
            g,
            (reduced.index?.count ?? 0) <
              (g.index?.count ?? g.attributes.position.count)
              ? reduced
              : g,
          );
        }
        mesh.geometry = cache.get(g);
      } else skipped++;
      after +=
        (mesh.geometry.index?.count ??
          mesh.geometry.attributes.position?.count ??
          0) / 3;
    }
    const output = await new GLTFExporter().parseAsync(gltf.scenes, {
      binary: true,
      animations: gltf.animations,
      onlyVisible: false,
      maxTextureSize: mode === "medium" ? 2048 : 1024,
    });
    const processed = await fileData(
      new Blob([output], { type: "model/gltf-binary" }),
    );
    decodeGLB(processed);
    return {
      data: processed,
      report: `Треугольники: ${Math.round(before)} → ${Math.round(after)}. Размер: ${(buffer.byteLength / 1048576).toFixed(1)} → ${(output.byteLength / 1048576).toFixed(1)} МиБ. Мешей без упрощения: ${skipped}.`,
    };
  } finally {
    worker?.terminate();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => {
      t.dispose();
      t.source?.data?.close?.();
    });
  }
}
