import { adminIds, allowedIds, seedIds, storeConfigured } from "@/lib/server/store";

/** Kurulum kontrolu: hangi ortam degiskeni eksik, tarayicidan gorunsun. */
export async function GET() {
  return Response.json({
    ok: true,
    botToken: Boolean(process.env.TG_BOT_TOKEN),
    logChat: Boolean(process.env.TG_LOG_CHAT_ID),
    sessionSecret: Boolean(process.env.SESSION_SECRET),
    webhookSecret: Boolean(process.env.TG_WEBHOOK_SECRET),
    botUsername: process.env.NEXT_PUBLIC_TG_BOT || "",
    // Depo yoksa bot ile ekleme/silme kapalidir, uygulama yine calisir.
    store: storeConfigured(),
    seedUsers: seedIds().length,
    allowedUsers: (await allowedIds()).length,
    admins: adminIds().length,
  });
}
