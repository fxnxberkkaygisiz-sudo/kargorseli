/**
 * Telegram girisi ve kanal loglari - sunucu tarafi.
 *
 * Bu dosya yalniz route handler'lardan cagrilir; icindeki hicbir sey
 * istemciye gitmez. Bot token'i burada okunur ve tarayiciya asla gitmez.
 *
 * Oturum imzali bir cerezde tasinir: httpOnly oldugu icin sayfadaki JS
 * (ve dolayisiyla bir XSS) okuyamaz. Site ile API ayni origin'de oldugu
 * icin ucuncu taraf cerez engelleri de devrede degil.
 */

import "server-only";
import { isAllowed } from "./store.ts";

const enc = new TextEncoder();

export const SESSION_COOKIE = "kg_session";

export interface SessionPayload {
  /** Telegram kullanici id'si. */
  sub: string;
  /** Kullanici adi (@ olmadan), yoksa bos. */
  un: string;
  /** Ad soyad. */
  nm: string;
  iat: number;
  exp: number;
}

export interface Actor {
  id: string;
  username: string;
  name: string;
}

/* --------------------------------------------------------------- ayarlar -- */

export const sessionTtlSeconds = () => Number(process.env.SESSION_TTL_HOURS || 12) * 3600;

/** Sunucu tarafi eksiksiz yapilandirilmis mi? */
export const authConfigured = () =>
  Boolean(process.env.TG_BOT_TOKEN && process.env.SESSION_SECRET);

/* -------------------------------------------------------------- yardimci -- */

const b64urlEncode = (bytes: ArrayBuffer | Uint8Array) => {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64urlDecode = (str: string) => {
  const pad = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Uzunluk sizdirmayan karsilastirma. */
function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hmacKey = (secret: string | ArrayBuffer) =>
  crypto.subtle.importKey(
    "raw",
    typeof secret === "string" ? enc.encode(secret) : secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

/* --------------------------------------------------------------- oturum ---- */

export async function issueSession(user: Actor): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: String(user.id),
    un: user.username || "",
    nm: user.name || "",
    iat: now,
    exp: now + sessionTtlSeconds(),
  };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(String(process.env.SESSION_SECRET));
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64urlEncode(sig)}`;
}

/**
 * Cerezdeki oturumu dogrular. Beyaz liste her istekte yeniden okunur:
 * biri listeden cikarilinca elindeki cerez de aninda gecersiz olsun.
 */
export async function readSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token || !token.includes(".") || !process.env.SESSION_SECRET) return null;

  const [body, sig] = token.split(".");
  const key = await hmacKey(String(process.env.SESSION_SECRET));
  const expected = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  if (!safeEqual(b64urlEncode(expected), sig)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!(await isAllowed(payload.sub))) return null;
    return payload;
  } catch {
    return null;
  }
}

export const actorFromSession = (s: SessionPayload): Actor => ({
  id: s.sub,
  username: s.un,
  name: s.nm,
});

/* ------------------------------------------------------------------- log --- */

const escapeHtml = (s: unknown) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const EVENT_LABEL: Record<string, [string, string]> = {
  login: ["OK", "Giris"],
  login_denied: ["RED", "Giris reddedildi (listede yok)"],
  logout: ["--", "Cikis"],
  open: ["**", "Uygulama acildi"],
  download: ["DL", "Gorsel indirildi"],
  download_batch: ["ZIP", "Toplu indirme"],
  copy: ["CP", "Panoya kopyalandi"],
  error: ["ERR", "Hata"],
};

/** Saati Istanbul'a cevirir; kanalda okurken kafa karistirmasin. */
const stamp = () =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());

/** IP ve konum Vercel'in eklediği basliklardan okunur. */
export function requestFacts(request: Request) {
  const h = request.headers;
  const forwarded = (h.get("x-forwarded-for") || "").split(",")[0].trim();
  const ua = h.get("user-agent") || "";
  const decode = (v: string | null) => {
    if (!v) return "";
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return {
    ip: forwarded || h.get("x-real-ip") || "?",
    country: h.get("x-vercel-ip-country") || "?",
    city: decode(h.get("x-vercel-ip-city")),
    ua: ua.length > 180 ? `${ua.slice(0, 180)}...` : ua || "?",
    referer: h.get("referer") || "",
  };
}

/**
 * TG_API_BASE: Telegram'a dogrudan cikilamayan aglarda vekil sunucu adresi
 * verilebilsin diye; testlerde de burasi yonlendiriliyor.
 */
const apiBase = () =>
  (process.env.TG_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

/**
 * Bot API'sine tek bir cagri. Log ve bot yanitlari kullanicinin isini
 * durdurmamali, o yuzden hatalar yutulup konsola dusuruluyor.
 */
export async function tgCall(
  method: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; result?: Record<string, unknown> };
    if (!res.ok || !json.ok) {
      console.error(`telegram ${method}`, res.status, JSON.stringify(json).slice(0, 300));
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.error(`telegram ${method}`, err);
    return null;
  }
}

/** Yetkisiz giris mesajinin altina konan tek dokunusluk onay tuslari. */
export const approvalKeyboard = (userId: string) => ({
  inline_keyboard: [
    [
      { text: "✅ Onayla", callback_data: `onay:${userId}` },
      { text: "✖️ Yoksay", callback_data: `red:${userId}` },
    ],
  ],
});

export interface LogInput {
  action: string;
  actor?: Actor;
  detail?: Record<string, unknown>;
  request: Request;
  /** Mesajin altina eklenecek inline klavye (onay tuslari gibi). */
  replyMarkup?: Record<string, unknown>;
}

/**
 * Kanala tek bir olay yazar. Log gonderimi hicbir zaman asil istegi
 * dusurmemeli - hata yutulur, sadece sunucu konsoluna dusurulur.
 */
export async function sendLog({
  action,
  actor,
  detail,
  request,
  replyMarkup,
}: LogInput): Promise<void> {
  const chatId = process.env.TG_LOG_CHAT_ID;
  if (!process.env.TG_BOT_TOKEN || !chatId) return;

  const [tag, label] = EVENT_LABEL[action] ?? ["*", action];
  const facts = requestFacts(request);

  const who = actor
    ? `${escapeHtml(actor.name || "-")}${actor.username ? ` (@${escapeHtml(actor.username)})` : ""} - <code>${escapeHtml(actor.id)}</code>`
    : "<i>anonim</i>";

  const lines = [
    `[${tag}] <b>${escapeHtml(label)}</b>`,
    `Kullanici: ${who}`,
    `Zaman: ${escapeHtml(stamp())}`,
    `IP: <code>${escapeHtml(facts.ip)}</code> - ${escapeHtml(facts.country)}${facts.city ? ` / ${escapeHtml(facts.city)}` : ""}`,
    `Tarayici: <code>${escapeHtml(facts.ua)}</code>`,
  ];
  if (facts.referer) lines.push(`Sayfa: ${escapeHtml(facts.referer)}`);

  if (detail && typeof detail === "object") {
    const rows = Object.entries(detail)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .slice(0, 20)
      .map(([k, v]) => {
        const text = typeof v === "object" ? JSON.stringify(v) : String(v);
        const short = text.length > 300 ? `${text.slice(0, 300)}...` : text;
        return `- <b>${escapeHtml(k)}</b>: ${escapeHtml(short)}`;
      });
    if (rows.length) lines.push("", ...rows);
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: lines.join("\n").slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (process.env.TG_LOG_THREAD_ID) {
    body.message_thread_id = Number(process.env.TG_LOG_THREAD_ID);
  }
  if (replyMarkup) body.reply_markup = replyMarkup;

  await tgCall("sendMessage", body);
}
