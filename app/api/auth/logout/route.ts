import { cookies } from "next/headers";
import { SESSION_COOKIE, actorFromSession, readSession, sendLog } from "@/lib/server/auth";

export async function POST(request: Request) {
  const store = await cookies();
  const session = await readSession(store.get(SESSION_COOKIE)?.value);

  store.delete(SESSION_COOKIE);

  if (session) {
    await sendLog({ action: "logout", actor: actorFromSession(session), request });
  }
  return Response.json({ ok: true });
}
