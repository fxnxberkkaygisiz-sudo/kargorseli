import type { Holding } from "./types";

export interface QuoteResult {
  code: string;
  ok: boolean;
  price?: number;
  name?: string;
  logo?: string;
  dailyChangePercent?: number;
  error?: string;
}

export const DEFAULT_API_BASE = "http://192.168.8.8:5000";

/**
 * Mevcut BIST API'nizden fiyat ceker: {base}/api/sorgu/bist/{KOD}
 * API kapali/erisilemez ise hata doner; fiyatlar elle de girilebilir.
 */
export async function fetchQuote(base: string, code: string): Promise<QuoteResult> {
  const symbol = code.trim().toUpperCase();
  if (!symbol) return { code: symbol, ok: false, error: "Kod bos" };

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/sorgu/bist/${symbol}`, {
      cache: "no-store",
    });
    if (!res.ok) return { code: symbol, ok: false, error: `HTTP ${res.status}` };

    const json = await res.json();
    if (!json?.success || !json?.data) {
      return { code: symbol, ok: false, error: "Gecerli veri yok" };
    }

    const d = json.data;
    return {
      code: symbol,
      ok: true,
      price: Number(d.last_price) || 0,
      name: d.name || symbol,
      logo: d.logo_url || undefined,
      dailyChangePercent: Number(d.daily_change_percent) || 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Baglanti hatasi";
    return { code: symbol, ok: false, error: message };
  }
}

export async function fetchQuotes(base: string, holdings: Holding[]): Promise<QuoteResult[]> {
  return Promise.all(holdings.map((h) => fetchQuote(base, h.code)));
}
