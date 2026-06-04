import { render } from "solid-js/web";

function SolidRoot() {
  return null;
}

export function mountSolidRoot() {
  let root = document.getElementById("solid-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "solid-root";
    root.hidden = true;
    document.body.appendChild(root);
  }
  render(SolidRoot, root);
}
