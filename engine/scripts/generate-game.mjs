import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateAdventure } from "../src/generation/adventure.js";
import { serializeProject } from "../src/core/project.js";
const args = process.argv.slice(2),
  options = {};
let output = "generated.hearth.json";
try {
  if (args.includes("--help")) {
    console.log(
      "npm run generate -- --seed my-world --mode adventure|maze|highlands --story ember|mist|roots|random --biome story|forest|marsh|autumn --size small|medium|large --difficulty story|normal|hard --side-quests 0..3 --output generated.hearth.json",
    );
  } else {
    const keys = {
      "--seed": "seed",
      "--mode": "mode",
      "--story": "story",
      "--biome": "biome",
      "--size": "size",
      "--difficulty": "difficulty",
      "--side-quests": "sideQuests",
    };
    for (let i = 0; i < args.length; i += 2) {
      if (
        args[i + 1] === undefined ||
        (!keys[args[i]] && args[i] !== "--output")
      )
        throw Error(`Неизвестный или неполный аргумент: ${args[i]}`);
      if (args[i] === "--output") output = args[i + 1];
      else
        options[keys[args[i]]] =
          args[i] === "--side-quests" ? Number(args[i + 1]) : args[i + 1];
    }
    const project = generateAdventure(options);
    // Exclusive create avoids silently overwriting a hand-edited project.
    await writeFile(resolve(output), serializeProject(project), { flag: "wx" });
    console.log(
      `${project.title}\n${resolve(output)}\nОткройте проект в редакторе или выполните: npm run game -- --project ${JSON.stringify(output)}`,
    );
  }
} catch (error) {
  console.error(
    error.code === "EEXIST"
      ? "Файл уже существует. Укажите другой --output."
      : error.message,
  );
  process.exitCode = 1;
}
