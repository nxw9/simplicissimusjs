import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { build } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export async function buildLicenseNotices({ editor = false } = {}) {
  const components = [
    ["Hearth Engine and editor", "LICENSE"],
    ["Three.js", "public/licenses/three.txt"],
    ["gl-matrix (matrix inversion in Three.js)", "public/licenses/gl-matrix.txt"],
    ["Zod", "public/licenses/zod.txt"],
    ["Minimal AgX (shader in Three.js)", "public/licenses/minimal-agx.txt"],
    ...(editor ? [["meshoptimizer", "public/licenses/meshoptimizer.txt"]] : []),
    ["Victor Mono 1.4.0", "public/licenses/victor-mono.txt"],
  ];
  const texts = await Promise.all(
    components.map(([, path]) => readFile(root + path, "utf8")),
  );
  const permission = (text) => text.slice(text.indexOf("Permission is hereby")).trim();
  const terms = permission(texts[0]);
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  for (let i = 0; i < texts.length; i++) {
    if (!texts[i].startsWith("MIT License") && !texts[i].startsWith("The MIT License"))
      throw Error(`Expected an MIT license for ${components[i][0]}`);
    if (normalize(permission(texts[i])) !== normalize(terms))
      throw Error(`License terms differ for ${components[i][0]}; preserve its full notice separately.`);
  }
  const credits = texts.map((text, i) => {
    const copyrights = text.match(/^Copyright[^\n]+/gm);
    if (!copyrights?.length) throw Error(`Missing copyright for ${components[i][0]}`);
    return `${components[i][0]}: ${copyrights.join("\n")}`;
  });
  const additionalNotices = await Promise.all(
    ["rtcd.txt", "shader-sources.txt", "ltc.txt", "apache-2.0.txt"].map(
      (file) => readFile(root + "public/licenses/" + file, "utf8"),
    ),
  );
  return ("MIT License\n\n" + credits.join("\n") + "\n\n" + terms + "\n\n" + additionalNotices.join("\n\n"))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
export async function buildGameTemplate() {
  const result = await build({
    configFile: false,
    root,
    logLevel: "silent",
    base: "./",
    plugins: [inlineMaterialsPlugin()],
    build: {
      write: false,
      minify: true,
      assetsInlineLimit: Infinity,
      lib: {
        entry: root + "src/play.js",
        name: "HearthGame",
        formats: ["iife"],
      },
    },
  });
  const output = (Array.isArray(result) ? result[0] : result).output;
  const js = output
    .filter((o) => o.type === "chunk")
    .map((o) => o.code)
    .join("\n")
    .replace(/<\/script/gi, "<\\/script");
  const css = output
    .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
    .map((o) => o.source)
    .join("\n")
    .replace(/<\/style/gi, "<\\/style");
  const notices = await buildLicenseNotices();
  return (
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#18201b"><title>Hearth</title><style>' +
    css +
    '</style></head><body><div id="app"></div><script id="hearth-project" type="application/json">__HEARTH_PROJECT_JSON__</script><script>' +
    js +
    '</script><template id="hearth-licenses"><pre>' +
    notices +
    "</pre></template></body></html>"
  );
}
export function gameTemplatePlugin() {
  let template;
  return {
    name: "hearth-game-template",
    resolveId(id) {
      if (id === "virtual:hearth-game-template")
        return "\0hearth-game-template";
    },
    async load(id) {
      if (id === "\0hearth-game-template") {
        template ??= buildGameTemplate();
        return "export default " + JSON.stringify(await template);
      }
    },
  };
}

function inlineMaterialsPlugin() {
  return {
    name: "hearth-inline-material-urls",
    enforce: "pre",
    async transform(source, id) {
      if (
        id.replaceAll("\\", "/") !==
        resolve(root, "src/render/materials.js").replaceAll("\\", "/")
      )
        return;
      // Inline classic scripts have no import.meta.url. Data URIs are already
      // absolute, so emit strings directly instead of new URL(data, undefined).
      const pattern =
        /new URL\(\s*["'](\.\.\/assets\/materials\/[\w-]+\.webp)["']\s*,\s*import\.meta\.url\s*\)\.href/g;
      const matches = [...source.matchAll(pattern)];
      if (matches.length !== 4)
        throw Error("Не удалось встроить четыре материала в автономную игру.");
      const replacements = new Map(
        await Promise.all(
          matches.map(async (match) => [
            match[0],
            JSON.stringify(
              "data:image/webp;base64," +
                (
                  await readFile(resolve(root, "src/render", match[1]))
                ).toString("base64"),
            ),
          ]),
        ),
      );
      return {
        code: source.replace(pattern, (match) => replacements.get(match)),
        map: null,
      };
    },
  };
}

export async function buildEditorTemplate() {
  const result = await build({
    configFile: false,
    root,
    logLevel: "silent",
    base: "./",
    plugins: [
      gameTemplatePlugin(),
      inlineMaterialsPlugin(),
      {
        name: "hearth-inline-worker",
        enforce: "pre",
        transform(source, id) {
          if (!id.replaceAll("\\", "/").endsWith("/src/editor/model-import.js"))
            return;
          return (
            'import InlineWorker from "./model-worker.js?worker&inline";\n' +
            source.replace(
              /new Worker\(new URL\("\.\/model-worker\.js", import\.meta\.url\),\s*\{\s*type: "module",?\s*\}\)/,
              "new InlineWorker()",
            )
          );
        },
      },
    ],
    build: {
      write: false,
      minify: true,
      assetsInlineLimit: Infinity,
      lib: { entry: root + "src/editor/main.js", formats: ["es"] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const output = (Array.isArray(result) ? result[0] : result).output;
  const js = output
    .filter((o) => o.type === "chunk")
    .map((o) => o.code)
    .join("\n")
    .replace(/<\/script/gi, "<\\/script");
  const css = output
    .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
    .map((o) => o.source)
    .join("\n")
    .replace(/<\/style/gi, "<\\/style");
  const notices = await buildLicenseNotices({ editor: true });
  return (
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hearth Editor</title><style>' +
    css +
    '</style></head><body><div id="app"></div><script id="hearth-editor-project" type="application/json"></script><template id="hearth-licenses"><pre>' +
    notices +
    '</pre></template><script type="module">' +
    js +
    "</script></body></html>"
  );
}

export function editorTemplatePlugin() {
  return {
    name: "hearth-editor-template",
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "editor.html",
        source: await buildEditorTemplate(),
      });
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== "/editor.html") return next();
        try {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(await buildEditorTemplate());
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
