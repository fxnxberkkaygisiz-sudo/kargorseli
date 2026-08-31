"use client";

import { useState } from "react";
import type { Currency, GeneratorConfig, Holding, StepMode, VariantMode } from "@/lib/types";
import { fetchQuotes } from "@/lib/quotes";
import { fetchLogos } from "@/lib/logos";
import Section from "./Section";
import {
  IconAlert,
  IconImage,
  IconPlus,
  IconRefresh,
  IconSliders,
  IconTrash,
  IconWallet,
} from "./Icons";

interface Props {
  cfg: GeneratorConfig;
  onChange: (next: GeneratorConfig) => void;
  apiBase: string;
  onApiBaseChange: (value: string) => void;
  variantCount: number;
  imageCount: number;
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
  imageCount,
}: Props) {
  const [busy, setBusy] = useState<"" | "quotes" | "logos">("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const set = <K extends keyof GeneratorConfig>(key: K, value: GeneratorConfig[K]) =>
    onChange({ ...cfg, [key]: value });

  const setHolding = (id: string, patch: Partial<Holding>) =>
    onChange({
      ...cfg,
      holdings: cfg.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    });

  async function pullQuotes() {
    setBusy("quotes");
    setMsg(null);
    try {
      const results = await fetchQuotes(apiBase, cfg.holdings);
      onChange({
        ...cfg,
        holdings: cfg.holdings.map((h, i) => {
          const r = results[i];
          if (!r?.ok) return h;
          return {
            ...h,
            name: r.name ?? h.name,
            price: r.price ?? h.price,
            dailyChangePercent: r.dailyChangePercent,
          };
        }),
      });
      const failed = results.filter((r) => !r.ok);
      setMsg(
        failed.length === 0
          ? { kind: "ok", text: `${results.length} fiyat güncellendi.` }
          : {
              kind: "err",
              text: `${results.length - failed.length} başarılı · ${failed
                .map((f) => `${f.code} (${f.error})`)
                .join(", ")}`,
            }
      );
    } finally {
      setBusy("");
    }
  }

  async function pullLogos() {
    setBusy("logos");
    setMsg(null);
    try {
      const results = await fetchLogos(cfg.holdings.map((h) => h.code));
      onChange({
        ...cfg,
        holdings: cfg.holdings.map((h, i) =>
          results[i]?.ok ? { ...h, logo: results[i].dataUrl } : h
        ),
      });
      const failed = results.filter((r) => !r.ok).map((r) => r.code || "?");
      setMsg(
        failed.length === 0
          ? { kind: "ok", text: `${results.length} logo yüklendi.` }
          : { kind: "err", text: `Bulunamayan logo: ${failed.join(", ")}` }
      );
    } finally {
      setBusy("");
    }
  }

  const paired = cfg.mode === "paired";
  const validHoldings = cfg.holdings.filter((h) => h.code.trim()).length;

  return (
    <div className="space-y-2.5">
      {/* ---------------------------------------------------- hisseler ---- */}
      <Section
        title="Hisseler"
        icon={<IconWallet />}
        hint={`${validHoldings} hisse`}
      >
        <div className="space-y-2">
          {cfg.holdings.map((h) => (
            <div key={h.id} className="holding">
              <div className="flex gap-1.5 items-center">
                {h.logo ? (
                  <img className="holding-logo" src={h.logo} alt="" />
                ) : (
                  <span className="holding-logo holding-logo--empty">
                    {h.code.trim().charAt(0) || "?"}
                  </span>
                )}
                <input
                  className="field !h-8 !w-[76px] font-semibold tracking-wide"
                  value={h.code}
                  placeholder="KOD"
                  onChange={(e) => setHolding(h.id, { code: e.target.value.toUpperCase() })}
                />
                <input
                  className="field !h-8 flex-1 min-w-0 !text-[12px]"
                  value={h.name}
                  placeholder="Şirket adı"
                  onChange={(e) => setHolding(h.id, { name: e.target.value })}
                />
                <button
                  className="btn btn-icon btn-ghost !h-8"
                  title="Kaldır"
                  disabled={cfg.holdings.length <= 1}
                  onClick={() =>
                    onChange({ ...cfg, holdings: cfg.holdings.filter((x) => x.id !== h.id) })
                  }
                >
                  <IconTrash />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                <label className="holding-num">
                  <span>Güncel fiyat</span>
                  <input
                    className="field !h-8"
                    type="number"
                    step="0.01"
                    value={h.price || ""}
                    placeholder="0,00"
                    onChange={(e) => setHolding(h.id, { price: Number(e.target.value) })}
                  />
                </label>
                <label className="holding-num">
                  <span>Base maliyet</span>
                  <input
                    className="field !h-8"
                    type="number"
                    step="0.01"
                    value={h.baseCost || ""}
                    placeholder="genel"
                    title="Bu hisseye özel base maliyet. Boş bırakılırsa aşağıdaki genel base maliyet kullanılır."
                    onChange={(e) => setHolding(h.id, { baseCost: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn btn-sm w-full"
          onClick={() => onChange({ ...cfg, holdings: [...cfg.holdings, newHolding()] })}
        >
          <IconPlus /> Hisse ekle
        </button>

        <div className="divider" />

        <div className="flex gap-1.5">
          <button className="btn btn-sm flex-1" onClick={pullLogos} disabled={busy !== ""}>
            <IconImage /> {busy === "logos" ? "Çekiliyor…" : "Logolar"}
          </button>
          <button className="btn btn-sm flex-1" onClick={pullQuotes} disabled={busy !== ""}>
            <IconRefresh /> {busy === "quotes" ? "Çekiliyor…" : "Fiyatlar"}
          </button>
        </div>

        {msg && (
          <p
            className="text-[11px] leading-relaxed flex gap-1.5"
            style={{ color: msg.kind === "ok" ? "var(--ok)" : "var(--warn)" }}
          >
            <IconAlert size={13} className="shrink-0 mt-px" />
            <span>{msg.text}</span>
          </p>
        )}

        <details className="group">
          <summary className="text-[11px] text-[var(--text-3)] cursor-pointer hover:text-[var(--text-2)] list-none">
            Fiyat API adresi
          </summary>
          <input
            className="field mt-2 !text-[12px]"
            value={apiBase}
            onChange={(e) => onApiBaseChange(e.target.value)}
            placeholder="http://192.168.8.8:5000"
          />
          <p className="text-[10.5px] text-[var(--text-3)] mt-1.5 leading-relaxed">
            {"{base}/api/sorgu/bist/{KOD}"} uç noktası. Logolar Matriks servisinden otomatik
            gelir, bu adresten bağımsızdır.
          </p>
        </details>
      </Section>

      {/* ------------------------------------------------ varyasyonlar ---- */}
      <Section
        title="Lot ve maliyet"
        icon={<IconSliders />}
        hint={`${variantCount} pozisyon`}
      >
        <div className="seg">
          <button data-on={paired} onClick={() => set("mode", "paired" as VariantMode)}>
            Eşleşmeli
          </button>
          <button data-on={!paired} onClick={() => set("mode", "cross" as VariantMode)}>
            Çapraz
          </button>
        </div>
        <p className="text-[10.5px] text-[var(--text-3)] leading-relaxed -mt-1">
          {paired
            ? "Lot ve maliyet birlikte ilerler: 100/150 → 150/152,5 → 200/155"
            : "Tüm lot × maliyet kombinasyonları üretilir."}
        </p>

        <div className="grid grid-cols-2 gap-2.5">
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
            <label className="lbl">Maliyet adım</label>
            <div className="joined">
              <input
                className="field"
                type="number"
                step="0.01"
                value={cfg.costStep}
                onChange={(e) => set("costStep", Number(e.target.value))}
              />
              <button
                className="unit"
                title="Adım tipini değiştir (tutar / yüzde)"
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
          <div className="grid grid-cols-2 gap-2.5">
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

        <div className="flex items-center gap-2 pt-0.5">
          <span className="chip-tag">{variantCount} pozisyon</span>
          <span className="text-[var(--text-3)]">→</span>
          <span className="chip-tag" style={{ borderColor: "var(--accent)", color: "var(--text)" }}>
            {imageCount} görsel
          </span>
        </div>
      </Section>

      {/* ---------------------------------------------------- görünüm ---- */}
      <Section title="Görsel bilgileri" icon={<IconWallet />} defaultOpen={false}>
        <div>
          <label className="lbl">Başlık</label>
          <input
            className="field"
            value={cfg.brand}
            onChange={(e) => set("brand", e.target.value)}
            placeholder="Portföyüm"
          />
        </div>
        <div>
          <label className="lbl">Alt başlık</label>
          <input
            className="field"
            value={cfg.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
            placeholder="(opsiyonel)"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="lbl">Para birimi</label>
            <select
              className="field"
              value={cfg.currency}
              onChange={(e) => set("currency", e.target.value as Currency)}
            >
              <option value="TRY">TRY ₺</option>
              <option value="USD">USD $</option>
              <option value="EUR">EUR €</option>
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
          <div>
            <label className="lbl">Nakit bakiye</label>
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
            <label className="lbl">Hesap no</label>
            <input
              className="field"
              value={cfg.accountNo}
              placeholder="(opsiyonel)"
              onChange={(e) => set("accountNo", e.target.value)}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
