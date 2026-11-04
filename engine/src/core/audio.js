export const soundEvents = {
  attack: "Взмах / атака игрока",
  hit: "Попадание по врагу",
  hurt: "Игрок получил урон",
  jump: "Прыжок",
  land: "Приземление",
  step: "Шаги игрока",
  pickup: "Подбор предмета",
  mechanism: "Начало движения двери / механизма",
  enemyAttack: "Атака врага",
  enemyDeath: "Смерть врага",
  questAccept: "Квест принят",
  questComplete: "Квест сдан",
};
export function audioBytes(data) {
  if (!/^data:audio\/(mpeg|wav|ogg);base64,[A-Za-z0-9+/]*={0,2}$/.test(data))
    throw Error("Ожидается встроенный MP3, WAV или OGG");
  const binary = atob(data.slice(data.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const text = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  const mime = data.slice(5, data.indexOf(";"));
  const valid =
    mime === "audio/wav"
      ? text(0, 4) === "RIFF" && text(8, 12) === "WAVE"
      : mime === "audio/ogg"
        ? text(0, 4) === "OggS"
        : text(0, 3) === "ID3" ||
          (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (!valid) throw Error("Содержимое файла не соответствует формату аудио");
  return bytes.buffer;
}
export function validateAudio(project) {
  const ids = new Set();
  for (const asset of project.audio?.assets ?? []) {
    if (ids.has(asset.id)) throw Error("Повтор ID аудио");
    ids.add(asset.id);
    audioBytes(asset.data);
  }
  const check = (id) => {
    if (id && !ids.has(id))
      throw Error(
        "Звук используется, но отсутствует в аудиоассетах. Сначала измените назначение.",
      );
  };
  Object.values(project.audio?.sounds ?? {}).forEach(check);
  for (const e of project.entities)
    for (const node of e.dialogueTree?.nodes ?? []) check(node.audioId);
}
