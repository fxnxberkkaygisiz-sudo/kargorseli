/**
 * Telegram'a "guncellemeleri su adrese gonder" der.
 *
 *   npm run webhook -- https://kargorseli-nu.vercel.app
 *   npm run webhook -- --sil          (webhook'u kaldirir)
 *   npm run webhook -- --durum        (mevcut durumu gosterir)
 *
 * Adres verilmezse .env.local icindeki SITE_URL kullanilir.
 * TG_BOT_TOKEN ve TG_WEBHOOK_SECRET de .env.local'dan okunur.
 */

import { readFileSync } from "node:fs";

/** .env.local'i okur - dosya yoksa sessizce gecer. */
function loadEnv(file = ".env.local") {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch {
    /* dosya yok - degiskenler ortamdan gelir */
  }
}

loadEnv();

const args = process.argv.slice(2);
const token = process.env.TG_BOT_TOKEN;
const secret = process.env.TG_WEBHOOK_SECRET;
const apiBase = (process.env.TG_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

if (!token) {
  console.error("TG_BOT_TOKEN tanimli degil (.env.local ya da ortam degiskeni).");
  process.exit(1);
}

const call = async (method, body) => {
  const res = await fetch(`${apiBase}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
};

if (args.includes("--durum")) {
  const info = await call("getWebhookInfo");
  console.log(JSON.stringify(info.result ?? info, null, 2));
  process.exit(0);
}

if (args.includes("--sil")) {
  const out = await call("deleteWebhook", { drop_pending_updates: true });
  console.log(out.ok ? "Webhook kaldirildi." : JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
}

const site = (args.find((a) => a.startsWith("http")) || process.env.SITE_URL || "").replace(
  /\/+$/,
  ""
);

if (!site) {
  console.error(
    "Site adresi gerekli.\n  npm run webhook -- https://kargorseli-nu.vercel.app\nya da .env.local icine SITE_URL yazin."
  );
  process.exit(1);
}
if (!secret) {
  console.error(
    "TG_WEBHOOK_SECRET tanimli degil. Uretmek icin:\n  node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\""
  );
  process.exit(1);
}

const url = `${site}/api/telegram/webhook`;
const out = await call("setWebhook", {
  url,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});

if (out.ok) {
  console.log(`Webhook kuruldu: ${url}`);
  console.log("Bota /yardim yazip deneyebilirsiniz.");
} else {
  console.error("Kurulamadi:", JSON.stringify(out));
  process.exit(1);
}
