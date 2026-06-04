import { serve } from "bun";
import index from "./index.html";

const PYTHON_API = process.env.JWXT_API_ORIGIN ?? "http://127.0.0.1:8765";
const PORT = Number(process.env.JWXT_FRONTEND_PORT ?? 5173);

const server = serve({
  port: PORT,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, PYTHON_API);
      return fetch(target, req);
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Frontend dev server: ${server.url}`);
console.log(`Proxying /api/* to ${PYTHON_API}`);
