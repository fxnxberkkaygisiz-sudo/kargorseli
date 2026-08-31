/**
 * Bot ile yetkilendirme akisi - ucdan uca test.
 *
 * Calisan bir sunucu ve taklit servisler gerekir:
 *   1. cp .env.test.example .env.local
 *   2. npm run fake        (ayri terminal - sahte Telegram + Upstash)
 *   3. npm run dev -- -p 3111
 *   4. npm run test:bot
 *
 * Gercek Telegram/Upstash kullanilmaz; her sey localhost:8788 taklidine gider.
 */
const APP = "http://localhost:3111";
const SVC = "http://localhost:8788";
const SECRET = "test-webhook-secret";

const results = [];
const check = (name, cond, extra = "") => results.push({ name, ok: Boolean(cond), extra });

const signed = (id, ad = "Yeni", kullanici = "yenikullanici") =>
  fetch(`${SVC}/_sign?id=${id}&ad=${ad}&kullanici=${kullanici}`).then((r) => r.json());

const login = async (id, ad, kullanici) => {
  const res = await fetch(`${APP}/api/auth/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await signed(id, ad, kullanici)),
  });
  return { status: res.status, json: await res.json(), cookie: res.headers.get("set-cookie") };
};

const webhook = (update, secret = SECRET) =>
  fetch(`${APP}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(update),
  });

const calls = () => fetch(`${SVC}/_calls`).then((r) => r.json());
const dump = () => fetch(`${SVC}/_dump`).then((r) => r.json());
const reset = () => fetch(`${SVC}/_reset`);

const ADMIN = { id: 777, first_name: "Yonetici" };
const OUTSIDER = { id: 999, first_name: "Yabanci" };
const command = (text, from = ADMIN) => webhook({ message: { chat: { id: 777 }, from, text } });

/* 1. yetkisiz giris: reddedilir, kanala onay tuslariyla mesaj duser */
await reset();
{
  const res = await login(555, "Deneme", "denemeci");
  check("yetkisiz giris 403", res.status === 403, `-> ${res.status}`);
  check("kendi id'si geri dondu", res.json.userId === "555");

  const sent = await calls();
  const msg = sent.find((c) => c.method === "sendMessage");
  check("kanala giris denemesi dustu", msg?.body.text.includes("Giris reddedildi"));
  check(
    "onay tuslari eklendi",
    JSON.stringify(msg?.body.reply_markup).includes("onay:555"),
    JSON.stringify(msg?.body.reply_markup)
  );

  const store = await dump();
  check("bekleyen kayit saklandi", store["kg:pending"]?.["555"]?.includes("Deneme"), JSON.stringify(store["kg:pending"]));
}

/* 2. yetkisiz biri onay tusuna basarsa reddedilmeli */
await reset();
{
  await webhook({
    callback_query: { id: "cb1", from: OUTSIDER, data: "onay:555", message: { chat: { id: 777 }, message_id: 1 } },
  });
  const sent = await calls();
  const answer = sent.find((c) => c.method === "answerCallbackQuery");
  check("yabanci onaylayamaz", answer?.body.text.includes("yetkiniz yok"), answer?.body.text);
  const store = await dump();
  check("liste degismedi", !store["kg:allowed"]?.["555"]);
}

/* 3. yonetici onaylar */
await reset();
{
  await webhook({
    callback_query: { id: "cb2", from: ADMIN, data: "onay:555", message: { chat: { id: 777 }, message_id: 1 } },
  });
  const store = await dump();
  check("kullanici listeye eklendi", Boolean(store["kg:allowed"]?.["555"]), JSON.stringify(store["kg:allowed"]));
  check("ad korundu", store["kg:allowed"]?.["555"]?.includes("Deneme"));
  check("bekleyen kayit temizlendi", !store["kg:pending"]?.["555"]);

  const sent = await calls();
  check("tuslar kaldirildi", sent.some((c) => c.method === "editMessageReplyMarkup"));
  check("sonuc kanala yazildi", sent.some((c) => c.method === "sendMessage" && c.body.text.includes("onayladi")));
}

/* 4. artik girebiliyor */
let cookie = "";
{
  const res = await login(555, "Deneme", "denemeci");
  check("onaydan sonra giris 200", res.status === 200, `-> ${res.status}`);
  cookie = (res.cookie || "").split(";")[0];
  const me = await fetch(`${APP}/api/auth/me`, { headers: { cookie } });
  check("oturum gecerli", me.status === 200, `-> ${me.status}`);
}

/* 5. /liste komutu */
await reset();
{
  await command("/liste");
  const sent = await calls();
  const text = sent.find((c) => c.method === "sendMessage")?.body.text ?? "";
  check("liste cekirdegi gosteriyor", text.includes("777"));
  check("liste eklenenleri gosteriyor", text.includes("555") && text.includes("Deneme"), text.slice(0, 200));
}

/* 6. /ekle ve /sil komutlari */
await reset();
{
  await command("/ekle 4242");
  let store = await dump();
  check("/ekle calisti", Boolean(store["kg:allowed"]?.["4242"]));

  await command("/sil 4242");
  store = await dump();
  check("/sil calisti", !store["kg:allowed"]?.["4242"]);

  await command("/sil 777");
  const sent = await calls();
  const last = sent.filter((c) => c.method === "sendMessage").pop()?.body.text ?? "";
  check("cekirdek listedeki silinemez", last.includes("silinemez"), last.slice(0, 120));
}

/* 7. listeden cikarilinca acik oturum aninda duser */
await reset();
{
  const before = await fetch(`${APP}/api/auth/me`, { headers: { cookie } });
  check("cikarmadan once oturum ayakta", before.status === 200);

  await command("/sil 555");
  const after = await fetch(`${APP}/api/auth/me`, { headers: { cookie } });
  check("cikarildiktan sonra oturum dustu", after.status === 401, `-> ${after.status}`);

  const log = await fetch(`${APP}/api/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "download" }),
  });
  check("log da reddedildi", log.status === 401, `-> ${log.status}`);
}

/* 8. yanlis webhook sirri */
{
  const res = await webhook({ message: { chat: { id: 777 }, from: ADMIN, text: "/liste" } }, "yanlis");
  check("yanlis sir 401", res.status === 401, `-> ${res.status}`);
}

/* 9. /id herkese acik, /ekle degil */
await reset();
{
  await command("/id", OUTSIDER);
  await command("/ekle 1234", OUTSIDER);
  const sent = await calls().then((c) => c.filter((x) => x.method === "sendMessage").map((x) => x.body.text));
  check("/id kendi id'sini soyluyor", sent[0]?.includes("999"), sent[0]);
  check("yabanci /ekle kullanamaz", sent[1]?.includes("yetkiniz yok"), sent[1]);
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  ${r.extra}`}`);
}
console.log(`\n${results.length - failed}/${results.length} gecti`);
process.exit(failed ? 1 : 0);
