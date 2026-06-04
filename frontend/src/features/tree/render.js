export function createTreeRenderer({ state }) {
  return function renderTree() {
    state.treeVersion += 1;
  };
}
