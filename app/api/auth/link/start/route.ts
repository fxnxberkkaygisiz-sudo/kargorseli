import { authConfigured } from "@/lib/server/auth";
import { createLinkToken, storeConfigured } from "@/lib/server/store";

/**
 * Bot baglantisiyla giris - 1. adim.
 *
 * Tek kullanimlik, kisa omurlu bir anahtar uretip t.me baglantisini doner.
 * Kullanici baglantiyi Telegram uygulamasinda acip Baslat'a basinca bot
 * /start ile anahtari o hesaba baglar (webhook), tarayici da /claim ile
 * yoklayip oturumu alir.
 */
export async function POST() {
  if (!authConfigured()) {
    return Response.json({ error: "Sunucu eksik yapilandirilmis." }, { status: 500 });
  }

  const bot = (process.env.NEXT_PUBLIC_TG_BOT || "").replace(/^@/, "");
  if (!bot) {
    return Response.json({ error: "Bot kullanici adi tanimli degil." }, { status: 500 });
  }
  if (!storeConfigured()) {
    return Response.json(
      { error: "Bu giris yolu icin depo gerekiyor (Upstash bagli degil)." },
      { status: 503 }
    );
  }

  const nonce = await createLinkToken();
  if (!nonce) {
    return Response.json({ error: "Baglanti anahtari uretilemedi." }, { status: 503 });
  }

  return Response.json({ nonce, url: `https://t.me/${bot}?start=${nonce}` });
}
