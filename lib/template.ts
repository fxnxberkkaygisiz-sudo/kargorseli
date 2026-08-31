import type { Currency, GeneratorConfig, Variant } from "./types";
import {
  compact,
  currencySymbol,
  formatDate,
  formatTime,
  money,
  num,
  signedMoney,
  signedPercent,
} from "./format";
import { sumVariants } from "./variants";

export interface Scope {
  values: Record<string, string>;
  flags: Record<string, boolean>;
  rows?: Scope[];
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/**
 * Yorum satirlarini temizler. Bir sablonun kendi aciklamasinda {{...}}
 * gecmesi motorun blok eslesmesini bozdugu icin, token taramasindan once
 * HTML yorumlari ve <style> icindeki CSS yorumlari atilir.
 */
function stripComments(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) =>
      block.replace(/\/\*[\s\S]*?\*\//g, "")
    );
}

/**
 * Mustache-lite sablon motoru.
 *   {{token}}            -> HTML-escape edilmis deger
 *   {{{token}}}          -> ham deger (URL, SVG vb.)
 *   {{#rows}}...{{/rows}}-> her pozisyon icin tekrar eder
 *   {{#profit}}...{{/profit}} / {{^profit}}...{{/profit}} -> kosullu blok
 */
export function renderTemplate(html: string, scope: Scope): string {
  let out = stripComments(html);

  // 1) rows dongusu
  out = out.replace(/\{\{#rows\}\}([\s\S]*?)\{\{\/rows\}\}/g, (_m, inner: string) =>
    (scope.rows ?? []).map((row) => renderTemplate(inner, row)).join("")
  );

  // 2) kosullu bloklar ({{#flag}} ve tersi {{^flag}})
  out = out.replace(
    /\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g,
    (_m, kind: string, name: string, inner: string) => {
      const on = Boolean(scope.flags[name]);
      const show = kind === "#" ? on : !on;
      return show ? inner : "";
    }
  );

  // 3) ham degerler
  out = out.replace(/\{\{\{(\w+)\}\}\}/g, (_m, key: string) => scope.values[key] ?? "");

  // 4) escape edilmis degerler
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    escapeHtml(scope.values[key] ?? "")
  );

  return out;
}

/** Satir/donut renkleri - dagilim gorsellerinde kullanilir. */
const PALETTE = [
  "#2563EB", "#0EA5E9", "#14B8A6", "#F59E0B", "#8B5CF6",
  "#EC4899", "#10B981", "#EF4444", "#6366F1", "#84CC16",
];

/** Kod'dan deterministik renk - ayni hisse her zaman ayni renkte. */
function colorFor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Girisden guncel fiyata giden, deterministik (rastgele olmayan) egri. */
function sparkline(cost: number, price: number, w = 200, h = 60): { path: string; area: string } {
  const n = 24;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ease = t * t * (3 - 2 * t); // smoothstep: giris -> guncel
    pts.push([t, cost + (price - cost) * ease]);
  }
  const vals = pts.map((p) => p[1]);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const pad = 6;
  const coords = pts.map(([t, v]) => {
    const x = pad + t * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as [number, number];
  });

  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const dx = (x1 - x0) / 2;
    d += ` C ${(x0 + dx).toFixed(1)} ${y0.toFixed(1)}, ${(x1 - dx).toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  const last = coords[coords.length - 1];
  return { path: d, area: `${d} L ${last[0].toFixed(1)} ${h} L ${coords[0][0].toFixed(1)} ${h} Z` };
}

/** "31.848,60" -> ["31.848", "60"] : kurusu soluk gostermek icin. */
function splitNum(formatted: string): [string, string] {
  const i = formatted.lastIndexOf(",");
  return i === -1 ? [formatted, "00"] : [formatted.slice(0, i), formatted.slice(i + 1)];
}

function trendValues(pnl: number, currency: Currency) {
  const profit = pnl >= 0;
  return {
    trend: profit ? "profit" : "loss",
    trendTr: profit ? "Kâr" : "Zarar",
    trendSign: profit ? "+" : "-",
    trendArrow: profit ? "▲" : "▼",
    trendColor: profit ? "#16A34A" : "#DC2626",
    trendColorDark: profit ? "#22C55E" : "#F05252",
    trendColorSoft: profit ? "rgba(22,163,74,.10)" : "rgba(220,38,38,.10)",
    trendBorder: profit ? "rgba(22,163,74,.30)" : "rgba(220,38,38,.30)",
    currency,
    symbol: currencySymbol(currency),
  };
}

function txId(index: number, dateISO: string): string {
  const d = dateISO ? new Date(dateISO) : new Date();
  const day = Number.isNaN(d.getTime()) ? new Date() : d;
  const stamp = `${String(day.getDate()).padStart(2, "0")}${String(day.getMonth() + 1).padStart(2, "0")}${day.getFullYear()}`;
  return `KG${stamp}${String(index + 1).padStart(4, "0")}`;
}

/** Config'den gelen, her sablonda ayni olan ortak degerler. */
function commonValues(cfg: GeneratorConfig, index: number) {
  return {
    brand: cfg.brand,
    subtitle: cfg.subtitle,
    accountNo: cfg.accountNo,
    date: formatDate(cfg.dateISO),
    time: formatTime(cfg.dateISO),
    datetime: `${formatDate(cfg.dateISO)} ${formatTime(cfg.dateISO)}`,
    txId: txId(index, cfg.dateISO),
    cash: money(cfg.cashBalance, cfg.currency),
    cashNum: num(cfg.cashBalance, 2),
  };
}

/** Gunluk degisim - yalnizca hisse icin gunluk yuzde girilmisse hesaplanir. */
function dailyOf(value: number, pct?: number) {
  if (pct == null) return { amount: 0, ok: false };
  const prev = value / (1 + pct / 100);
  return { amount: value - prev, ok: Number.isFinite(prev) };
}

/** Tek pozisyon icin token seti. */
export function variantScope(v: Variant, cfg: GeneratorConfig, total: number): Scope {
  const c = cfg.currency;
  const spark = sparkline(v.cost, v.price);
  const t = trendValues(v.pnl, c);
  const daily = dailyOf(v.value, v.dailyChangePercent);
  const shortName = v.name.length > 24 ? `${v.name.slice(0, 22)}…` : v.name;

  return {
    values: {
      ...t,
      ...commonValues(cfg, v.index),

      code: v.code,
      name: v.name,
      shortName,
      initial: v.code.charAt(0),
      logo: v.logo ?? "",
      rowColor: colorFor(v.code),

      lot: num(v.lot, v.lot % 1 === 0 ? 0 : 2),
      lotRaw: String(v.lot),
      cost: num(v.cost, 2),
      costMoney: money(v.cost, c),
      price: num(v.price, 2),
      priceMoney: money(v.price, c),

      investment: money(v.investment, c),
      investmentNum: num(v.investment, 2),
      investmentCompact: compact(v.investment),
      value: money(v.value, c),
      valueNum: num(v.value, 2),
      valueCompact: compact(v.value),
      valueInt: splitNum(num(v.value, 2))[0],
      valueDec: splitNum(num(v.value, 2))[1],

      pnl: signedMoney(v.pnl, c),
      pnlNum: num(Math.abs(v.pnl), 2),
      pnlSigned: `${v.pnl >= 0 ? "+" : "-"}${num(Math.abs(v.pnl), 2)}`,
      pnlAbs: money(Math.abs(v.pnl), c),
      pnlCompact: compact(Math.abs(v.pnl)),
      pnlInt: splitNum(num(Math.abs(v.pnl), 2))[0],
      pnlDec: splitNum(num(Math.abs(v.pnl), 2))[1],
      pnlPercent: signedPercent(v.pnlPercent),
      pnlPercentNum: num(Math.abs(v.pnlPercent), 2),

      dailyPercent: v.dailyChangePercent != null ? signedPercent(v.dailyChangePercent) : "",
      dailyPnl: daily.ok ? signedMoney(daily.amount, c) : "",
      dailyColor:
        v.dailyChangePercent != null && v.dailyChangePercent < 0 ? "#DC2626" : "#16A34A",

      sparkPath: spark.path,
      sparkArea: spark.area,

      index: String(v.index + 1),
      step: String(v.step + 1),
      total: String(total),
      // tek pozisyonda dagilim her zaman %100
      share: "100",
      sharePercent: "100,00",
      // CSS/SVG icin nokta ondalikli: width:{{shareCss}}% gibi kullanilir,
      // cunku "36,6" gibi virgullu deger gecersiz CSS uretir.
      shareCss: "100",
      donutDash: "100 0",
      donutOffset: "0",
    },
    flags: {
      profit: v.pnl >= 0,
      loss: v.pnl < 0,
      hasLogo: Boolean(v.logo),
      hasPriceChange: v.dailyChangePercent != null,
      hasSubtitle: Boolean(cfg.subtitle.trim()),
      hasAccountNo: Boolean(cfg.accountNo.trim()),
      hasCash: cfg.cashBalance > 0,
    },
  };
}

/**
 * Portfoy ekrani token seti: ayni lot/maliyet adimindaki tum hisseler.
 * Blok disindaki pnl/value/investment toplamlari verir.
 */
export function listScope(group: Variant[], cfg: GeneratorConfig, stepIndex: number): Scope {
  const c = cfg.currency;
  const totals = sumVariants(group);
  const t = trendValues(totals.pnl, c);
  const spark = sparkline(totals.investment, totals.value);
  const totalAssets = totals.value + cfg.cashBalance;

  const dailySum = group.reduce((acc, v) => acc + dailyOf(v.value, v.dailyChangePercent).amount, 0);
  const hasDaily = group.some((v) => v.dailyChangePercent != null);
  const dailyPct = totals.value - dailySum > 0 ? (dailySum / (totals.value - dailySum)) * 100 : 0;

  // dagilim: her satirin guncel deger icindeki payi (donut/bar icin)
  let cumulative = 0;
  const rows = group.map((v, i) => {
    const scope = variantScope(v, cfg, group.length);
    const share = totals.value > 0 ? (v.value / totals.value) * 100 : 0;
    scope.values.share = num(share, 1);
    scope.values.sharePercent = num(share, 2);
    scope.values.shareCss = share.toFixed(3);
    scope.values.rowColor = PALETTE[i % PALETTE.length];
    // pathLength="100" olan bir daire icin: yuzde = uzunluk
    scope.values.donutDash = `${share.toFixed(2)} ${(100 - share).toFixed(2)}`;
    scope.values.donutOffset = `${(-cumulative).toFixed(2)}`;
    scope.values.rowIndex = String(i + 1);
    cumulative += share;
    return scope;
  });

  const biggest = [...group].sort((a, b) => b.value - a.value)[0];

  return {
    values: {
      ...t,
      ...commonValues(cfg, stepIndex),

      investment: money(totals.investment, c),
      investmentNum: num(totals.investment, 2),
      investmentCompact: compact(totals.investment),
      value: money(totals.value, c),
      valueNum: num(totals.value, 2),
      valueCompact: compact(totals.value),
      totalAssets: money(totalAssets, c),
      totalAssetsNum: num(totalAssets, 2),
      totalAssetsInt: splitNum(num(totalAssets, 2))[0],
      totalAssetsDec: splitNum(num(totalAssets, 2))[1],
      valueInt: splitNum(num(totals.value, 2))[0],
      valueDec: splitNum(num(totals.value, 2))[1],

      pnl: signedMoney(totals.pnl, c),
      pnlNum: num(Math.abs(totals.pnl), 2),
      pnlSigned: `${totals.pnl >= 0 ? "+" : "-"}${num(Math.abs(totals.pnl), 2)}`,
      pnlAbs: money(Math.abs(totals.pnl), c),
      pnlCompact: compact(Math.abs(totals.pnl)),
      pnlInt: splitNum(num(Math.abs(totals.pnl), 2))[0],
      pnlDec: splitNum(num(Math.abs(totals.pnl), 2))[1],
      pnlPercent: signedPercent(totals.pnlPercent),
      pnlPercentNum: num(Math.abs(totals.pnlPercent), 2),

      dailyPnl: hasDaily ? signedMoney(dailySum, c) : "",
      dailyPercent: hasDaily ? signedPercent(dailyPct) : "",
      dailyColor: dailySum < 0 ? "#DC2626" : "#16A34A",

      rowCount: String(totals.count),
      topCode: biggest?.code ?? "",
      topShare: totals.value > 0 && biggest ? num((biggest.value / totals.value) * 100, 2) : "0,00",

      sparkPath: spark.path,
      sparkArea: spark.area,
      step: String(stepIndex + 1),
      index: String(stepIndex + 1),
    },
    flags: {
      profit: totals.pnl >= 0,
      loss: totals.pnl < 0,
      hasSubtitle: Boolean(cfg.subtitle.trim()),
      hasAccountNo: Boolean(cfg.accountNo.trim()),
      hasCash: cfg.cashBalance > 0,
      hasPriceChange: hasDaily,
      multiRow: group.length > 1,
    },
    rows,
  };
}
