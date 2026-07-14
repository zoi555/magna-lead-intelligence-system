// MapLibre asset loading + lifecycle. MapLibre GL JS is provided by the host so the
// package stays framework-light. A configurable default path is used if the host has
// not already put `window.maplibregl` in place. No hardcoded external CDN.

let MAPLIBRE_JS = "/vendor/maplibre-gl.js";
let MAPLIBRE_CSS = "/vendor/maplibre-gl.css";

/** Override where the vendored MapLibre assets are loaded from (per host app). */
export function setMaplibreAssets(opts: { js?: string; css?: string }): void {
  if (opts.js) MAPLIBRE_JS = opts.js;
  if (opts.css) MAPLIBRE_CSS = opts.css;
}

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (typeof document === "undefined") return rej(new Error("no document"));
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error(src)); document.head.appendChild(s);
  });
}
function loadCss(href: string): void {
  if (typeof document === "undefined") return;
  if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l); }
}

/** Ensure window.maplibregl exists; loads the vendored asset if the host hasn't.
 *  Polls for the global rather than trusting the <script> onload — a concurrent
 *  (e.g. StrictMode double-mount) loader may leave a script tag present but not yet
 *  executed, so an early resolve would see an undefined global. */
export async function ensureMaplibre(): Promise<any> {
  const w = window as unknown as { maplibregl?: unknown };
  if (w.maplibregl) return w.maplibregl;
  loadCss(MAPLIBRE_CSS);
  loadScript(MAPLIBRE_JS).catch(() => { /* poll below decides success/failure */ });
  for (let i = 0; i < 120; i++) { // up to ~6s
    if (w.maplibregl) return w.maplibregl;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("MapLibre GL JS did not initialise (window.maplibregl missing). Provide it via setMaplibreAssets() or a <script>.");
}
