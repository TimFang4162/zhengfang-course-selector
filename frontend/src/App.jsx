import { useEffect } from "react";
import { useAppContext } from "./app/app-context.jsx";
import { LoginOverlay } from "./features/auth/LoginOverlay.jsx";
import { AppShell } from "./shell/AppShell.jsx";
import { ModalLayer } from "./shell/ModalLayer.jsx";

export default function App() {
  const app = useAppContext();
  useEffect(() => {
    app.start().catch(console.error);
  }, [app]);
  return (
    <>
      <LoginOverlay />
      <AppShell />
      <ModalLayer />
    </>
  );
}
