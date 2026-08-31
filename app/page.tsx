"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InputPanel from "@/components/InputPanel";
import PreviewCard, { type PreviewHandle } from "@/components/PreviewCard";
import type { GeneratorConfig, TemplateMeta } from "@/lib/types";
import { buildVariants, groupByStep } from "@/lib/variants";
import { listScope, renderTemplate, variantScope } from "@/lib/template";
import { captureFrame, nextFrame } from "@/lib/stage";
import { downloadDataUrl, downloadZip, copyToClipboard, type ImageFormat } from "@/lib/export";
import { DEFAULT_API_BASE } from "@/lib/quotes";
import { fetchLogoDataUrl } from "@/lib/logos";
import { slug } from "@/lib/format";

const STORAGE_KEY = "kg-config-v1";

const DEFAULT_CONFIG: GeneratorConfig = {
  holdings: [
    { id: "h1", code: "TUPRS", name: "Tüpraş", price: 172.4, baseCost: 150 },
    { id: "h2", code: "THYAO", name: "Türk Hava Yolları", price: 298.75, baseCost: 268 },
  ],
  baseLot: 100,
  lotStep: 50,
  lotCount: 4,
  baseCost: 150.0,
  costStep: 2.5,
  costCount: 4,
  costStepMode: "absolute",
  mode: "paired",
  currency: "TRY",
  brand: "Portföyüm",
  subtitle: "",
  dateISO: new Date().toISOString().slice(0, 10),
  cashBalance: 0,
  accountNo: "",
};

interface Item {
  id: string;
  html: string;
  label: string;
  filename: string;
}

export default function Page() {
  const [cfg, setCfg] = useState<GeneratorConfig>(DEFAULT_CONFIG);
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [templateHtml, setTemplateHtml] = useState<string>("");
  const [templateError, setTemplateError] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ImageFormat>("png");
  const [pixelRatio, setPixelRatio] = useState(2);
  const [boxWidth, setBoxWidth] = useState(260);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const handles = useRef(new Map<string, PreviewHandle>());
  // Logosu denenmis kodlar - basarisiz olanlari tekrar tekrar istemeyelim.
  const triedLogos = useRef(new Set<string>());

  /* ---------- kalici ayarlar ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.cfg) setCfg({ ...DEFAULT_CONFIG, ...saved.cfg });
      if (saved.apiBase) setApiBase(saved.apiBase);
      if (saved.templateId) setTemplateId(saved.templateId);
      if (saved.format) setFormat(saved.format);
      if (saved.pixelRatio) setPixelRatio(saved.pixelRatio);
    } catch {
      /* bozuk kayit varsa varsayilanlarla devam */
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ cfg, apiBase, templateId, format, pixelRatio })
        );
      } catch {
        /* kota dolu olabilir, kritik degil */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [cfg, apiBase, templateId, format, pixelRatio]);

  /* ---------- logolar (otomatik) ---------- */
  // Kod girilen ama logosu olmayan hisseler icin Matriks logosunu kendiliginden
  // ceker; kullanicinin ayrica butona basmasi gerekmez.
  useEffect(() => {
    const missing = cfg.holdings.filter(
      (h) => h.code.trim() && !h.logo && !triedLogos.current.has(h.code.trim().toUpperCase())
    );
    if (missing.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const found = await Promise.all(
        missing.map(async (h) => {
          const code = h.code.trim().toUpperCase();
          triedLogos.current.add(code);
          return { id: h.id, dataUrl: await fetchLogoDataUrl(code) };
        })
      );
      if (cancelled) return;
      const hits = found.filter((f) => f.dataUrl);
      if (hits.length === 0) return;
      setCfg((prev) => ({
        ...prev,
        holdings: prev.holdings.map((h) => {
          const hit = hits.find((f) => f.id === h.id);
          return hit && !h.logo ? { ...h, logo: hit.dataUrl ?? undefined } : h;
        }),
      }));
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cfg.holdings]);

  /* ---------- sablon listesi ---------- */
  useEffect(() => {
    fetch("templates/manifest.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        const list: TemplateMeta[] = json.templates ?? [];
        setTemplates(list);
        setTemplateId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? ""));
      })
      .catch(() => setTemplateError("templates/manifest.json okunamadı."));
  }, []);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  useEffect(() => {
    if (!template) return;
    setTemplateError("");
    fetch(`templates/${template.file}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(setTemplateHtml)
      .catch(() => setTemplateError(`${template.file} yüklenemedi.`));
  }, [template]);

  /* ---------- veri -> gorseller ---------- */
  const variants = useMemo(() => buildVariants(cfg), [cfg]);

  const items: Item[] = useMemo(() => {
    if (!template || !templateHtml) return [];

    // Portfoy ekranlari: her lot/maliyet adimi icin bir gorsel,
    // icinde o adimdaki butun hisseler.
    if (template.kind === "list") {
      return groupByStep(variants).map((group, i) => ({
        id: `step-${i}`,
        html: renderTemplate(templateHtml, listScope(group, cfg, i)),
        label: `Adım ${i + 1} · ${group.length} pozisyon · ${group[0].lot} lot`,
        filename: `${slug(cfg.brand || "portfoy")}-adim${i + 1}-${slug(template.id)}`,
      }));
    }

    return variants.map((v) => ({
      id: v.id,
      html: renderTemplate(templateHtml, variantScope(v, cfg, variants.length)),
      label: `${v.code} · ${v.lot} lot · ${v.cost.toFixed(2)}`,
      filename: `${slug(v.code)}-${v.lot}lot-${slug(v.cost.toFixed(2))}-${slug(template.id)}`,
    }));
  }, [template, templateHtml, variants, cfg]);

  // secim listesini uretilen gorsellerle senkron tut
  useEffect(() => {
    setSelected(new Set(items.map((i) => i.id)));
  }, [items]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ---------- disari aktarma ---------- */
  const capture = useCallback(
    async (id: string): Promise<string | null> => {
      const handle = handles.current.get(id);
      const iframe = handle?.iframe();
      if (!template || !handle || !iframe) return null;
      await nextFrame();
      return captureFrame(iframe, {
        width: template.width,
        height: handle.height(),
        pixelRatio,
        format,
      });
    },
    [template, pixelRatio, format]
  );

  async function downloadOne(item: Item) {
    setBusyId(item.id);
    setStatus("");
    try {
      const dataUrl = await capture(item.id);
      if (!dataUrl) throw new Error("Görsel oluşturulamadı");
      downloadDataUrl(dataUrl, `${item.filename}.${format}`);
      setStatus(`${item.filename}.${format} indirildi.`);
    } catch (err) {
      setStatus(err instanceof Error ? `Hata: ${err.message}` : "Bilinmeyen hata");
    } finally {
      setBusyId("");
    }
  }

  async function copyOne(item: Item) {
    setBusyId(item.id);
    try {
      const dataUrl = await capture(item.id);
      if (!dataUrl) throw new Error("Görsel oluşturulamadı");
      const ok = await copyToClipboard(dataUrl);
      setStatus(ok ? "Panoya kopyalandı." : "Tarayıcı panoya görsel kopyalamayı desteklemiyor.");
    } catch (err) {
      setStatus(err instanceof Error ? `Hata: ${err.message}` : "Bilinmeyen hata");
    } finally {
      setBusyId("");
    }
  }

  async function downloadSelected() {
    const chosen = items.filter((i) => selected.has(i.id));
    if (chosen.length === 0) {
      setStatus("Önce en az bir görsel seçin.");
      return;
    }
    setExporting(true);
    setStatus(`0 / ${chosen.length} hazırlanıyor…`);
    try {
      const entries: Array<{ filename: string; dataUrl: string }> = [];
      for (let i = 0; i < chosen.length; i++) {
        const item = chosen[i];
        const dataUrl = await capture(item.id);
        if (dataUrl) entries.push({ filename: `${item.filename}.${format}`, dataUrl });
        setStatus(`${i + 1} / ${chosen.length} hazırlanıyor…`);
      }
      if (entries.length === 0) throw new Error("Hiçbir görsel oluşturulamadı");
      if (entries.length === 1) {
        downloadDataUrl(entries[0].dataUrl, entries[0].filename);
        setStatus(`${entries[0].filename} indirildi.`);
      } else {
        await downloadZip(entries, `${slug(cfg.brand || "kar-gorseli")}-${entries.length}-gorsel.zip`);
        setStatus(`${entries.length} görsel ZIP olarak indirildi.`);
      }
    } catch (err) {
      setStatus(err instanceof Error ? `Hata: ${err.message}` : "Bilinmeyen hata");
    } finally {
      setExporting(false);
    }
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="min-h-screen">
      {/* ---- ust bar ---- */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgba(11,12,15,.92)] backdrop-blur px-5 py-3 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-[15px] font-semibold leading-tight">Kâr Görseli Üretici</h1>
          <p className="text-[11px] text-[var(--muted)]">
            {items.length} görsel · {template?.name ?? "şablon seçilmedi"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select
            className="field w-auto"
            value={format}
            onChange={(e) => setFormat(e.target.value as ImageFormat)}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
          <select
            className="field w-auto"
            value={pixelRatio}
            onChange={(e) => setPixelRatio(Number(e.target.value))}
            title="Çıktı çözünürlüğü"
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={3}>3x</option>
          </select>
          <button className="btn" onClick={() => setSelected(new Set(allSelected ? [] : items.map((i) => i.id)))}>
            {allSelected ? "Seçimi kaldır" : "Tümünü seç"}
          </button>
          <button className="btn btn-primary" onClick={downloadSelected} disabled={exporting}>
            {exporting ? "Hazırlanıyor…" : `Seçilenleri indir (${selected.size})`}
          </button>
        </div>
      </header>

      {status && (
        <div className="px-5 py-2 text-[12px] text-[var(--muted)] border-b border-[var(--line)] bg-[#0e1014]">
          {status}
        </div>
      )}

      <div className="flex items-start gap-5 p-5">
        {/* ---- sol: form ---- */}
        <aside className="w-[360px] shrink-0 sticky top-[68px] max-h-[calc(100vh-88px)] overflow-y-auto scroll-thin pr-1">
          <InputPanel
            cfg={cfg}
            onChange={setCfg}
            apiBase={apiBase}
            onApiBaseChange={setApiBase}
            variantCount={variants.length}
          />
        </aside>

        {/* ---- sag: sablon + onizleme ---- */}
        <main className="flex-1 min-w-0 space-y-4">
          <section className="panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Şablon</h2>
              <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                <span>Önizleme boyutu</span>
                <input
                  type="range"
                  min={180}
                  max={420}
                  step={20}
                  value={boxWidth}
                  onChange={(e) => setBoxWidth(Number(e.target.value))}
                  className="accent-[var(--accent)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  className="chip"
                  data-active={t.id === templateId}
                  onClick={() => setTemplateId(t.id)}
                >
                  <div className="text-[12.5px] font-semibold">{t.name}</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-1">
                    {t.width}×{t.height}
                    {t.kind === "list" ? " · liste" : ""}
                  </div>
                </button>
              ))}
            </div>
            {templateError && <p className="text-[12px] text-red-400 mt-3">{templateError}</p>}
          </section>

          {template && items.length > 0 ? (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${boxWidth + 26}px, 1fr))` }}
            >
              {items.map((item) => (
                <PreviewCard
                  key={`${template.id}-${item.id}`}
                  ref={(h) => {
                    if (h) handles.current.set(item.id, h);
                    else handles.current.delete(item.id);
                  }}
                  html={item.html}
                  template={template}
                  boxWidth={boxWidth}
                  label={item.label}
                  selected={selected.has(item.id)}
                  onToggle={() => toggle(item.id)}
                  busy={busyId === item.id}
                  actions={
                    <div className="flex gap-1">
                      <button
                        className="btn btn-sm"
                        onClick={() => copyOne(item)}
                        disabled={Boolean(busyId)}
                        title="Panoya kopyala"
                      >
                        Kopyala
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => downloadOne(item)}
                        disabled={Boolean(busyId)}
                      >
                        İndir
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="panel p-10 text-center text-[13px] text-[var(--muted)]">
              Hisse kodu ve fiyat girdiğinizde görseller burada oluşur.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
