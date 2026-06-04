import { For, onCleanup, onMount } from "solid-js";
import { state } from "../app/state.js";

let openedAt = 0;

export function openFloatingMenu(anchor, items, width = 132) {
  const rect = anchor.getBoundingClientRect();
  const menuWidth = Math.max(190, width);
  openedAt = Date.now();
  state.floatingMenu = {
    left: Math.max(8, rect.right - menuWidth),
    top: rect.bottom + 4,
    width: menuWidth,
    items,
  };
}

export function closeFloatingMenu() {
  state.floatingMenu = null;
}

export function FloatingMenu() {
  onMount(() => {
    const close = () => {
      if (Date.now() - openedAt < 50) return;
      closeFloatingMenu();
    };
    document.addEventListener("click", close);
    onCleanup(() => document.removeEventListener("click", close));
  });

  return (
    <div
      classList={{ "floating-menu": true, hidden: !state.floatingMenu }}
      style={{ left: `${state.floatingMenu?.left || 0}px`, top: `${state.floatingMenu?.top || 0}px`, width: `${state.floatingMenu?.width || 132}px` }}
    >
      <For each={state.floatingMenu?.items || []}>
        {(item) => <button type="button" onClick={() => { closeFloatingMenu(); item.action(); }}>{item.label}</button>}
      </For>
    </div>
  );
}
