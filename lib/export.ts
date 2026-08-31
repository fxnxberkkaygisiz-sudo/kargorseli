import { toPng, toJpeg } from "html-to-image";
import JSZip from "jszip";

export type ImageFormat = "png" | "jpeg";

export interface RenderOptions {
  width: number;
  height: number;
  pixelRatio: number;
  format: ImageFormat;
  background?: string;
}

/**
 * Sablonlar kendi <style>'lari ile geldigi icin her biri izole bir iframe'de
 * render edilir. Boylece uygulamanin Tailwind stilleri gorseli etkilemez.
 * skipFonts: true -> sablonlar sistem font yigini kullanir, harici font
 * indirmesi beklenmez (hizli ve deterministik cikti).
 */
export async function nodeToDataUrl(node: HTMLElement, opts: RenderOptions): Promise<string> {
  const common = {
    width: opts.width,
    height: opts.height,
    pixelRatio: opts.pixelRatio,
    skipFonts: true,
    cacheBust: true,
    backgroundColor: opts.background,
    style: {
      margin: "0",
      transform: "none",
      transformOrigin: "top left",
    },
  } as const;

  return opts.format === "jpeg"
    ? toJpeg(node, { ...common, quality: 0.95 })
    : toPng(node, common);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface ZipEntry {
  filename: string;
  dataUrl: string;
}

export async function downloadZip(entries: ZipEntry[], zipName: string): Promise<void> {
  const zip = new JSZip();
  for (const e of entries) {
    const base64 = e.dataUrl.split(",")[1] ?? "";
    zip.file(e.filename, base64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, zipName);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Panoya PNG kopyalar. Tarayici desteklemiyorsa false doner. */
export async function copyToClipboard(dataUrl: string): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}
