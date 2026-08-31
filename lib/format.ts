import type { Currency } from "./types";

const SYMBOLS: Record<Currency, string> = { TRY: "₺", USD: "$", EUR: "€" };

export function currencySymbol(c: Currency): string {
  return SYMBOLS[c] ?? "₺";
}

/** 12345.678 -> "12.345,68" */
export function num(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "0,00";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 12345.678 -> "12.345,68 ₺" */
export function money(value: number, c: Currency, digits = 2): string {
  return `${num(value, digits)} ${currencySymbol(c)}`;
}

/** Isaretli: "+12.345,68 ₺" / "-1.200,00 ₺" */
export function signedMoney(value: number, c: Currency, digits = 2): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${num(Math.abs(value), digits)} ${currencySymbol(c)}`;
}

/** Isaretli yuzde: "+18,42%" */
export function signedPercent(value: number, digits = 2): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${num(Math.abs(value), digits)}%`;
}

/** Buyuk sayilari kisalt: 1.250.000 -> "1,25 Mn" */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${num(value / 1_000_000_000, 2)} Mr`;
  if (abs >= 1_000_000) return `${num(value / 1_000_000, 2)} Mn`;
  if (abs >= 1_000) return `${num(value / 1_000, 1)} B`;
  return num(value, 2);
}

export function formatDate(iso: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("tr-TR");
  return d.toLocaleDateString("tr-TR");
}

export function formatTime(iso: string): string {
  // Sadece tarih verildiyse (2026-08-31) saat bilgisi yoktur; o durumda
  // gecerli saati kullaniriz, aksi halde gorselde hep 00:00/03:00 cikar.
  const hasClock = Boolean(iso) && iso.includes("T");
  const d = hasClock ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) d.setTime(Date.now());
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/** Dosya adi icin guvenli hale getir. */
export function slug(value: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I",
    ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U",
  };
  return value
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => map[ch] ?? ch)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
