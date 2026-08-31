import type { GeneratorConfig, Variant } from "./types";

/** i. adimdaki maliyeti hesaplar (mutlak veya yuzdesel adim). */
function costAt(cfg: GeneratorConfig, i: number, base: number): number {
  if (cfg.costStepMode === "percent") {
    return base + base * (cfg.costStep / 100) * i;
  }
  return base + cfg.costStep * i;
}

function lotAt(cfg: GeneratorConfig, i: number): number {
  return cfg.baseLot + cfg.lotStep * i;
}

/** paired modunda tek bir sayac, cross modunda lot x maliyet kombinasyonlari. */
function stepPairs(cfg: GeneratorConfig, base: number): Array<{ lot: number; cost: number }> {
  const pairs: Array<{ lot: number; cost: number }> = [];

  if (cfg.mode === "paired") {
    const steps = Math.max(1, Math.max(cfg.lotCount, cfg.costCount));
    for (let i = 0; i < steps; i++) {
      pairs.push({ lot: lotAt(cfg, i), cost: costAt(cfg, i, base) });
    }
    return pairs;
  }

  const lots = Math.max(1, cfg.lotCount);
  const costs = Math.max(1, cfg.costCount);
  for (let li = 0; li < lots; li++) {
    for (let ci = 0; ci < costs; ci++) {
      pairs.push({ lot: lotAt(cfg, li), cost: costAt(cfg, ci, base) });
    }
  }
  return pairs;
}

export function buildVariants(cfg: GeneratorConfig): Variant[] {
  const out: Variant[] = [];
  let index = 0;

  for (const h of cfg.holdings) {
    if (!h.code.trim()) continue;

    // Hisseye ozel maliyet girilmisse onu, yoksa genel base maliyeti kullan.
    const pairs = stepPairs(cfg, h.baseCost && h.baseCost > 0 ? h.baseCost : cfg.baseCost);

    pairs.forEach(({ lot, cost }, step) => {
      const safeLot = Math.max(0, lot);
      const safeCost = Math.max(0, cost);
      const investment = safeLot * safeCost;
      const value = safeLot * h.price;
      const pnl = value - investment;
      const pnlPercent = investment > 0 ? (pnl / investment) * 100 : 0;

      out.push({
        id: `${h.id}-${step}`,
        index: index++,
        step,
        code: h.code.trim().toUpperCase(),
        name: h.name.trim() || h.code.trim().toUpperCase(),
        logo: h.logo,
        price: h.price,
        dailyChangePercent: h.dailyChangePercent,
        lot: safeLot,
        cost: safeCost,
        investment,
        value,
        pnl,
        pnlPercent,
      });
    });
  }

  return out;
}

/**
 * Portfoy ekranlari icin: ayni lot/maliyet adimindaki tum hisseleri gruplar.
 * 2 hisse x 4 adim -> 4 grup, her birinde 2 satir.
 */
export function groupByStep(variants: Variant[]): Variant[][] {
  const map = new Map<number, Variant[]>();
  for (const v of variants) {
    const bucket = map.get(v.step);
    if (bucket) bucket.push(v);
    else map.set(v.step, [v]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, rows]) => rows);
}

export interface VariantTotals {
  investment: number;
  value: number;
  pnl: number;
  pnlPercent: number;
  count: number;
}

export function sumVariants(variants: Variant[]): VariantTotals {
  const investment = variants.reduce((a, v) => a + v.investment, 0);
  const value = variants.reduce((a, v) => a + v.value, 0);
  const pnl = value - investment;
  return {
    investment,
    value,
    pnl,
    pnlPercent: investment > 0 ? (pnl / investment) * 100 : 0,
    count: variants.length,
  };
}
