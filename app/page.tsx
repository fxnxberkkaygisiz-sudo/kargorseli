"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InputPanel from "@/components/InputPanel";
import PreviewCard, { type PreviewHandle } from "@/components/PreviewCard";
import TemplateGallery from "@/components/TemplateGallery";
import { IconAlert, IconCheck, IconDownload, IconLayers } from "@/components/Icons";
import type { GeneratorConfig, TemplateMeta } from "@/lib/types";
import { buildVariants, groupByStep } from "@/lib/variants";
import { listScope, renderTemplate, variantScope } from "@/lib/template";
import { captureFrame, nextFrame } from "@/lib/stage";
import { downloadDataUrl, downloadZip, copyToClipboard, type ImageFormat } from "@/lib/export";
import { DEFAULT_API_BASE } from "@/lib/quotes";
import { fetchLogoDataUrl } from "@/lib/logos";
import { slug } from "@/lib/format";

const STORAGE_KEY = "kg-config-v2";

const DEFAULT_CONFIG: GeneratorConfig = {
  holdings: [
    { id: "h1", code: "TUPRS", name: "Tüpraş", price: 172.4, baseCost: 150 },
    { id: "h2", code: "THYAO", name: "Türk Hava Yolları", price: 298.75, baseCost: 268 },
  ],
  baseLot: 100,
  lotStep: 50,
  lotCount: 4,
  baseCost: 150,
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
  sublabel: string;
  filename: string;
}

/** Sablon yolu mutlak: alt yolda (GitHub Pages) da dogru cozulsun. */
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
const templateUrl = (file: string) => `${BASE}/templates/${file}`;

export default function Page() {
  const [cfg, setCfg] = useState<GeneratorConfig>(DEFAULT_CONFIG);
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateHtml, setTemplateHtml] = useState("");
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ImageFormat>("png");
  const [pixelRatio, setPixelRatio] = useState(2);
  const [boxWidth, setBoxWidth] = useState(250);
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "busy"; text: string } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [exporting, setExporting] = useState(false);

  const handles = useRef(new Map<string, PreviewHandle>());
  const triedLogos = useRef(new Set<string>());
  const templateCache = useRef(new Map<string, string>());

  /* ------------------------------------------------ kalici ayarlar ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.cfg) setCfg({ ...DEFAULT_CONFIG, ...s.cfg });
      if (s.apiBase) setApiBase(s.apiBase);
      if (s.templateId) setTemplateId(s.templateId);
      if (s.format) setFormat(s.format);
      if (s.pixelRatio) setPixelRatio(s.pixelRatio);
      if (s.boxWidth) setBoxWidth(s.boxWidth);
    } catch {
      /* bozuk kayit - varsayilanlarla devam */
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ cfg, apiBase, templateId, format, pixelRatio, boxWidth })
        );
      } catch {
        /* kota dolu olabilir */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [cfg, apiBase, templateId, format, pixelRatio, boxWidth]);

  /* ------------------------------------------- logolar (otomatik) ---- */
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

  /* -------------------------------------------------- sablon yukle ---- */
  const loadTemplate = useCallback(async (t: TemplateMeta): Promise<string> => {
    const hit = templateCache.current.get(t.file);
    if (hit !== undefined) return hit;
    const url = templateUrl(t.file);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const text = await res.text();
    templateCache.current.set(t.file, text);
    return text;
  }, []);

  useEffect(() => {
    const url = `${BASE}/templates/manifest.json`;
    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const list: TemplateMeta[] = json.templates ?? [];
        setTemplates(list);
        setTemplateId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? ""));
        setLoadError("");
      })
      .catch((err) => {
        const isFile = typeof location !== "undefined" && location.protocol === "file:";
        setLoadError(
          isFile
            ? "Sayfa dosya sisteminden (file://) açılmış; tarayıcı bu modda şablonları okuyamaz. Siteyi bir sunucu üzerinden açın (npm run dev veya yayınlanan adres)."
            : `Şablon listesi okunamadı — ${url} — ${err instanceof Error ? err.message : "bilinmeyen hata"}`
        );
      });
  }, []);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  useEffect(() => {
    if (!template) return;
    let cancelled = false;
    loadTemplate(template)
      .then((html) => {
        if (cancelled) return;
        setTemplateHtml(html);
        setLoadError("");
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(`${template.file} yüklenemedi — ${err.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [template, loadTemplate]);

  /* ------------------------------------------------ veri -> gorsel ---- */
  const variants = useMemo(() => buildVariants(cfg), [cfg]);

  const items: Item[] = useMemo(() => {
    if (!template || !templateHtml) return [];

    if (template.kind === "list") {
      return groupByStep(variants).map((group, i) => ({
        id: `step-${i}`,
        html: renderTemplate(templateHtml, listScope(group, cfg, i)),
        label: `Adım ${i + 1}`,
        sublabel: `${group.length} pozisyon · ${group[0].lot} lot`,
        filename: `${slug(cfg.brand || "portfoy")}-adim${i + 1}-${slug(template.id)}`,
      }));
    }

    return variants.map((v) => ({
      id: v.id,
      html: renderTemplate(templateHtml, variantScope(v, cfg, variants.length)),
      label: v.code,
      sublabel: `${v.lot} lot · maliyet ${v.cost.toFixed(2)}`,
      filename: `${slug(v.code)}-${v.lot}lot-${slug(v.cost.toFixed(2))}-${slug(template.id)}`,
    }));
  }, [template, templateHtml, variants, cfg]);

  useEffect(() => {
    setSelected(new Set(items.map((i) => i.id)));
  }, [items]);

  /** Galeri kucuk onizlemesi: gercek veriyle doldurulur. */
  const renderSample = useCallback(
    (t: TemplateMeta, html: string) => {
      if (variants.length === 0) return html;
      if (t.kind === "list") {
        const group = groupByStep(variants)[0] ?? [];
        return renderTemplate(html, listScope(group, cfg, 0));
      }
      return renderTemplate(html, variantScope(variants[0], cfg, variants.length));
    },
    [variants, cfg]
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ------------------------------------------------ disari aktarma ---- */
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
    setStatus(null);
    try {
      const dataUrl = await capture(item.id);
      if (!dataUrl) throw new Error("Görsel oluşturulamadı");
      downloadDataUrl(dataUrl, `${item.filename}.${format}`);
      setStatus({ kind: "ok", text: `${item.filename}.${format} indirildi.` });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Bilinmeyen hata" });
    } finally {
      setBusyId("");
    }
  }

  async function copyOne(item: Item) {
    setBusyId(item.id);
    setStatus(null);
    try {
      const dataUrl = await capture(item.id);
      if (!dataUrl) throw new Error("Görsel oluşturulamadı");
      const ok = await copyToClipboard(dataUrl);
      setStatus(
        ok
          ? { kind: "ok", text: "Panoya kopyalandı." }
          : { kind: "err", text: "Tarayıcı panoya görsel kopyalamayı desteklemiyor." }
      );
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Bilinmeyen hata" });
    } finally {
      setBusyId("");
    }
  }

  async function downloadSelected() {
    const chosen = items.filter((i) => selected.has(i.id));
    if (chosen.length === 0) {
      setStatus({ kind: "err", text: "Önce en az bir görsel seçin." });
      return;
    }
    setExporting(true);
    try {
      const entries: Array<{ filename: string; dataUrl: string }> = [];
      for (let i = 0; i < chosen.length; i++) {
        setStatus({ kind: "busy", text: `${i + 1} / ${chosen.length} hazırlanıyor…` });
        const dataUrl = await capture(chosen[i].id);
        if (dataUrl) entries.push({ filename: `${chosen[i].filename}.${format}`, dataUrl });
      }
      if (entries.length === 0) throw new Error("Hiçbir görsel oluşturulamadı");
      if (entries.length === 1) {
        downloadDataUrl(entries[0].dataUrl, entries[0].filename);
        setStatus({ kind: "ok", text: `${entries[0].filename} indirildi.` });
      } else {
        await downloadZip(
          entries,
          `${slug(cfg.brand || "kar-gorseli")}-${entries.length}-gorsel.zip`
        );
        setStatus({ kind: "ok", text: `${entries.length} görsel ZIP olarak indirildi.` });
      }
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Bilinmeyen hata" });
    } finally {
      setExporting(false);
    }
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ------------------------------------------------------ ust bar ---- */}
      <header className="h-14 flex-none flex items-center gap-3 px-4 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center gap-2.5 pr-3 border-r border-[var(--line)]">
          <span className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white">
            <IconLayers size={16} />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Kâr Görseli</div>
            <div className="text-[10.5px] text-[var(--text-3)]">{templates.length} şablon</div>
          </div>
        </div>

        {template && (
          <div className="min-w-0 leading-tight">
            <div className="text-[12.5px] font-semibold truncate">{template.name}</div>
            <div className="text-[10.5px] text-[var(--text-3)] tabular-nums">
              {template.width}×{template.height} · {items.length} görsel
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden xl:flex items-center gap-2 pr-2 border-r border-[var(--line)]">
            <span className="text-[11px] text-[var(--text-3)]">Boyut</span>
            <input
              type="range"
              min={170}
              max={400}
              step={10}
              value={boxWidth}
              onChange={(e) => setBoxWidth(Number(e.target.value))}
              className="w-24 accent-[var(--accent)]"
            />
          </div>

          <select
            className="field !w-auto !h-8"
            value={format}
            onChange={(e) => setFormat(e.target.value as ImageFormat)}
            title="Dosya biçimi"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
          <select
            className="field !w-auto !h-8"
            value={pixelRatio}
            onChange={(e) => setPixelRatio(Number(e.target.value))}
            title="Çözünürlük çarpanı"
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={3}>3x</option>
          </select>

          <button
            className="btn btn-sm"
            onClick={() => setSelected(new Set(allSelected ? [] : items.map((i) => i.id)))}
            disabled={items.length === 0}
          >
            <IconCheck size={13} /> {allSelected ? "Bırak" : "Tümü"}
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={downloadSelected}
            disabled={exporting || items.length === 0}
          >
            <IconDownload size={13} />
            {exporting ? "Hazırlanıyor…" : `İndir (${selected.size})`}
          </button>
        </div>
      </header>

      {/* -------------------------------------------------- durum satiri ---- */}
      {(loadError || status) && (
        <div
          className="flex-none px-4 py-2 text-[12px] border-b border-[var(--line)] flex items-start gap-2"
          style={{
            background:
              loadError || status?.kind === "err" ? "rgba(240,85,95,.09)" : "var(--surface)",
            color: loadError || status?.kind === "err" ? "var(--err)" : "var(--text-2)",
          }}
        >
          <IconAlert size={14} className="shrink-0 mt-px" />
          <span className="leading-relaxed break-all">{loadError || status?.text}</span>
          {!loadError && (
            <button
              className="ml-auto shrink-0 text-[var(--text-3)] hover:text-[var(--text)]"
              onClick={() => setStatus(null)}
              aria-label="Kapat"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- govde ---- */}
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[330px] flex-none border-r border-[var(--line)] overflow-y-auto scroll-thin p-2.5">
          <InputPanel
            cfg={cfg}
            onChange={setCfg}
            apiBase={apiBase}
            onApiBaseChange={setApiBase}
            variantCount={variants.length}
            imageCount={items.length}
          />
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto scroll-thin p-4">
          {items.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-xs">
                <div className="w-11 h-11 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-center mx-auto mb-3 text-[var(--text-3)]">
                  <IconLayers size={20} />
                </div>
                <p className="text-[13px] font-semibold mb-1.5">Henüz görsel yok</p>
                <p className="text-[12px] text-[var(--text-3)] leading-relaxed">
                  {loadError
                    ? "Şablonlar yüklenemediği için önizleme oluşturulamıyor."
                    : "Soldan hisse kodu ve güncel fiyat girin; görseller burada oluşur."}
                </p>
              </div>
            </div>
          ) : (
            <div
              className="grid gap-3.5"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${boxWidth + 28}px, 1fr))` }}
            >
              {template &&
                items.map((item) => (
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
                    sublabel={item.sublabel}
                    selected={selected.has(item.id)}
                    onToggle={() => toggle(item.id)}
                    onDownload={() => downloadOne(item)}
                    onCopy={() => copyOne(item)}
                    busy={busyId === item.id}
                    disabled={Boolean(busyId) || exporting}
                  />
                ))}
            </div>
          )}
        </main>

        <aside className="w-[340px] flex-none border-l border-[var(--line)] bg-[var(--surface)] min-h-0">
          <TemplateGallery
            templates={templates}
            activeId={templateId}
            onSelect={setTemplateId}
            loadTemplate={loadTemplate}
            renderSample={renderSample}
          />
        </aside>
      </div>
    </div>
  );
}
