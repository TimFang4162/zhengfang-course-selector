import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/min/vs/editor/editor.main.css";
import "monaco-editor/esm/vs/basic-languages/html/html.contribution.js";
import "monaco-editor/esm/vs/language/json/monaco.contribution.js";
import { mountSolidRoot } from "./solid-entry.jsx";
import "./styles/index.css";
import { createApp } from "./app/create-app.js";

void monaco;

async function main() {
  const app = createApp();
  await app.auth.loadBootstrap();
  mountSolidRoot(app);
  await app.start();
}

main().catch((error) => {
  console.error(error);
  alert(error.message || String(error));
});
