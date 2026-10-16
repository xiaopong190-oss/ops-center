import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import https from 'node:https';
const cloudOrigin = 'https://ops-center-cloud.xiaopong190-asin-radar.workers.dev';
const cloudProxy = () => ({
  '/ops-cloud/ops-api': {
    target: cloudOrigin,
    agent: new https.Agent({ proxyEnv: process.env }),
    changeOrigin: true,
    rewrite: path => path.replace(/^\/ops-cloud/, ''),
    headers: { Origin: cloudOrigin },
  },
});

export default defineConfig({
  plugins: [
    {
      name: "load-js-files-as-jsx",
      enforce: "pre",
      async transform(code, id) {
        if (!/src\/.*\.js$/.test(id)) return null;
        return transformWithEsbuild(code, id, { loader: "jsx", jsx: "automatic" });
      },
    },
    react(),
  ],
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.[jt]sx?$/,
  },
  optimizeDeps: {
    esbuildOptions: { loader: { ".js": "jsx" } },
  },
  server: { port: 5173, open: true, proxy: cloudProxy() },
  preview: { proxy: cloudProxy() },
});
