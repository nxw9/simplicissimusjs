import "./style.css";
import { readProject } from "./core/project.js";
import { WorldView } from "./render/world.js";
import { Session } from "./render/session.js";
import { errorText } from "./core/storage.js";
async function main() {
  document.body.classList.add("standalone");
  document.querySelector("#app").innerHTML =
    '<div id="viewport"></div><div id="toast" role="status" hidden></div>';
  let timer;
  const notify = (text) => {
    const el = document.querySelector("#toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.hidden = true;
    }, 6000);
  };
  try {
    const embedded = document.querySelector("#hearth-project");
    let raw;
    if (embedded) raw = embedded.textContent;
    else {
      const response = await fetch("./world.json");
      if (!response.ok)
        throw Error("Не найден world.json. Выполните npm run game.");
      raw = await response.text();
    }
    const project = readProject(raw);
    document.title = project.title;
    const host = document.querySelector("#viewport"),
      view = new WorldView(host);
    await view.load(project);
    new Session(view, project, host, notify, { startPaused: true });
  } catch (err) {
    const e = document.createElement("div");
    e.className = "fatal";
    e.textContent = errorText(err);
    document.querySelector("#viewport").append(e);
  }
}
main();
