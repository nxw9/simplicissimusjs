import test from "node:test";
import assert from "node:assert/strict";
import { decodeGLB } from "../src/core/assets.js";
function data(json) {
  const text = JSON.stringify(json),
    chunk = Buffer.from(text + " ".repeat((4 - (text.length % 4)) % 4));
  const bytes = Buffer.alloc(20 + chunk.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(chunk.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  chunk.copy(bytes, 20);
  return "data:model/gltf-binary;base64," + bytes.toString("base64");
}
test("portable GLB 2.0 decodes", () =>
  assert.ok(
    decodeGLB(data({ asset: { version: "2.0" }, scenes: [{}] })).byteLength >
      20,
  ));
test("truncated or non-GLB input is rejected", () => {
  assert.throws(
    () => decodeGLB("data:model/gltf-binary;base64,AAAA"),
    /Некорректный/,
  );
  assert.throws(() => decodeGLB("https://example.com/model.glb"));
});
test("external resources and required unsupported compression are rejected before loading", () => {
  assert.throws(
    () =>
      decodeGLB(
        data({
          asset: { version: "2.0" },
          images: [{ uri: "https://example.com/a.png" }],
        }),
      ),
    /внутри файла/,
  );
  assert.throws(
    () =>
      decodeGLB(
        data({
          asset: { version: "2.0" },
          extensionsRequired: ["KHR_draco_mesh_compression"],
        }),
      ),
    /без Draco/,
  );
});
