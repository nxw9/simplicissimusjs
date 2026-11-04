import { serializeProject } from "./project.js";
export const PROJECT_MARKER = "__HEARTH_PROJECT_JSON__";
export function exportGameHTML(template, project) {
  if (!template.includes(PROJECT_MARKER))
    throw Error("Шаблон игры повреждён. Пересоберите редактор.");
  const json = serializeProject(project)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return template.replace(PROJECT_MARKER, () => json);
}
