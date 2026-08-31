"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TemplateMeta } from "@/lib/types";
import { buildDocument } from "@/lib/stage";
import { IconSearch } from "./Icons";

interface Props {
  templates: TemplateMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Sablon dosyasini getirir (onbellekli). Kucuk onizleme icin kullanilir. */
  loadTemplate: (t: TemplateMeta) => Promise<string>;
  /** Ornek veriyle doldurmak icin: ham sablon -> islenmis HTML. */
  renderSample: (t: TemplateMeta, html: string) => string;
}

const THUMB_W = 150;
const THUMB_H = 158;

/** Tek bir sablonun kucuk canli onizlemesi. Gorunur olunca yuklenir. */
function Thumb({
  template,
  loadTemplate,
  renderSample,
}: Pick<Props, "loadTemplate" | "renderSample"> & { template: TemplateMeta }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  // Ekrana girmeden yukleme - 25 iframe'i ayni anda kurmamak icin.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || html !== null) return;
    let cancelled = false;
    loadTemplate(template)
      .then((raw) => {
        if (!cancelled) setHtml(renderSample(template, raw));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, html, template, loadTemplate, renderSample]);

  const naturalH = typeof template.height === "number" ? template.height : 1100;
  // Kirpmadan sigdirmak yerine ustten hizali kucultme: ekranin ust kismi
  // sablonu tanimak icin yeterli ve tum kartlar ayni yukseklikte kaliyor.
  const scale = THUMB_W / template.width;

  return (
    <div className="tpl-thumb" ref={hostRef}>
      {html ? (
        <iframe
          className="stage-frame"
          title={template.name}
          srcDoc={buildDocument(html, template.width)}
          scrolling="no"
          style={{
            width: template.width,
            height: Math.min(naturalH, THUMB_H / scale),
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-[var(--text-3)]">
          {failed ? "yüklenemedi" : ""}
        </div>
      )}
    </div>
  );
}

export default function TemplateGallery({
  templates,
  activeId,
  onSelect,
  loadTemplate,
  renderSample,
}: Props) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "single" | "list">("all");

  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return templates.filter((t) => {
      if (kind !== "all" && t.kind !== kind) return false;
      if (!needle) return true;
      return `${t.name} ${t.description ?? ""}`.toLocaleLowerCase("tr").includes(needle);
    });
  }, [templates, q, kind]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 space-y-2.5 border-b border-[var(--line)]">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]">
            <IconSearch />
          </span>
          <input
            className="field pl-8"
            placeholder="Şablon ara"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="seg">
          <button data-on={kind === "all"} onClick={() => setKind("all")}>
            Tümü
          </button>
          <button data-on={kind === "single"} onClick={() => setKind("single")}>
            Tek pozisyon
          </button>
          <button data-on={kind === "list"} onClick={() => setKind("list")}>
            Portföy
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin p-3">
        {shown.length === 0 ? (
          <p className="text-[12px] text-[var(--text-3)] text-center py-8">Eşleşen şablon yok.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {shown.map((t) => (
              <button
                key={t.id}
                className="tpl"
                data-on={t.id === activeId}
                onClick={() => onSelect(t.id)}
                title={t.description}
              >
                <Thumb template={t} loadTemplate={loadTemplate} renderSample={renderSample} />
                <span className="tpl-kind">{t.kind === "list" ? "portföy" : "tek"}</span>
                <div className="tpl-meta">
                  <div className="tpl-name">{t.name}</div>
                  <div className="tpl-dim">
                    {t.width}×{t.height}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
