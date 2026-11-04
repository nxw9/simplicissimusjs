import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { demoProject } from "../src/core/demo.js";
import { exportEditorHTML } from "../src/core/export-editor.js";
import { buildEditorTemplate } from "../scripts/single-html.mjs";
import { spawnSync } from "node:child_process";

test("standalone editor embeds project safely and can save a second copy", async () => {
  const template = await buildEditorTemplate();
  const project = demoProject();
  project.title = '</script><script>alert("test")</script> $&';
  const html = exportEditorHTML(template, project);
  const dom = new JSDOM(html, { url: "file:///hearth-editor.html" });
  assert.equal(dom.window.document.querySelectorAll("script[src],link[href]").length, 0);
  assert.equal(dom.window.document.querySelectorAll("script").length, 2);
  assert.equal(JSON.parse(dom.window.document.getElementById("hearth-editor-project").textContent).title, project.title);
  const code = dom.window.document.querySelector('script[type="module"]').textContent;
  const syntax = spawnSync(process.execPath, ["--input-type=module", "--check"], { input: code, encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.ok(code.includes("data:image/webp;base64,"));
  assert.ok(code.includes("createObjectURL"));
  project.title = "Вторая копия";
  const copy = new JSDOM(exportEditorHTML('<!doctype html>' + dom.window.document.documentElement.outerHTML, project));
  assert.equal(JSON.parse(copy.window.document.getElementById("hearth-editor-project").textContent).title, "Вторая копия");
  assert.equal(copy.window.document.querySelector('script[type="module"]').textContent, code);
  copy.window.close(); dom.window.close();
});
