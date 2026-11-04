export function validateVideo(data) {
  if (!/^data:video\/(mp4|webm);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))
    throw Error("Ожидается встроенное видео MP4 или WebM");
  const prefix = atob(
    data.slice(data.indexOf(",") + 1, data.indexOf(",") + 1 + 64),
  );
  const valid = data.startsWith("data:video/mp4;")
    ? prefix.slice(4, 8) === "ftyp"
    : [26, 69, 223, 163].every((v, i) => prefix.charCodeAt(i) === v);
  if (!valid) throw Error("Содержимое файла не соответствует формату видео");
}
export function validateVideos(project) {
  const ids = new Set();
  for (const asset of project.videos ?? []) {
    if (ids.has(asset.id)) throw Error("Повтор ID видео");
    ids.add(asset.id);
    validateVideo(asset.data);
  }
  for (const e of project.entities)
    for (const n of e.dialogueTree?.nodes ?? [])
      if (n.videoId && !ids.has(n.videoId))
        throw Error(
          "Видео используется в диалоге. Сначала снимите назначение катсцены.",
        );
}
