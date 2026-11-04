import { buildGameTemplate } from "./single-html.mjs";
import { exportGameHTML } from "../src/core/export-html.js";
import { readFile, writeFile, rename, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { readProject, serializeProject } from "../src/core/project.js";
import { decodeGLB } from "../src/core/assets.js";
import { demoProject } from "../src/core/demo.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--project")) {
  console.error("Usage: npm run game -- --project ./game.hearth.json");
  process.exit(1);
}
let staging;
try {
  const project = args.length
    ? readProject(await readFile(resolve(args[1]), "utf8"))
    : demoProject();
  for (const asset of project.assets) decodeGLB(asset.data);
  // A failed validation or bundling step must preserve the previous game build.
  staging = await mkdtemp(resolve(root, ".hearth-build-"));
  await build({
    root,
    mode: "game",
    build: { outDir: staging, emptyOutDir: true },
  });
  await writeFile(resolve(staging, "world.json"), serializeProject(project));
  await writeFile(
    resolve(staging, "game.html"),
    exportGameHTML(await buildGameTemplate(), project),
  );
  await rename(resolve(staging, "play.html"), resolve(staging, "index.html"));
  await writeFile(
    resolve(staging, "build-info.json"),
    JSON.stringify(
      {
        engine: JSON.parse(await readFile(resolve(root,"package.json"),"utf8")).version,
        schemaVersion: project.schemaVersion,
        projectId: project.id,
        contentVersion: project.contentVersion,
      },
      null,
      2,
    ),
  );
  const destination = resolve(root, "dist-game");
  const backup = `${staging}-previous`;
  let previous = false;
  try {
    await rename(destination, backup);
    previous = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(staging, destination);
  } catch (error) {
    if (previous) await rename(backup, destination);
    throw error;
  }
  if (previous) await rm(backup, { recursive: true, force: true });
  console.log(`Game built: dist-game/ — ${project.title}`);
} catch (error) {
  console.error("Build failed:", error.message);
  process.exitCode = 1;
} finally {
  if (staging) await rm(staging, { recursive: true, force: true });
}
