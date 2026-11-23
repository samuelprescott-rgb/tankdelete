import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// GLTF/texture/audio loaders resolve these public assets against the document,
// not the importing chunk. A portable build must work both at / and on Pages.
function portableGameAssets(): Plugin {
  let portable = false;
  return {
    name: "portable-game-assets",
    apply: "build",
    enforce: "pre",
    configResolved(config) { portable = config.base === "./"; },
    transform(code, id) {
      if (!portable || !/\/src\/.*\.[jt]sx?$/.test(id)) return;
      const result = code.replace(/(["'`])\/(?=(?:audio|images|models|fonts)\/)/g, "$1./");
      return result === code ? null : result;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [portableGameAssets(), react()],
  build: {
    // The manifest also lets check:bundle guard the lightweight menu boundary.
    manifest: true,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
