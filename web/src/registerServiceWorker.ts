/** Installs the offline service worker in a production build. See pwa/offlineShell.ts.
 *
 * It waits for the page to finish loading so that saving the app's files does not
 * compete with showing it. If this fails the app simply needs a network, which is
 * how it worked before, so the failure is not worth telling anyone about. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
