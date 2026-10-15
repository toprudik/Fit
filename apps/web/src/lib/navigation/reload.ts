/** A full page load of the current URL. A module of its own so tests can count it: jsdom can't navigate. */
export function reloadPage() {
  window.location.reload();
}
