import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const PYTHON_API = process.env.JWXT_API_ORIGIN ?? "http://127.0.0.1:8765";
const PORT = Number(process.env.JWXT_FRONTEND_PORT ?? 5173);

const server = await createServer({
  root: "frontend",
  configFile: false,
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": import.meta.dir + "/src",
    },
  },
  server: {
    port: PORT,
    proxy: {
      "/api": {
        target: PYTHON_API,
        changeOrigin: true,
      },
    },
  },
});

await server.listen();
console.log(`Frontend dev server: http://localhost:${PORT}`);
console.log(`Proxying /api/* to ${PYTHON_API}`);
