export function closeMenus() {
  document.querySelectorAll(".menu-popover").forEach((menu) => {
    menu.classList.add("hidden");
  });
}

export function toggleMenu(menuId) {
  const menu = document.getElementById(menuId);
  const wasHidden = menu.classList.contains("hidden");
  closeMenus();
  if (wasHidden) menu.classList.remove("hidden");
}
