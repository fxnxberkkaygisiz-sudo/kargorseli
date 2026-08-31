/**
 * Telegram girisi - istemci tarafi.
 *
 * Giris bot uzerinden yapiliyor: sunucudan tek kullanimlik bir anahtar
 * alinir, kullanici t.me baglantisini Telegram uygulamasinda acip Baslat'a
 * basar, tarayici da anahtari yoklayarak oturumu alir.
 *
 * Token'i burada hic tutmuyoruz: cerez httpOnly, yani bu dosyadaki (ya da
 * bir XSS'in enjekte ettigi) JS onu okuyamaz. Ayni origin oldugu icin
 * tarayici cerezi kendiliginden gonderiyor - fetch'e ek ayar gerekmiyor.
 */

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  /** Unix saniye - oturumun son gecerlilik ani. */
  exp: number;
}

const TG_BOT = (process.env.NEXT_PUBLIC_TG_BOT ?? "").replace(/^@/, "");

/** Alt yolda yayinlanirsa API de o yolun altinda kalir. */
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
const api = (path: string) => `${BASE}/api${path}`;

/**
 * Bot kullanici adi tanimli degilse giris kapisi devreye girmez ve uygulama
 * eskisi gibi acik calisir. Yerel gelistirmede varsayilan budur.
 */
export const authEnabled = Boolean(TG_BOT);

/* ------------------------------------------------- bot ile giris ------ */

export interface LinkStart {
  nonce: string;
  /** t.me baglantisi - acildiginda Telegram uygulamasi devreye girer. */
  url: string;
}

/**
 * Girisi baslatir: tek kullanimlik anahtar + t.me baglantisi.
 *
 * Bu yol BotFather'daki alan adi kaydina bagli degil, yani preview
 * adreslerinde ve localhost'ta da calisir.
 */
export async function startLinkLogin(): Promise<{ ok: boolean; data?: LinkStart; error?: string }> {
  try {
    const res = await fetch(api("/auth/link/start"), { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `HTTP ${res.status}` };
    return { ok: true, data: json };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Baglanti hatasi";
    return { ok: false, error: `Sunucuya ulasilamadi - ${message}` };
  }
}

export type ClaimState =
  | { state: "pending" }
  | { state: "ok"; user: SessionUser }
  /** Yetkisiz hesap - userId beyaz listeye eklemek icin geri veriliyor. */
  | { state: "denied"; error: string; userId?: string }
  | { state: "expired"; error: string };

/** Anahtar bota baglandi mi? Baglandiysa oturumu acar. */
export async function claimLink(nonce: string): Promise<ClaimState> {
  try {
    const res = await fetch(api("/auth/link/claim"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce }),
    });
    if (res.status === 202) return { state: "pending" };

    const json = await res.json().catch(() => ({}));
    if (res.ok) return { state: "ok", user: json.user };
    if (res.status === 410) {
      return { state: "expired", error: json?.error || "Bağlantının süresi doldu." };
    }
    return { state: "denied", error: json?.error || `HTTP ${res.status}`, userId: json?.userId };
  } catch {
    // Ag dalgalanmasi - yoklamaya devam.
    return { state: "pending" };
  }
}

/** Cerezdeki oturum hala gecerli mi? */
export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch(api("/auth/me"), { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.user ?? null;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(api("/auth/logout"), { method: "POST" });
  } catch {
    /* cikis logu atilamadi - cerez yine de sunucuda silinmis olabilir */
  }
}

/** logger.ts de ayni yol onekini kullansin. */
export const apiUrl = api;
