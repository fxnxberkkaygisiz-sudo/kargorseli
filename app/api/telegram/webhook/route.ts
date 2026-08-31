import { tgCall } from "@/lib/server/auth";
import {
  addUser,
  adminIds,
  isAdmin,
  removeUser,
  seedIds,
  storeConfigured,
  storedUsers,
  takePending,
} from "@/lib/server/store";

/**
 * Telegram bot webhook'u - yetkili listesini bot uzerinden yonetmek icin.
 *
 * Iki giris yolu var:
 *   - Kanaldaki "giris reddedildi" mesajinin altindaki Onayla / Yoksay tuslari.
 *   - /ekle, /sil, /liste komutlari.
 *
 * Ikisi de yalniz TG_ADMIN_IDS (tanimli degilse ALLOWED_USER_IDS) icindeki
 * hesaplara acik. Adres tahmin edilse bile Telegram'in gonderdigi gizli
 * baslik dogrulanmadan hicbir sey yapilmaz.
 *
 * Kurulum: npm run webhook (scripts/set-webhook.mjs)
 */

const escapeHtml = (s: unknown) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgUpdate {
  message?: {
    chat: { id: number };
    from?: TgUser;
    text?: string;
    message_thread_id?: number;
  };
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

const fullName = (u: TgUser) => [u.first_name, u.last_name].filter(Boolean).join(" ").trim();

const HELP = [
  "<b>Kullanilabilir komutlar</b>",
  "",
  "/liste — yetkili kullanicilar",
  "/ekle <code>123456789</code> — kullaniciyi yetkilendir",
  "/sil <code>123456789</code> — yetkiyi kaldir",
  "/id — kendi Telegram id'ni gosterir",
  "",
  "Yetkisiz bir giris denemesinde kanala dusen mesajin altindaki",
  "<b>Onayla</b> tusu da ayni isi yapar.",
].join("\n");

/* ------------------------------------------------------------- komutlar --- */

async function listText(): Promise<string> {
  const seed = seedIds();
  const stored = await storedUsers();

  const lines = ["<b>Yetkili kullanicilar</b>", ""];

  if (seed.length) {
    lines.push("<i>Ortam degiskeninde (silinemez)</i>");
    for (const id of seed) lines.push(`- <code>${escapeHtml(id)}</code>`);
    lines.push("");
  }

  if (stored.length) {
    lines.push("<i>Bot ile eklenenler</i>");
    for (const u of stored) {
      const who = [u.name, u.username ? `@${u.username}` : ""].filter(Boolean).join(" ");
      const when = u.addedAt ? ` · ${u.addedAt.slice(0, 10)}` : "";
      lines.push(`- <code>${escapeHtml(u.id)}</code>${who ? ` ${escapeHtml(who)}` : ""}${when}`);
    }
  } else {
    lines.push("<i>Bot ile eklenen kimse yok.</i>");
  }

  if (!storeConfigured()) {
    lines.push("", "⚠️ Depo yapilandirilmamis, ekleme/silme kapali.");
  }
  return lines.join("\n");
}

async function handleCommand(text: string, from: TgUser): Promise<string> {
  const [raw, ...rest] = text.trim().split(/\s+/);
  // Gruplarda komutlar /ekle@botadi seklinde gelir.
  const cmd = raw.split("@")[0].toLowerCase();

  if (cmd === "/id") {
    return `Telegram id'niz: <code>${from.id}</code>`;
  }

  if (!isAdmin(from.id)) {
    return adminIds().length
      ? "Bu komutu kullanma yetkiniz yok."
      : "Yonetici tanimli degil (TG_ADMIN_IDS / ALLOWED_USER_IDS bos).";
  }

  if (cmd === "/liste") return listText();
  if (cmd === "/yardim" || cmd === "/start" || cmd === "/help") return HELP;

  if (cmd === "/ekle" || cmd === "/sil") {
    const id = (rest[0] ?? "").replace(/\D/g, "");
    if (!id) {
      return `Kullanim: <code>${cmd} 123456789</code>\n\nKullanicinin id'sini bilmiyorsaniz bir kez giris denemesini isteyin; kanala dusen mesajda yazar.`;
    }

    if (cmd === "/ekle") {
      const pending = await takePending(id);
      const res = await addUser({
        ...pending,
        id,
        addedBy: String(from.id),
      });
      if (!res.ok) return `Eklenemedi: ${escapeHtml(res.error)}`;
      const who = pending.name ? ` (${escapeHtml(pending.name)})` : "";
      return `✅ <code>${escapeHtml(id)}</code>${who} yetkilendirildi. Sayfayi yenileyip girebilir.`;
    }

    const res = await removeUser(id);
    if (!res.ok) return `Silinemedi: ${escapeHtml(res.error)}`;
    return `🗑 <code>${escapeHtml(id)}</code> listeden cikarildi. Acik oturumu da hemen dustu.`;
  }

  return HELP;
}

/* ------------------------------------------------------------- webhook --- */

export async function POST(request: Request) {
  // Telegram her istekte bu basligi gonderiyor; eslesmezse istek bizden degil.
  const secret = process.env.TG_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return Response.json({ error: "Yetkisiz." }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = await request.json();
  } catch {
    return Response.json({ ok: true });
  }

  /* --- onay tuslari --- */
  if (update.callback_query) {
    const cb = update.callback_query;
    const [action, userId] = (cb.data ?? "").split(":");

    if (!isAdmin(cb.from.id)) {
      await tgCall("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "Bu islem icin yetkiniz yok.",
        show_alert: true,
      });
      return Response.json({ ok: true });
    }

    let note = "";
    if (action === "onay" && userId) {
      const pending = await takePending(userId);
      const res = await addUser({ ...pending, id: userId, addedBy: String(cb.from.id) });
      note = res.ok
        ? `✅ ${fullName(cb.from)} onayladi — <code>${escapeHtml(userId)}</code> yetkilendirildi.`
        : `⚠️ Eklenemedi: ${escapeHtml(res.error)}`;
    } else if (action === "red" && userId) {
      await takePending(userId);
      note = `✖️ ${fullName(cb.from)} yoksaydi.`;
    }

    await tgCall("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: note.replace(/<[^>]*>/g, ""),
    });

    // Tuslari kaldirip sonucu mesajin altina yaz - kanalda ne olduğu kalsin.
    if (cb.message && note) {
      await tgCall("editMessageReplyMarkup", {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
      await tgCall("sendMessage", {
        chat_id: cb.message.chat.id,
        text: note,
        parse_mode: "HTML",
        reply_to_message_id: cb.message.message_id,
      });
    }
    return Response.json({ ok: true });
  }

  /* --- komutlar --- */
  const msg = update.message;
  if (msg?.text?.startsWith("/") && msg.from) {
    const reply = await handleCommand(msg.text, msg.from);
    await tgCall("sendMessage", {
      chat_id: msg.chat.id,
      text: reply,
      parse_mode: "HTML",
      ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}),
    });
  }

  return Response.json({ ok: true });
}
