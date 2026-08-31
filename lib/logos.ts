/**
 * Matriks Analist logo servisi.
 * Dok: https://analistdocs.matriksdata.com/meta-veriler/logolar
 *   GET {base}/images/{type}/{name}?png=true&size=200
 *   type: symbols | foreign-symbols | flags | sectors
 * Kimlik dogrulama gerektirmiyor ve CORS basligi donuyor, bu yuzden
 * tarayicidan dogrudan cekilebiliyor.
 */
export const MATRIKS_BASE =
  "https://apitest.matriksdata.com/dumrul/v2/mtx-cdn/images";

export type LogoType = "symbols" | "foreign-symbols" | "flags" | "sectors";

export function logoUrl(
  name: string,
  opts: { type?: LogoType; png?: boolean; size?: number; base?: string } = {}
): string {
  const { type = "symbols", png = true, size = 200, base = MATRIKS_BASE } = opts;
  const q = new URLSearchParams();
  if (png) q.set("png", "true");
  // size 20'nin katlarinda ve en fazla 500 calisiyor
  if (png && size) q.set("size", String(Math.min(500, Math.round(size / 20) * 20)));
  const qs = q.toString();
  return `${base.replace(/\/+$/, "")}/${type}/${encodeURIComponent(name.trim().toUpperCase())}${qs ? `?${qs}` : ""}`;
}

/**
 * Logoyu indirip data URI'ye cevirir. Gorsele gomulu hale geldigi icin
 * PNG'ye donusturme sirasinda tekrar ag istegi yapilmaz - export hem hizli
 * hem de cevrimdisi calisir.
 */
export async function fetchLogoDataUrl(
  code: string,
  opts?: { type?: LogoType; size?: number; base?: string }
): Promise<string | null> {
  try {
    // no-store sart: sunucu Access-Control-Allow-Origin'i yankiliyor ama
    // "Vary: Origin" gondermiyor. Onbellekten gelen yanit baska bir origin
    // icin alinmis ACAO basligi tasidiginda tarayici CORS hatasi veriyor.
    // Logolar zaten data URI olarak saklandigi icin oturum basina tek istek.
    const res = await fetch(logoUrl(code, { ...opts, png: true }), { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("okunamadi"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface LogoResult {
  code: string;
  ok: boolean;
  dataUrl?: string;
}

export async function fetchLogos(
  codes: string[],
  opts?: { type?: LogoType; size?: number; base?: string }
): Promise<LogoResult[]> {
  return Promise.all(
    codes.map(async (code) => {
      const dataUrl = await fetchLogoDataUrl(code, opts);
      return { code, ok: Boolean(dataUrl), dataUrl: dataUrl ?? undefined };
    })
  );
}
