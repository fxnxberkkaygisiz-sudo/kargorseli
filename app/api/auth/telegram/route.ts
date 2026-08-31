import {
  actorFromTelegram,
  authConfigured,
  authDateFresh,
  sendLog,
  verifyTelegramPayload,
  type TelegramPayload,
} from "@/lib/server/auth";
import { finishLogin } from "@/lib/server/login";

/**
 * Telegram Login Widget'inin dondurdugu veriyi dogrular ve oturumu acar.
 * Dogrulama bot token'iyla yapilan bir HMAC oldugu icin tarayicida
 * yapilamaz - bu ucun varlik sebebi bu.
 *
 * Widget yalniz BotFather'da /setdomain ile kayitli alan adinda calisir.
 * Kayitsiz adreslerde (preview deploy'lari, localhost) /api/auth/link
 * uzerindeki bot baglantisi yolu kullanilir.
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

  return finishLogin(request, actorFromTelegram(data), "widget");
}
