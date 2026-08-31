/**
 * Giris tamamlama - iki yolun ortak son adimi.
 *
 * Kimligin nasil dogrulandigi degisiyor (widget imzasi ya da bot uzerinden
 * derin baglanti), ama sonrasi ayni: beyaz liste kontrolu, cerez, kanala log.
 * Tek yerde durmasi iki yolun birbirinden ayrilmamasini sagliyor.
 */

import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  approvalKeyboard,
  issueSession,
  sendLog,
  sessionTtlSeconds,
  type Actor,
} from "./auth.ts";
import { isAllowed, rememberPending, storeConfigured } from "./store.ts";

/** Girisin hangi yoldan geldigi - kanaldaki mesajda gorunsun. */
export type LoginSource = "widget" | "bot";

const SOURCE_LABEL: Record<LoginSource, string> = {
  widget: "Telegram widget",
  bot: "bot baglantisi",
};

export async function finishLogin(
  request: Request,
  actor: Actor,
  source: LoginSource
): Promise<Response> {
  if (!(await isAllowed(actor.id))) {
    // Kanaldaki mesajin altina onay tuslari konur: yonetici tek dokunusla
    // yetkilendirir, kullanici tekrar deneyip girer. Ad/kullanici adi
    // callback verisine sigmadigi icin ayrica saklaniyor.
    await rememberPending({ id: actor.id, name: actor.name, username: actor.username });
    await sendLog({
      action: "login_denied",
      actor,
      request,
      detail: storeConfigured()
        ? { yol: SOURCE_LABEL[source] }
        : { yol: SOURCE_LABEL[source], "izin icin ekle": `ALLOWED_USER_IDS += ${actor.id}` },
      // Depo yoksa calismayacak dugme gostermiyoruz.
      replyMarkup: storeConfigured() ? approvalKeyboard(actor.id) : undefined,
    });
    // userId geri veriliyor: kullanici kendi id'sini gorsun.
    return Response.json({ error: "Bu hesap yetkili degil.", userId: actor.id }, { status: 403 });
  }

  const ttl = sessionTtlSeconds();
  const store = await cookies();
  store.set(SESSION_COOKIE, await issueSession(actor), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl,
  });

  await sendLog({
    action: "login",
    actor,
    request,
    detail: { yol: SOURCE_LABEL[source], "oturum suresi": `${ttl / 3600} saat` },
  });

  return Response.json({ user: { ...actor, exp: Math.floor(Date.now() / 1000) + ttl } });
}
