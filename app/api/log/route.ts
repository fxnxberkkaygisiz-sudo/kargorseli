import { cookies } from "next/headers";
import { SESSION_COOKIE, actorFromSession, readSession, sendLog } from "@/lib/server/auth";

/**
 * Uygulama olaylarini kanala iletir. Gecerli oturum sart: yoksa siteyi bulan
 * herkes kanali doldurabilirdi.
 */
export async function POST(request: Request) {
  const store = await cookies();
  const session = await readSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "Oturum yok." }, { status: 401 });

  let body: { action?: string; detail?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Gecersiz istek govdesi." }, { status: 400 });
  }

  await sendLog({
    action: String(body?.action || "event").slice(0, 40),
    actor: actorFromSession(session),
    request,
    detail: body?.detail,
  });

  return Response.json({ ok: true });
}
