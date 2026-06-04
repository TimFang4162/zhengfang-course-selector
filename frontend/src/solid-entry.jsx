import { render } from "solid-js/web";
import App from "./App.jsx";
import { AppProvider } from "./app/app-context.jsx";

export function mountSolidRoot(app) {
  const root = document.getElementById("app");
  render(() => (
    <AppProvider value={app}>
      <App />
    </AppProvider>
  ), root);
}
