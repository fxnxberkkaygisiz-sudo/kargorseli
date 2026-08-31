import { nodeToDataUrl, type RenderOptions } from "./export";

export const ROOT_ID = "kg-root";

/**
 * Sablon HTML'ini izole bir iframe belgesine sarar. Sablonlarin kendi
 * <style> bloklari oldugu icin uygulamanin stilleri gorseli etkilemez.
 */
export function buildDocument(renderedHtml: string, width: number): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  #${ROOT_ID} { width: ${width}px; display: block; }
  #${ROOT_ID} img { display: block; }
</style>
</head>
<body><div id="${ROOT_ID}">${renderedHtml}</div></body></html>`;
}

export function frameRoot(iframe: HTMLIFrameElement | null): HTMLElement | null {
  return iframe?.contentDocument?.getElementById(ROOT_ID) ?? null;
}

/** height: "auto" sablonlar icin gercek icerik yuksekligi. */
export function measureFrame(iframe: HTMLIFrameElement | null): number {
  const root = frameRoot(iframe);
  if (!root) return 0;
  return Math.ceil(root.getBoundingClientRect().height);
}

/**
 * iframe icerigini PNG/JPEG data URL'ine cevirir.
 * Bazi tarayicilarda html-to-image baska bir belgedeki dugumlerde
 * takilabildigi icin, hata durumunda icerik ana belgede gizli bir
 * sahneye kopyalanip tekrar denenir.
 */
export async function captureFrame(
  iframe: HTMLIFrameElement,
  opts: RenderOptions
): Promise<string> {
  const root = frameRoot(iframe);
  if (!root) throw new Error("Şablon henüz yüklenmedi");

  try {
    return await nodeToDataUrl(root, opts);
  } catch {
    return captureViaFallback(root, opts);
  }
}

async function captureViaFallback(root: HTMLElement, opts: RenderOptions): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-100000px;top:0;pointer-events:none;opacity:1;z-index:-1;";
  const clone = root.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.style.width = `${opts.width}px`;
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    return await nodeToDataUrl(clone, opts);
  } finally {
    host.remove();
  }
}

/** Tarayicinin bir sonraki boyama karesini bekler (render'in oturmasi icin). */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
