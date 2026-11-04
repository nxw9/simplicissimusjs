import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { JSDOM } from "jsdom";
import { simplifyGeometry } from "../src/editor/model-processing.js";
import { canSimplify } from "../src/editor/model-geometry.js";
import { processModel, importOptions } from "../src/editor/model-import.js";
import { decodeGLB } from "../src/core/assets.js";
import { animatedGLB } from "./animated-glb.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MAX_PROJECT_BYTES } from "../src/core/project.js";

test("simplification reduces static geometry and retains UV, normals, valid bounds and indices", async () => {
  const geometry = new T.BufferGeometry().copy(new T.SphereGeometry(2, 48, 32));
  const original = geometry.toJSON();
  for (const ratio of [0.5, 0.25]) {
    const json = await simplifyGeometry(original, ratio),
      g = new T.BufferGeometryLoader().parse(json);
    assert.ok(g.index.count < geometry.index.count);
    assert.ok(g.attributes.position.count < geometry.attributes.position.count);
    assert.equal(g.attributes.uv.count, g.attributes.position.count);
    assert.equal(g.attributes.normal.count, g.attributes.position.count);
    assert.ok([...g.index.array].every((i) => i < g.attributes.position.count));
    g.computeBoundingBox();
    assert.ok(g.boundingBox.max.x > 1.8);
    assert.ok(g.boundingBox.min.y < -1.8);
  }
  assert.deepEqual(geometry.toJSON(), original);
});
test("skinned, morph, multi-material and instanced meshes are protected", () => {
  const g = new T.BoxGeometry();
  g.clearGroups();
  assert.equal(canSimplify(new T.Mesh(g)), true);
  assert.equal(canSimplify(new T.SkinnedMesh(g)), false);
  assert.equal(
    canSimplify(new T.InstancedMesh(g, new T.MeshBasicMaterial(), 2)),
    false,
  );
  g.morphAttributes.position = [g.attributes.position.clone()];
  assert.equal(canSimplify(new T.Mesh(g)), false);
  delete g.morphAttributes.position;
  g.addGroup(0, 3, 0);
  g.addGroup(3, 3, 1);
  assert.equal(canSimplify(new T.Mesh(g)), false);
});
test("original import accepts models over 15 MiB byte-for-byte and no project byte cap remains", async () => {
  const source = animatedGLB(),
    bytes = Buffer.alloc(16 * 1024 * 1024);
  Buffer.from(source).copy(bytes);
  bytes.writeUInt32LE(bytes.length, 8);
  const data = "data:model/gltf-binary;base64," + bytes.toString("base64");
  const result = await processModel(data, "original");
  assert.equal(result.data, data);
  assert.equal(decodeGLB(result.data).byteLength, bytes.length);
  assert.equal(MAX_PROJECT_BYTES, Infinity);
});
test("import dialog defaults to original, allows presets and cancellation without mutation", async () => {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  const dialog = document.querySelector("dialog");
  dialog.close = () => dialog.dispatchEvent(new dom.window.Event("close"));
  const element = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  const options = {
    files: [{ size: 99999999 }],
    element,
    modal: (_, box) => dialog.replaceChildren(box),
  };
  try {
    let pending = importOptions(options);
    assert.equal(document.querySelector("#model-processing").value, "original");
    document.querySelector("#model-processing").value = "strong";
    document.querySelector("#model-import-confirm").click();
    assert.equal(await pending, "strong");
    pending = importOptions(options);
    dialog.close();
    assert.equal(await pending, null);
  } finally {
    dom.window.close();
  }
});
test("GLB processing pipeline exports reduced geometry and preserves animation clips", async () => {
  const previous = {
    FileReader: globalThis.FileReader,
    Worker: globalThis.Worker,
  };
  // Browser-independent adapters exercise the actual loader/exporter and simplifier.
  globalThis.FileReader = class {
    async readAsArrayBuffer(blob) {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
      this.onload?.();
    }
    async readAsDataURL(blob) {
      this.result =
        "data:application/octet-stream;base64," +
        Buffer.from(await blob.arrayBuffer()).toString("base64");
      this.onloadend?.();
      this.onload?.();
    }
  };
  globalThis.Worker = class {
    postMessage(data) {
      simplifyGeometry(data.geometry, data.ratio).then(
        (result) => this.onmessage({ data: { result } }),
        (e) => this.onerror(e),
      );
    }
    terminate() {}
  };
  try {
    const scene = new T.Scene(),
      mesh = new T.Mesh(
        new T.SphereGeometry(1, 32, 24),
        new T.MeshStandardMaterial(),
      );
    mesh.name = "orb";
    scene.add(mesh);
    const clip = new T.AnimationClip("Walk", 1, [
      new T.VectorKeyframeTrack("orb.position", [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    const input = await new GLTFExporter().parseAsync(scene, {
      binary: true,
      animations: [clip],
    });
    const data =
      "data:model/gltf-binary;base64," + Buffer.from(input).toString("base64");
    const result = await processModel(data, "medium");
    const gltf = await new GLTFLoader().parseAsync(decodeGLB(result.data), "");
    assert.equal(gltf.animations[0].name, "Walk");
    assert.equal(gltf.animations[0].tracks[0].values.at(-3), 1);
    const reduced = gltf.scene.getObjectByName("orb");
    assert.ok(reduced.geometry.index.count < mesh.geometry.index.count);
    assert.ok(decodeGLB(result.data).byteLength < input.byteLength);
  } finally {
    Object.assign(globalThis, previous);
  }
});
