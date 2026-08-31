/**
 * Giris dogrulamasi ve oturum imzasi testleri.
 *
 *   npm run test:auth
 *
 * lib/server/auth.ts `server-only` isaretcisini import ettigi icin node'u
 * --conditions=react-server ile calistiriyoruz; .ts tiplerini node kendisi
 * soyuyor, ayri bir derleme adimi yok.
 */

process.env.TG_BOT_TOKEN = "123456:TEST-TOKEN-abcdef";
process.env.SESSION_SECRET = "test-secret-uzun-dize";
process.env.ALLOWED_USER_IDS = "777, 888";
process.env.SESSION_TTL_HOURS = "1";

const {
  SESSION_COOKIE,
  authDateFresh,
  issueSession,
  readSession,
  requestFacts,
  sendLog,
  verifyTelegramPayload,
} = await import("../lib/server/auth.ts");
const { adminIds, isAdmin, isAllowed, seedIds, storeConfigured } = await import(
  "../lib/server/store.ts"
);

const BOT_TOKEN = process.env.TG_BOT_TOKEN;
const enc = new TextEncoder();

/** Telegram'in urettigi imzanin aynisini uretir. */
async function sign(data, token = BOT_TOKEN) {
  const checkString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(token));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(checkString));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const payload = async (id, token) => {
  const data = { id, first_name: "Ada", username: "ada", auth_date: Math.floor(Date.now() / 1000) };
  return { ...data, hash: await sign(data, token) };
};

const results = [];
const check = (name, cond, extra = "") => results.push({ name, ok: Boolean(cond), extra });

/* --------------------------------------------------------- imza dogrulama -- */

check("cerez adi sabit", SESSION_COOKIE === "kg_session", SESSION_COOKIE);

{
  const good = await payload(777);
  check("gecerli imza kabul", await verifyTelegramPayload(good, BOT_TOKEN));

  const tampered = { ...good, hash: good.hash.replace(/^./, (c) => (c === "a" ? "b" : "a")) };
  check("kurcalanmis hash reddedildi", !(await verifyTelegramPayload(tampered, BOT_TOKEN)));

  // Alan degistirilirse imza tutmaz - baskasinin adina giris yapilamasin.
  const renamed = { ...good, id: 999 };
  check("id degistirilirse reddedildi", !(await verifyTelegramPayload(renamed, BOT_TOKEN)));

  const otherBot = await payload(777, "999:BASKA-TOKEN");
  check("baska bot token'i reddedildi", !(await verifyTelegramPayload(otherBot, BOT_TOKEN)));

  check("hash alani yoksa reddedildi", !(await verifyTelegramPayload({ id: 1 }, BOT_TOKEN)));
}

/* ------------------------------------------------------------- auth_date --- */

const now = Math.floor(Date.now() / 1000);
check("taze auth_date", authDateFresh(now));
check("24 saatten eski auth_date reddedildi", !authDateFresh(now - 90000));
check("gelecekteki auth_date reddedildi", !authDateFresh(now + 600));

/* ---------------------------------------------------------- beyaz liste ---- */

check("listedeki id gecer", (await isAllowed("777")) && (await isAllowed(888)));
check("listede olmayan id gecmez", !(await isAllowed("555")));
check("cekirdek liste okundu", seedIds().join(",") === "777,888", seedIds().join(","));
check("depo yoksa kapali", storeConfigured() === false);

// TG_ADMIN_IDS bos: yonetici olarak cekirdek liste gecerli olmali.
check("yonetici cekirdek listeden geliyor", isAdmin("777") && !isAdmin("555"));
process.env.TG_ADMIN_IDS = "888";
check("TG_ADMIN_IDS oncelikli", isAdmin("888") && !isAdmin("777"), adminIds().join(","));
delete process.env.TG_ADMIN_IDS;

/* ---------------------------------------------------------------- oturum --- */

let token = "";
{
  token = await issueSession({ id: "888", name: "Ada L", username: "ada" });
  const session = await readSession(token);
  check("oturum okundu", session?.sub === "888" && session?.nm === "Ada L", JSON.stringify(session));

  check("bos token reddedildi", (await readSession(undefined)) === null);
  check("bozuk token reddedildi", (await readSession("abc.def")) === null);

  // Govde degistirilip imza korunursa gecmemeli.
  const [body, sig] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), sub: "555" })
  ).toString("base64url");
  check("kurcalanmis govde reddedildi", (await readSession(`${forged}.${sig}`)) === null);

  // Beyaz liste daraltilinca elindeki cerez de gecersizlesmeli.
  process.env.ALLOWED_USER_IDS = "777";
  check("listeden cikarilan kullanici duser", (await readSession(token)) === null);
  process.env.ALLOWED_USER_IDS = "777, 888";

  // Suresi dolmus oturum.
  process.env.SESSION_TTL_HOURS = "-1";
  const expired = await issueSession({ id: "888", name: "Ada", username: "" });
  check("suresi dolmus oturum reddedildi", (await readSession(expired)) === null);
  process.env.SESSION_TTL_HOURS = "1";
}

/* ------------------------------------------------------------------ log --- */

{
  const req = new Request("https://site.example/api/log", {
    headers: {
      "x-forwarded-for": "203.0.113.9, 70.41.3.18",
      "x-vercel-ip-country": "TR",
      "x-vercel-ip-city": "Istanbul",
      "user-agent": "Mozilla/5.0 Test",
      referer: "https://site.example/",
    },
  });
  const facts = requestFacts(req);
  check("ilk x-forwarded-for adresi alindi", facts.ip === "203.0.113.9", facts.ip);
  check("ulke ve sehir okundu", facts.country === "TR" && facts.city === "Istanbul");

  process.env.TG_LOG_CHAT_ID = "-1001234567890";
  let sent = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent = { url: String(url), body: JSON.parse(init.body) };
    return new Response("{}", { status: 200 });
  };
  await sendLog({
    action: "download",
    actor: { id: "888", username: "ada", name: "Ada L" },
    request: req,
    detail: { dosya: "x.png", "kotu <b>alan</b>": "<script>" },
  });
  globalThis.fetch = realFetch;

  check("telegram sendMessage cagrildi", sent?.url.includes("/sendMessage"), sent?.url);
  check("dogru kanala gitti", sent?.body.chat_id === "-1001234567890");
  check("kullanici satiri var", sent?.body.text.includes("Ada L (@ada)"));
  check("ip satiri var", sent?.body.text.includes("203.0.113.9"));
  check("detay satiri var", sent?.body.text.includes("dosya"));
  check("html kacisi yapildi", sent?.body.text.includes("&lt;script&gt;") && !sent?.body.text.includes("<script>"));

  // Kanal tanimli degilse hic istek atilmamali.
  delete process.env.TG_LOG_CHAT_ID;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}");
  };
  await sendLog({ action: "open", request: req });
  globalThis.fetch = realFetch;
  check("kanal yoksa istek atilmadi", !called);
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  ${r.extra}`}`);
}
console.log(`\n${results.length - failed}/${results.length} gecti`);
process.exit(failed ? 1 : 0);
