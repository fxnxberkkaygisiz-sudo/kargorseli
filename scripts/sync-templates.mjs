#!/usr/bin/env node
/**
 * public/templates/ klasorunu tarar ve manifest.json'i gunceller.
 *  - Mevcut kayitlarin adi/boyutu korunur.
 *  - Yeni .html dosyalari otomatik eklenir; genislik/yukseklik ve kind
 *    dosyanin icindeki ipuclarindan tahmin edilir.
 *
 * Kullanim: npm run sync
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "public", "templates");
const MANIFEST = join(DIR, "manifest.json");

/** Ilk CSS kuralindan width/height okumaya calis. */
function sniffSize(html) {
  const w = html.match(/width:\s*(\d+)px/);
  const h = html.match(/height:\s*(\d+)px/);
  return {
    width: w ? Number(w[1]) : 1080,
    height: h ? Number(h[1]) : 1080,
  };
}

function sniffKind(html) {
  return /\{\{#rows\}\}/.test(html) ? "list" : "single";
}

function titleize(id) {
  return id
    .replace(/^\d+[-_]?/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const files = (await readdir(DIR))
  .filter((f) => f.toLowerCase().endsWith(".html"))
  .sort();

let existing = [];
try {
  existing = JSON.parse(await readFile(MANIFEST, "utf8")).templates ?? [];
} catch {
  existing = [];
}
const byFile = new Map(existing.map((t) => [t.file, t]));

const templates = [];
const added = [];

for (const file of files) {
  const prev = byFile.get(file);
  if (prev) {
    templates.push(prev);
    continue;
  }
  const html = await readFile(join(DIR, file), "utf8");
  const id = basename(file, ".html");
  const { width, height } = sniffSize(html);
  const entry = {
    id,
    name: titleize(id),
    file,
    kind: sniffKind(html),
    width,
    height,
    description: "",
  };
  templates.push(entry);
  added.push(entry);
}

const removed = existing.filter((t) => !files.includes(t.file)).map((t) => t.file);

await writeFile(MANIFEST, `${JSON.stringify({ templates }, null, 2)}\n`, "utf8");

console.log(`manifest.json guncellendi -> ${templates.length} sablon`);
if (added.length) {
  for (const a of added) {
    console.log(`  + ${a.file}  (${a.kind}, ${a.width}x${a.height})  ad: "${a.name}"`);
  }
  console.log("  Adlari/boyutlari manifest.json icinden duzenleyebilirsiniz.");
}
if (removed.length) console.log(`  - kaldirildi: ${removed.join(", ")}`);
