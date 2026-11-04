import { serializeProject } from "./project.js";

export function exportEditorHTML(template, project) {
  const slot =
    /(<script id="hearth-editor-project" type="application\/json">)[\s\S]*?(<\/script>)/;
  if (!slot.test(template)) throw Error("Шаблон редактора повреждён.");
  const json = serializeProject(project)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return template.replace(slot, (_, open, close) => open + json + close);
}
