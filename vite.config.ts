import { defineConfig } from "vite";
import { researchApiMiddleware } from "./server/researchApi.mjs";

export default defineConfig({
  plugins: [
    {
      name: "treasury-research-api",
      configureServer(server) {
        server.middlewares.use(researchApiMiddleware);
      }
    }
  ],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
