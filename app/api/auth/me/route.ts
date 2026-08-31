import { cookies } from "next/headers";
import { SESSION_COOKIE, actorFromSession, readSession } from "@/lib/server/auth";

/**
 * Elde tutulan cerez hala gecerli mi. Beyaz liste her cagride yeniden
 * okundugu icin listeden cikarilan biri bir sonraki istekte disari duser.
 */
export async function GET() {
  const store = await cookies();
  const session = await readSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "Oturum yok." }, { status: 401 });

  return Response.json({ user: { ...actorFromSession(session), exp: session.exp } });
}
