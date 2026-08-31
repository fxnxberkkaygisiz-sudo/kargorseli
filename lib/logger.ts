/**
 * Olay loglari - Worker uzerinden Telegram kanalina.
 *
 * IP, ulke ve tarayici bilgisini Worker kendisi ekliyor (istekten okuyor);
 * buradan sadece uygulamaya ozel ayrintilar gidiyor. Gonderim ates-unut:
 * log atilamadi diye kullanicinin isi durmaz.
 */

import { apiUrl, authEnabled } from "./auth";
import type { GeneratorConfig, TemplateMeta } from "./types";

export type LogAction =
  | "open"
  | "download"
  | "download_batch"
  | "copy"
  | "error"
  | "logout";

export type LogDetail = Record<string, string | number | boolean | undefined>;

export function logEvent(action: LogAction, detail?: LogDetail): void {
  if (!authEnabled) return;

  // Oturum cerezi httpOnly; ayni origin oldugu icin tarayici kendisi ekliyor.
  void fetch(apiUrl("/log"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, detail }),
    // Sekme kapanirken atilan loglar da (indirme sonrasi) yolda kalmasin.
    keepalive: true,
  }).catch(() => {
    /* log kaybi kullaniciyi ilgilendirmez */
  });
}

/** Her olaya eklenen portfoy ozeti - kanalda ne uretildigi anlasilsin. */
export function configDetail(cfg: GeneratorConfig, template: TemplateMeta | null): LogDetail {
  return {
    sablon: template ? `${template.name} (${template.id})` : "-",
    hisseler: cfg.holdings
      .filter((h) => h.code.trim())
      .map((h) => `${h.code.trim().toUpperCase()}@${h.price}`)
      .join(", "),
    baslik: cfg.brand,
    lot: `${cfg.baseLot} +${cfg.lotStep} x${cfg.lotCount}`,
    maliyet: `${cfg.baseCost} +${cfg.costStep}${cfg.costStepMode === "percent" ? "%" : ""} x${cfg.costCount}`,
    mod: cfg.mode === "paired" ? "eslesmeli" : "capraz",
    "para birimi": cfg.currency,
  };
}

export function logError(where: string, err: unknown, extra?: LogDetail): void {
  logEvent("error", {
    nerede: where,
    mesaj: err instanceof Error ? err.message : String(err),
    ...extra,
  });
}
