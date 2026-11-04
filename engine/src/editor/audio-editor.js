import { soundEvents, audioBytes } from "../core/audio.js";
import { readProject } from "../core/project.js";
export function audioEditor({ project, element, modal, commit }) {
  const draft = structuredClone(project);
  draft.audio ??= { assets: [], sounds: {} };
  const box = element("div");
  let preview;
  const stop = () => {
    preview?.pause();
    preview = null;
  };
  const render = () => {
    stop();
    box.replaceChildren();
    box.append(
      element(
        "p",
        "1. Добавьте свои MP3, WAV или OGG. 2. Назначьте звуки действиям. Озвучка реплик выбирается отдельно: NPC → Диалоги и ответы → Аудио реплики. Файлы включаются в проект и HTML-игру.",
      ),
    );
    const upload = element("input");
    upload.type = "file";
    upload.accept = ".mp3,.wav,.ogg";
    upload.multiple = true;
    upload.id = "audio-files";
    box.append(upload);
    const error = element("p");
    error.setAttribute("role", "alert");
    box.append(error);
    upload.onchange = async () => {
      save.disabled = true;
      upload.disabled = true;
      try {
        const added = [];
        for (const file of upload.files) {
          const mime = { mp3: "mpeg", wav: "wav", ogg: "ogg" }[
            file.name.split(".").at(-1).toLowerCase()
          ];
          if (!mime) throw Error("Поддерживаются MP3, WAV и OGG");
          const raw = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(Error("Ошибка чтения аудио"));
            reader.readAsDataURL(file);
          });
          const data = `data:audio/${mime};base64,` + raw.split(",")[1];
          audioBytes(data);
          added.push({ id: crypto.randomUUID(), name: file.name, data });
        }
        draft.audio.assets.push(...added);
        render();
      } catch (e) {
        error.textContent = e.message;
        save.disabled = false;
        upload.disabled = false;
      }
    };
    const silence = element("button", "■ Остановить прослушивание");
    silence.onclick = stop;
    box.append(silence);
    for (const asset of draft.audio.assets) {
      const row = element("div");
      row.append(element("span", asset.name + " "));
      const play = element("button", "▶ Прослушать");
      play.onclick = () => {
        stop();
        preview = new Audio(asset.data);
        preview
          .play()
          .catch(
            () =>
              (error.textContent = "Браузер не смог воспроизвести этот файл."),
          );
      };
      const remove = element("button", "Удалить");
      remove.onclick = () => {
        const copy = structuredClone(draft);
        copy.audio.assets = copy.audio.assets.filter((a) => a.id !== asset.id);
        try {
          readProject(copy);
          draft.audio.assets = copy.audio.assets;
          render();
        } catch (e) {
          error.textContent = e.message;
        }
      };
      row.append(play, remove);
      box.append(row);
    }
    for (const [key, title] of Object.entries(soundEvents)) {
      const label = element("label", title, "field"),
        select = element("select");
      select.dataset.sound = key;
      for (const a of [{ id: "", name: "Без звука" }, ...draft.audio.assets]) {
        const option = element("option", a.name);
        option.value = a.id;
        select.append(option);
      }
      select.value = draft.audio.sounds[key] ?? "";
      select.onchange = () => (draft.audio.sounds[key] = select.value || null);
      label.append(select);
      box.append(label);
    }
    box.append(
      element(
        "p",
        "Поддержка кодеков зависит от браузера. Для переносимости используйте MP3 или PCM WAV. На паузе звуки останавливаются; общая громкость — в настройках игры.",
      ),
    );
    const save = element("button", "✓ Сохранить звуки", "primary");
    save.id = "audio-save";
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
  modal("Звуки и озвучка", box);
  document
    .querySelector("#modal")
    .addEventListener("close", stop, { once: true });
}
