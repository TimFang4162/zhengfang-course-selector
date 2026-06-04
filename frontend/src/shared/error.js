export function showError(error) {
  console.error(error);
  alert(error.message || String(error));
}
