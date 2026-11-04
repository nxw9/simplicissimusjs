import { validateVideo } from "../core/video.js";
import { readProject } from "../core/project.js";
export function videoEditor({ project, element, modal, commit }) {
  const draft = structuredClone(project);
  draft.videos ??= [];
  const box = element("div"),
    preview = element("video");
  preview.controls = true;
  preview.playsInline = true;
  preview.preload = "metadata";
  preview.style.width = "100%";
  preview.style.maxHeight = "260px";
  const stop = () => {
    preview.pause();
    preview.removeAttribute("src");
    preview.load();
  };
  const render = () => {
    box.replaceChildren();
    box.append(
      element(
        "p",
        "Добавьте видео MP4 или WebM. Затем выберите NPC → Диалоги и ответы → нужная реплика → «Видео перед репликой». Условия реплики определяют, когда запустится катсцена.",
      ),
    );
    const upload = element("input");
    upload.type = "file";
    upload.accept = ".mp4,.webm";
    upload.multiple = true;
    upload.id = "video-files";
    box.append(upload);
    const error = element("p");
    error.setAttribute("role", "alert");
    box.append(error);
    preview.onerror = () =>
      (error.textContent =
        "Не удалось воспроизвести видео. Попробуйте MP4 с видео H.264 и звуком AAC.");
    upload.onchange = async () => {
      upload.disabled = true;
      save.disabled = true;
      try {
        const added = [];
        for (const file of upload.files) {
          const type = file.name.split(".").at(-1).toLowerCase();
          if (!["mp4", "webm"].includes(type))
            throw Error("Выберите MP4 или WebM");
          const raw = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(Error("Не удалось прочитать видео"));
            r.readAsDataURL(file);
          });
          const data = `data:video/${type};base64,` + raw.split(",")[1];
          validateVideo(data);
          added.push({ id: crypto.randomUUID(), name: file.name, data });
        }
        draft.videos.push(...added);
        render();
      } catch (e) {
        error.textContent = e.message;
        upload.disabled = false;
        save.disabled = false;
      }
    };
    for (const asset of draft.videos) {
      const row = element("div");
      row.append(
        element(
          "span",
          `${asset.name} · ≈${((asset.data.length * 0.75) / 1048576).toFixed(1)} МиБ `,
        ),
      );
      const play = element("button", "▶ Проверить видео");
      play.onclick = () => {
        stop();
        preview.src = asset.data;
        preview
          .play()
          .catch(
            () => (error.textContent = "Нажмите воспроизведение в плеере."),
          );
      };
      const remove = element("button", "Удалить");
      remove.onclick = () => {
        const next = structuredClone(draft);
        next.videos = next.videos.filter((a) => a.id !== asset.id);
        try {
          readProject(next);
          stop();
          draft.videos = next.videos;
          render();
        } catch (e) {
          error.textContent = e.message;
        }
      };
      row.append(play, remove);
      box.append(row);
    }
    box.append(
      preview,
      element(
        "p",
        "Видео включается в проект и HTML-игру. На время просмотра мир и остальные звуки останавливаются. Ролик можно пропустить; при следующем посещении реплики он повторится. Для совместимости используйте MP4 (H.264 + AAC). Большое видео увеличивает размер игры и расход памяти.",
      ),
    );
    const save = element("button", "✓ Сохранить видео", "primary");
    save.id = "video-save";
    save.onclick = async () => {
      try {
        if (await commit(readProject(draft)))
          document.querySelector("#modal").close();
      } catch (e) {
        error.textContent = e.message;
      }
    };
    box.append(save);
  };
  render();
  modal("Видео и катсцены", box);
  document
    .querySelector("#modal")
    .addEventListener("close", stop, { once: true });
}
