import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  approvalKeyboard,
  authConfigured,
  authDateFresh,
  issueSession,
  sendLog,
  sessionTtlSeconds,
  verifyTelegramPayload,
  type Actor,
  type TelegramPayload,
} from "@/lib/server/auth";
import { isAllowed, rememberPending, storeConfigured } from "@/lib/server/store";

/**
 * Telegram Login Widget'inin dondurdugu veriyi dogrular ve oturum cerezini
 * yazar. Dogrulama bot token'iyla yapilan bir HMAC oldugu icin tarayicida
 * yapilamaz - bu ucun varlik sebebi bu.
 */
export async function POST(request: Request) {
  if (!authConfigured()) {
    return Response.json(
      { error: "Sunucu eksik yapilandirilmis (TG_BOT_TOKEN / SESSION_SECRET)." },
      { status: 500 }
    );
  }

  let data: TelegramPayload;
  try {
    data = await request.json();
  } catch {
    return Response.json({ error: "Gecersiz istek govdesi." }, { status: 400 });
  }

  const valid = await verifyTelegramPayload(data, String(process.env.TG_BOT_TOKEN));
  if (!valid) {
    await sendLog({
      action: "login_invalid",
      request,
      detail: { "gelen id": data?.id, kullanici: data?.username },
    });
    return Response.json({ error: "Telegram imzasi dogrulanamadi." }, { status: 401 });
  }

  if (!authDateFresh(data.auth_date)) {
    return Response.json(
      { error: "Giris verisi zaman asimina ugramis, tekrar deneyin." },
      { status: 401 }
    );
  }

  const actor: Actor = {
    id: String(data.id),
    username: data.username || "",
    name: [data.first_name, data.last_name].filter(Boolean).join(" ").trim(),
  };

  if (!(await isAllowed(actor.id))) {
    // Kanaldaki mesajin altina onay tuslari konur: yonetici tek dokunusla
    // yetkilendirir, kullanici sayfayi yenileyip girer. Ad/kullanici adi
    // callback verisine sigmadigi icin ayrica saklaniyor.
    await rememberPending({ id: actor.id, name: actor.name, username: actor.username });
    await sendLog({
      action: "login_denied",
      actor,
      request,
      detail: storeConfigured()
        ? undefined
        : { "izin icin ekle": `ALLOWED_USER_IDS += ${actor.id}` },
      replyMarkup: storeConfigured() ? approvalKeyboard(actor.id) : undefined,
    });
    // userId geri veriliyor: kullanici kendi id'sini gorsun.
    return Response.json({ error: "Bu hesap yetkili degil.", userId: actor.id }, { status: 403 });
  }

  const ttl = sessionTtlSeconds();
  const store = await cookies();
  store.set(SESSION_COOKIE, await issueSession(data), {
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
    detail: { "oturum suresi": `${ttl / 3600} saat` },
  });

  return Response.json({ user: { ...actor, exp: Math.floor(Date.now() / 1000) + ttl } });
}
