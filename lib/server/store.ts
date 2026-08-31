/**
 * Yetkili kullanici listesi - kalici depo (Upstash Redis, REST uzerinden).
 *
 * Liste iki parcadan olusur:
 *   1. ALLOWED_USER_IDS ortam degiskeni - cekirdek liste. Depo bos ya da
 *      erisilemez olsa bile buradakiler girebilir; kendinizi disarida
 *      birakmanin yolu yok.
 *   2. Depodaki kayitlar - bot uzerinden eklenip silinenler.
 *
 * Depo yapilandirilmamissa uygulama calismaya devam eder, sadece bot ile
 * ekleme/silme kapali kalir.
 */

import "server-only";

const KEY = "kg:allowed";
/** Giris deneyip reddedilenler - onay tusuna basildiginda buradan okunur. */
const PENDING_KEY = "kg:pending";

export interface AllowedUser {
  id: string;
  name?: string;
  username?: string;
  /** Ekleyen yoneticinin Telegram id'si. */
  addedBy?: string;
  /** ISO tarih. */
  addedAt?: string;
}

/* --------------------------------------------------------------- upstash -- */

/**
 * Vercel Marketplace entegrasyonu degiskenleri KV_* adiyla, Upstash'in kendi
 * paneli UPSTASH_* adiyla enjekte ediyor; ikisini de kabul ediyoruz.
 */
function credentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export const storeConfigured = () => credentials() !== null;

/** Tek bir Redis komutu calistirir. Hata durumunda null doner. */
async function command<T>(args: (string | number)[]): Promise<T | null> {
  const creds = credentials();
  if (!creds) return null;

  try {
    const res = await fetch(creds.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("upstash HTTP", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error) {
      console.error("upstash", json.error);
      return null;
    }
    return (json.result ?? null) as T | null;
  } catch (err) {
    console.error("upstash", err);
    return null;
  }
}

/* ----------------------------------------------------------- cekirdek --- */

export function seedIds(): string[] {
  return String(process.env.ALLOWED_USER_IDS || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Onay verebilen / komut calistirabilenler. Tanimli degilse cekirdek liste. */
export function adminIds(): string[] {
  const explicit = String(process.env.TG_ADMIN_IDS || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return explicit.length ? explicit : seedIds();
}

export const isAdmin = (id: string | number) => adminIds().includes(String(id));

/* ------------------------------------------------------------- liste ----- */

/** Depodaki kayitlar (cekirdek liste haric). */
export async function storedUsers(): Promise<AllowedUser[]> {
  const flat = await command<string[]>(["HGETALL", KEY]);
  if (!flat) return [];

  const out: AllowedUser[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const id = flat[i];
    try {
      out.push({ id, ...(JSON.parse(flat[i + 1]) as Omit<AllowedUser, "id">) });
    } catch {
      out.push({ id });
    }
  }
  return out;
}

/** Cekirdek liste + depo. Giris ve oturum kontrolu bunu kullanir. */
export async function allowedIds(): Promise<string[]> {
  const seed = seedIds();
  if (!storeConfigured()) return seed;

  const stored = await command<string[]>(["HKEYS", KEY]);
  return [...new Set([...seed, ...(stored ?? [])])];
}

export async function isAllowed(id: string | number): Promise<boolean> {
  const wanted = String(id);
  if (seedIds().includes(wanted)) return true;
  if (!storeConfigured()) return false;

  const hit = await command<number>(["HEXISTS", KEY, wanted]);
  return hit === 1;
}

/* ------------------------------------------------------ ekleme / silme --- */

export type WriteResult = { ok: true } | { ok: false; error: string };

export async function addUser(user: AllowedUser): Promise<WriteResult> {
  if (!storeConfigured()) {
    return { ok: false, error: "Depo yapilandirilmamis (KV_REST_API_URL / KV_REST_API_TOKEN)." };
  }
  const { id, ...meta } = user;
  const res = await command<number>([
    "HSET",
    KEY,
    id,
    JSON.stringify({ ...meta, addedAt: meta.addedAt ?? new Date().toISOString() }),
  ]);
  return res === null ? { ok: false, error: "Depoya yazilamadi." } : { ok: true };
}

export async function removeUser(id: string): Promise<WriteResult> {
  if (!storeConfigured()) {
    return { ok: false, error: "Depo yapilandirilmamis (KV_REST_API_URL / KV_REST_API_TOKEN)." };
  }
  // Cekirdek listedekiler ortam degiskeninde; bot ile silinemezler.
  if (seedIds().includes(id)) {
    return { ok: false, error: "Bu kullanici ALLOWED_USER_IDS icinde tanimli, bot ile silinemez." };
  }
  const res = await command<number>(["HDEL", KEY, id]);
  return res === null ? { ok: false, error: "Depodan silinemedi." } : { ok: true };
}

/* ------------------------------------------------------------ bekleyen --- */

/**
 * Reddedilen giris denemesini saklar. Onay tusuna basildiginda callback
 * verisinde yalniz id geliyor; ad ve kullanici adini buradan aliyoruz.
 */
export async function rememberPending(user: AllowedUser): Promise<void> {
  if (!storeConfigured()) return;
  const { id, ...meta } = user;
  await command(["HSET", PENDING_KEY, id, JSON.stringify(meta)]);
}

/* -------------------------------------------------- baglanti anahtari --- */

/**
 * Derin baglantiyla giris: tarayici tek kullanimlik bir anahtar alir,
 * kullanici t.me/<bot>?start=<anahtar> baglantisini Telegram uygulamasinda
 * acar, bot /start ile anahtari o hesaba baglar, tarayici da anahtari
 * yoklayarak oturumu alir.
 *
 * Anahtar tahmin edilemez, tek kullanimlik ve kisa omurludur. Bu yol
 * BotFather'daki alan adi kaydina bagli degil - widget'in "Bot domain
 * invalid" verdigi her yerde (preview adresleri, localhost) calisir.
 */
const LINK_PREFIX = "kg:link:";
const LINK_TTL = 300;

export interface LinkToken {
  status: "pending" | "ready";
  user?: AllowedUser;
}

/** t.me start parametresi yalniz A-Za-z0-9_- kabul ediyor. */
export function newLinkNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createLinkToken(): Promise<string | null> {
  if (!storeConfigured()) return null;
  const nonce = newLinkNonce();
  const res = await command<string>([
    "SET",
    LINK_PREFIX + nonce,
    JSON.stringify({ status: "pending" } satisfies LinkToken),
    "EX",
    LINK_TTL,
  ]);
  return res === null ? null : nonce;
}

/** Bot /start ile geldiginde anahtari kullaniciya baglar. */
export async function attachLinkUser(nonce: string, user: AllowedUser): Promise<boolean> {
  if (!storeConfigured() || !nonce) return false;

  const raw = await command<string | null>(["GET", LINK_PREFIX + nonce]);
  if (!raw) return false;

  const res = await command<string>([
    "SET",
    LINK_PREFIX + nonce,
    JSON.stringify({ status: "ready", user } satisfies LinkToken),
    "EX",
    LINK_TTL,
  ]);
  return res !== null;
}

/**
 * Tarayicinin yoklamasi. Hazirsa anahtari siler - tek kullanimlik olmasi
 * boyle saglaniyor; ayni anahtarla ikinci kez oturum alinamaz.
 */
export async function pollLinkToken(nonce: string): Promise<LinkToken | null> {
  if (!storeConfigured() || !nonce) return null;

  const raw = await command<string | null>(["GET", LINK_PREFIX + nonce]);
  if (!raw) return null;

  let parsed: LinkToken;
  try {
    parsed = JSON.parse(raw) as LinkToken;
  } catch {
    return null;
  }

  if (parsed.status === "ready") await command(["DEL", LINK_PREFIX + nonce]);
  return parsed;
}

export async function takePending(id: string): Promise<AllowedUser> {
  if (!storeConfigured()) return { id };

  const raw = await command<string | null>(["HGET", PENDING_KEY, id]);
  await command(["HDEL", PENDING_KEY, id]);
  if (!raw) return { id };
  try {
    return { id, ...(JSON.parse(raw) as Omit<AllowedUser, "id">) };
  } catch {
    return { id };
  }
}
