/** Portable GLB contract shared by CLI and renderer; never fetch external URLs. */
export function decodeGLB(data) {
  if (
    typeof data !== "string" ||
    !data.startsWith("data:model/gltf-binary;base64,")
  )
    throw Error("Ожидается GLB data URI");
  const base64 = data.slice(data.indexOf(",") + 1);
  let bytes;
  if (Uint8Array.fromBase64) bytes = Uint8Array.fromBase64(base64);
  else {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  }
  const v = new DataView(bytes.buffer);
  if (
    bytes.length < 20 ||
    v.getUint32(0, true) !== 0x46546c67 ||
    v.getUint32(4, true) !== 2 ||
    v.getUint32(8, true) !== bytes.length
  )
    throw Error("Некорректный GLB 2.0");
  const length = v.getUint32(12, true);
  if (v.getUint32(16, true) !== 0x4e4f534a || 20 + length > bytes.length)
    throw Error("Некорректный JSON chunk в GLB");
  const json = JSON.parse(
    new TextDecoder().decode(bytes.slice(20, 20 + length)),
  );
  if (json.asset?.version !== "2.0") throw Error("Поддерживается glTF 2.0");
  if (
    [...(json.buffers ?? []), ...(json.images ?? [])].some(
      (x) => x.uri && !x.uri.startsWith("data:"),
    )
  )
    throw Error("GLB должен содержать все текстуры и буферы внутри файла.");
  if (
    (json.extensionsRequired ?? []).some((x) =>
      [
        "KHR_draco_mesh_compression",
        "EXT_meshopt_compression",
        "KHR_texture_basisu",
      ].includes(x),
    )
  )
    throw Error("Экспортируйте GLB без Draco, Meshopt и KTX2 для версии 0.1.");
  return bytes.buffer;
}
