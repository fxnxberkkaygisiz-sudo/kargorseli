"use client";

import { useState } from "react";
import type { Currency, GeneratorConfig, Holding, StepMode, VariantMode } from "@/lib/types";
import { fetchQuotes } from "@/lib/quotes";
import { fetchLogos } from "@/lib/logos";

interface Props {
  cfg: GeneratorConfig;
  onChange: (next: GeneratorConfig) => void;
  apiBase: string;
  onApiBaseChange: (value: string) => void;
  variantCount: number;
}

function newHolding(): Holding {
  return { id: `h${Date.now()}${Math.floor(Math.random() * 1000)}`, code: "", name: "", price: 0 };
}

export default function InputPanel({
  cfg,
  onChange,
  apiBase,
  onApiBaseChange,
  variantCount,
}: Props) {
  const [fetching, setFetching] = useState(false);
  const [apiMsg, setApiMsg] = useState<string>("");
  const [showApi, setShowApi] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState<string>("");

  /** Matriks logo servisinden logolari cekip data URI olarak saklar. */
  async function pullLogos() {
    setLogoBusy(true);
    setLogoMsg("");
    try {
      const codes = cfg.holdings.map((h) => h.code);
      const results = await fetchLogos(codes);
      onChange({
        ...cfg,
        holdings: cfg.holdings.map((h, i) =>
          results[i]?.ok ? { ...h, logo: results[i].dataUrl } : h
        ),
      });
      const failed = results.filter((r) => !r.ok).map((r) => r.code || "?");
      setLogoMsg(
        failed.length === 0
          ? `${results.length} logo yüklendi.`
          : `${results.length - failed.length} logo yüklendi, bulunamayan: ${failed.join(", ")}`
      );
    } finally {
      setLogoBusy(false);
    }
  }

  const set = <K extends keyof GeneratorConfig>(key: K, value: GeneratorConfig[K]) =>
    onChange({ ...cfg, [key]: value });

  const setHolding = (id: string, patch: Partial<Holding>) =>
    onChange({
      ...cfg,
      holdings: cfg.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    });

  async function pullQuotes() {
    setFetching(true);
    setApiMsg("");
    try {
      const results = await fetchQuotes(apiBase, cfg.holdings);
      const okCount = results.filter((r) => r.ok).length;
      onChange({
        ...cfg,
        holdings: cfg.holdings.map((h, i) => {
          const r = results[i];
          if (!r?.ok) return h;
          return {
            ...h,
            name: r.name ?? h.name,
            price: r.price ?? h.price,
            logo: r.logo ?? h.logo,
            dailyChangePercent: r.dailyChangePercent,
          };
        }),
      });
      const failed = results.filter((r) => !r.ok);
      setApiMsg(
        failed.length === 0
          ? `${okCount} fiyat güncellendi.`
          : `${okCount} başarılı, ${failed.length} başarısız: ${failed
              .map((f) => `${f.code} (${f.error})`)
              .join(", ")}`
      );
    } finally {
      setFetching(false);
    }
  }

  const paired = cfg.mode === "paired";

  return (
    <div className="space-y-4">
      {/* ---- Başlık bilgileri ---- */}
      <section className="panel p-4 space-y-3">
        <h2 className="text-sm font-semibold">Görsel başlığı</h2>
        <div>
          <label className="lbl">Başlık / rumuz</label>
          <input
            className="field"
            value={cfg.brand}
            onChange={(e) => set("brand", e.target.value)}
            placeholder="Portföy"
          />
        </div>
        <div>
          <label className="lbl">Alt başlık (opsiyonel)</label>
          <input
            className="field"
            value={cfg.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
            placeholder="Uzun vadeli pozisyon"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Para birimi</label>
            <select
              className="field"
              value={cfg.currency}
              onChange={(e) => set("currency", e.target.value as Currency)}
            >
              <option value="TRY">TRY (₺)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
          <div>
            <label className="lbl">Tarih</label>
            <input
              type="date"
              className="field"
              value={cfg.dateISO.slice(0, 10)}
              onChange={(e) => set("dateISO", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Kullanılabilir bakiye</label>
            <input
              className="field"
              type="number"
              step="0.01"
              value={cfg.cashBalance || ""}
              placeholder="0"
              onChange={(e) => set("cashBalance", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="lbl">Hesap no (opsiyonel)</label>
            <input
              className="field"
              value={cfg.accountNo}
              placeholder="—"
              onChange={(e) => set("accountNo", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* ---- Hisseler ---- */}
      <section className="panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Hisseler</h2>
          <button
            className="btn btn-sm"
            onClick={() => onChange({ ...cfg, holdings: [...cfg.holdings, newHolding()] })}
          >
            + Ekle
          </button>
        </div>

        <div className="grid grid-cols-[72px_1fr_78px_78px_26px] gap-2 text-[10px] text-[var(--muted)] px-1">
          <span>Kod</span>
          <span>Ad</span>
          <span>Fiyat</span>
          <span>Maliyet</span>
          <span />
        </div>

        <div className="space-y-2">
          {cfg.holdings.map((h) => (
            <div key={h.id} className="grid grid-cols-[72px_1fr_78px_78px_26px] gap-2 items-center">
              <input
                className="field"
                value={h.code}
                placeholder="KOD"
                onChange={(e) => setHolding(h.id, { code: e.target.value.toUpperCase() })}
              />
              <input
                className="field"
                value={h.name}
                placeholder="Şirket adı"
                onChange={(e) => setHolding(h.id, { name: e.target.value })}
              />
              <input
                className="field"
                type="number"
                step="0.01"
                value={h.price || ""}
                placeholder="Güncel"
                onChange={(e) => setHolding(h.id, { price: Number(e.target.value) })}
              />
              <input
                className="field"
                type="number"
                step="0.01"
                value={h.baseCost || ""}
                placeholder="Genel"
                title="Bu hisseye özel base maliyet. Boş bırakılırsa aşağıdaki genel base maliyet kullanılır."
                onChange={(e) => setHolding(h.id, { baseCost: Number(e.target.value) })}
              />
              <button
                className="btn btn-sm px-0 text-[var(--muted)]"
                title="Kaldır"
                disabled={cfg.holdings.length <= 1}
                onClick={() =>
                  onChange({ ...cfg, holdings: cfg.holdings.filter((x) => x.id !== h.id) })
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <button className="btn btn-sm flex-1" onClick={pullLogos} disabled={logoBusy}>
            {logoBusy ? "Logolar çekiliyor…" : "Logoları çek"}
          </button>
          <button
            className="btn btn-sm flex-1"
            onClick={() =>
              onChange({ ...cfg, holdings: cfg.holdings.map((h) => ({ ...h, logo: undefined })) })
            }
          >
            Logoları temizle
          </button>
        </div>
        {logoMsg && <p className="text-[11px] text-[var(--muted)] leading-relaxed">{logoMsg}</p>}

        <div className="pt-1">
          <button
            className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() => setShowApi((v) => !v)}
          >
            {showApi ? "▾" : "▸"} Fiyatları API'den çek
          </button>
          {showApi && (
            <div className="mt-2 space-y-2">
              <input
                className="field"
                value={apiBase}
                onChange={(e) => onApiBaseChange(e.target.value)}
                placeholder="http://192.168.8.8:5000"
              />
              <button className="btn btn-sm w-full" onClick={pullQuotes} disabled={fetching}>
                {fetching ? "Çekiliyor…" : "Güncel fiyatları çek"}
              </button>
              {apiMsg && <p className="text-[11px] text-[var(--muted)] leading-relaxed">{apiMsg}</p>}
              <p className="text-[11px] text-[#5c6472] leading-relaxed">
                {"{base}/api/sorgu/bist/{KOD}"} uç noktasını kullanır. Erişilemezse fiyatları elle
                girebilirsiniz.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---- Varyasyonlar ---- */}
      <section className="panel p-4 space-y-3">
        <h2 className="text-sm font-semibold">Lot ve maliyet varyasyonları</h2>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="chip text-xs"
            data-active={paired}
            onClick={() => set("mode", "paired" as VariantMode)}
          >
            <div className="font-semibold">Eşleşmeli</div>
            <div className="text-[10.5px] text-[var(--muted)] mt-0.5">
              Lot ve maliyet birlikte ilerler
            </div>
          </button>
          <button
            className="chip text-xs"
            data-active={!paired}
            onClick={() => set("mode", "cross" as VariantMode)}
          >
            <div className="font-semibold">Çapraz</div>
            <div className="text-[10.5px] text-[var(--muted)] mt-0.5">
              Tüm lot × maliyet kombinasyonları
            </div>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Base lot</label>
            <input
              className="field"
              type="number"
              value={cfg.baseLot}
              onChange={(e) => set("baseLot", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="lbl">Lot adım</label>
            <input
              className="field"
              type="number"
              value={cfg.lotStep}
              onChange={(e) => set("lotStep", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Base maliyet</label>
            <input
              className="field"
              type="number"
              step="0.01"
              value={cfg.baseCost}
              onChange={(e) => set("baseCost", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="lbl">
              Maliyet adım ({cfg.costStepMode === "percent" ? "%" : "tutar"})
            </label>
            <div className="flex gap-2">
              <input
                className="field"
                type="number"
                step="0.01"
                value={cfg.costStep}
                onChange={(e) => set("costStep", Number(e.target.value))}
              />
              <button
                className="btn btn-sm"
                title="Adım tipini değiştir"
                onClick={() =>
                  set(
                    "costStepMode",
                    (cfg.costStepMode === "percent" ? "absolute" : "percent") as StepMode
                  )
                }
              >
                {cfg.costStepMode === "percent" ? "%" : "₺"}
              </button>
            </div>
          </div>
        </div>

        {paired ? (
          <div>
            <label className="lbl">Varyasyon adedi</label>
            <input
              className="field"
              type="number"
              min={1}
              value={cfg.lotCount}
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value));
                onChange({ ...cfg, lotCount: n, costCount: n });
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Lot adedi</label>
              <input
                className="field"
                type="number"
                min={1}
                value={cfg.lotCount}
                onChange={(e) => set("lotCount", Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div>
              <label className="lbl">Maliyet adedi</label>
              <input
                className="field"
                type="number"
                min={1}
                value={cfg.costCount}
                onChange={(e) => set("costCount", Math.max(1, Number(e.target.value)))}
              />
            </div>
          </div>
        )}

        <p className="text-[11px] text-[var(--muted)]">
          Toplam <b className="text-[var(--text)]">{variantCount}</b> varyasyon üretilecek.
        </p>
      </section>
    </div>
  );
}
