// Tek sunucuda iki taklit:
//   /bot<token>/<method>  -> Telegram Bot API (mesajlari konsola basar)
//   /kv                   -> Upstash Redis REST (bellekte hash)
//   /_sign?id=            -> gecerli imzali giris payload'i uretir
//   /_calls /_dump /_reset -> gonderilen cagrilar, depo icerigi, sifirlama
import { createServer } from "node:http";

const BOT_TOKEN = "123456:TEST-TOKEN";
const enc = new TextEncoder();
const hashes = new Map(); // key -> Map(field -> value)
const strings = new Map(); // key -> value (TTL onemsenmiyor)
const sentCalls = [];

async function sign(data) {
  const s = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join("\n");
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(BOT_TOKEN));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function redis(args) {
  const [cmd, key, ...rest] = args;
  const map = hashes.get(key) ?? new Map();
  switch (String(cmd).toUpperCase()) {
    case "HSET":
      hashes.set(key, map);
      map.set(String(rest[0]), String(rest[1]));
      return 1;
    case "HDEL":
      return map.delete(String(rest[0])) ? 1 : 0;
    case "HGET":
      return map.get(String(rest[0])) ?? null;
    case "HEXISTS":
      return map.has(String(rest[0])) ? 1 : 0;
    case "HKEYS":
      return [...map.keys()];
    case "HGETALL":
      return [...map.entries()].flat();
    case "SET":
      strings.set(key, String(rest[0]));
      return "OK";
    case "GET":
      return strings.get(key) ?? null;
    case "DEL":
      return strings.delete(key) || hashes.delete(key) ? 1 : 0;
    default:
      return null;
  }
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  const json = (data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(data));
  };

  if (req.url.startsWith("/_sign")) {
    const u = new URL(`http://x${req.url}`);
    const data = {
      id: Number(u.searchParams.get("id") || 777),
      first_name: u.searchParams.get("ad") || "Test",
      username: u.searchParams.get("kullanici") || "testuser",
      auth_date: Math.floor(Date.now() / 1000),
    };
    return json({ ...data, hash: await sign(data) });
  }

  if (req.url.startsWith("/_calls")) return json(sentCalls);
  if (req.url.startsWith("/_reset")) {
    sentCalls.length = 0;
    return json({ ok: true });
  }
  if (req.url.startsWith("/_dump")) {
    return json({
      ...Object.fromEntries([...hashes].map(([k, v]) => [k, Object.fromEntries(v)])),
      ...Object.fromEntries(strings),
    });
  }

  if (req.url.startsWith("/kv")) {
    return json({ result: redis(JSON.parse(raw)) });
  }

  if (req.url.startsWith("/bot")) {
    const method = req.url.split("/").pop();
    const body = raw ? JSON.parse(raw) : {};
    sentCalls.push({ method, body });
    if (method === "sendMessage") {
      console.log(`\n===== ${method} -> ${body.chat_id} =====`);
      console.log(body.text);
      if (body.reply_markup?.inline_keyboard?.length) {
        console.log("[tuslar]", JSON.stringify(body.reply_markup.inline_keyboard));
      }
      console.log("===== /son =====\n");
    } else {
      console.log(`[${method}]`, JSON.stringify(body).slice(0, 200));
    }
    return json({ ok: true, result: { message_id: sentCalls.length } });
  }

  json({ ok: false }, 404);
}).listen(8788, () => console.log("taklit servisler -> http://localhost:8788"));
