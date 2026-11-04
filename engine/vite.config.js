import {
  gameTemplatePlugin,
  editorTemplatePlugin,
} from "./scripts/single-html.mjs";
import { defineConfig } from "vite";
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [
    gameTemplatePlugin(),
    ...(mode === "game" ? [] : [editorTemplatePlugin()]),
  ],
  build: {
    emptyOutDir: true,
    outDir: mode === "game" ? "dist-game" : "dist",
    rollupOptions: {
      input:
        mode === "game"
          ? "play.html"
          : { editor: "index.html", play: "play.html" },
    },
  },
}));
