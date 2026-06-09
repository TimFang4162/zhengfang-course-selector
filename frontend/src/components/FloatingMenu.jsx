import { useEffect } from "react";
import { useSnapshot } from "valtio";
import { state } from "../app/state.js";
import { cx } from "../shared/utils.js";

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
  const snap = useSnapshot(state);

  useEffect(() => {
    const close = () => {
      if (Date.now() - openedAt < 50) return;
      closeFloatingMenu();
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const menu = snap.floatingMenu;

  return (
    <div
      className={cx("floating-menu", { hidden: !menu })}
      style={{ left: `${menu?.left || 0}px`, top: `${menu?.top || 0}px`, width: `${menu?.width || 132}px` }}
    >
      {(menu?.items || []).map((item, i) => <button key={i} type="button" onClick={() => { closeFloatingMenu(); item.action(); }}>{item.label}</button>)}
    </div>
  );
}
