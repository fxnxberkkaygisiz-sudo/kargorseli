#!/usr/bin/env node
/**
 * public/templates/ klasorunu tarar ve iki dosya uretir:
 *
 *  1. public/templates/manifest.json  - calisma aninda fetch ile okunur.
 *  2. lib/templates.generated.ts      - ayni icerigin JS'e gomulmus kopyasi.
 *
 * Ikinci dosya yedek: bazi statik hostinglerde public/ altindaki .html
 * dosyalari beklenmedik sekilde 404 donebiliyor. Uygulama once fetch dener
 * (boylece elle eklenen/duzenlenen sablonlar aninda gecerli olur), fetch
 * basarisiz olursa gomulu kopyaya duser ve arayuz her kosulda calisir.
 *
 * Kullanim: npm run sync   (npm run build oncesi otomatik calisir)
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "public", "templates");
const MANIFEST = join(DIR, "manifest.json");
const BUNDLE = join(HERE, "..", "lib", "templates.generated.ts");

/** Ilk CSS kuralindan width/height okumaya calis. */
function sniffSize(html) {
  const w = html.match(/width:\s*(\d+)px/);
  const h = html.match(/height:\s*(\d+)px/);
  return { width: w ? Number(w[1]) : 1080, height: h ? Number(h[1]) : 1080 };
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

const files = (await readdir(DIR)).filter((f) => f.toLowerCase().endsWith(".html")).sort();

let existing = [];
try {
  existing = JSON.parse(await readFile(MANIFEST, "utf8")).templates ?? [];
} catch {
  existing = [];
}
const byFile = new Map(existing.map((t) => [t.file, t]));

const templates = [];
const added = [];
const contents = {};

for (const file of files) {
  const html = await readFile(join(DIR, file), "utf8");
  contents[file] = html;

  const prev = byFile.get(file);
  if (prev) {
    templates.push(prev);
    continue;
  }
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

const bundle = `// BU DOSYA URETILMISTIR - elle duzenlemeyin.
// Kaynak: public/templates/  ·  Uretici: scripts/sync-templates.mjs
// "npm run sync" veya "npm run build" ile yeniden uretilir.
import type { TemplateMeta } from "./types";

export const BUNDLED_TEMPLATES: TemplateMeta[] = ${JSON.stringify(templates, null, 2)};

/** Sablon dosya adi -> ham HTML. fetch basarisiz olursa yedek kaynak. */
export const BUNDLED_HTML: Record<string, string> = ${JSON.stringify(contents, null, 2)};
`;
await writeFile(BUNDLE, bundle, "utf8");

const kb = Math.round(Buffer.byteLength(bundle, "utf8") / 1024);
console.log(`manifest.json         -> ${templates.length} sablon`);
console.log(`templates.generated.ts -> ${templates.length} sablon gomuldu (${kb} KB)`);
if (added.length) {
  for (const a of added) {
    console.log(`  + ${a.file}  (${a.kind}, ${a.width}x${a.height})  ad: "${a.name}"`);
  }
  console.log("  Adlari/boyutlari manifest.json icinden duzenleyebilirsiniz.");
}
if (removed.length) console.log(`  - kaldirildi: ${removed.join(", ")}`);
