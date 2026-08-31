import { finishLogin } from "@/lib/server/login";
import { pollLinkToken } from "@/lib/server/store";

/**
 * Bot baglantisiyla giris - 2. adim.
 *
 * Tarayici anahtari yoklar. Bot henuz baglamadiysa "pending" doner ve
 * tarayici beklemeye devam eder. Baglandiysa anahtar tuketilir (tek
 * kullanimlik) ve oturum acilir - beyaz liste kontrolu widget yolundakiyle
 * ayni yerde yapiliyor.
 */
export async function POST(request: Request) {
  let body: { nonce?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Gecersiz istek govdesi." }, { status: 400 });
  }

  const nonce = String(body?.nonce || "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) {
    return Response.json({ error: "Gecersiz anahtar." }, { status: 400 });
  }

  const token = await pollLinkToken(nonce);
  if (!token) {
    return Response.json(
      { error: "Bağlantının süresi doldu, yeniden deneyin." },
      { status: 410 }
    );
  }
  if (token.status !== "ready" || !token.user) {
    return Response.json({ status: "pending" }, { status: 202 });
  }

  return finishLogin(
    request,
    {
      id: String(token.user.id),
      username: token.user.username || "",
      name: token.user.name || "",
    },
    "bot"
  );
}
