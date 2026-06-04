import { createContext, useContext } from "solid-js";

const AppContext = createContext(null);

export function AppProvider(props) {
  return <AppContext.Provider value={props.value}>{props.children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppContext is not available");
  return context;
}
