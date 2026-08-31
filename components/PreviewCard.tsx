"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { TemplateMeta } from "@/lib/types";
import { buildDocument, measureFrame } from "@/lib/stage";
import { IconCheck, IconCopy, IconDownload } from "./Icons";

export interface PreviewHandle {
  iframe: () => HTMLIFrameElement | null;
  /** height:"auto" sablonlarda olculen gercek yukseklik. */
  height: () => number;
}

interface Props {
  html: string;
  template: TemplateMeta;
  /** Onizlemede kaplayacagi genislik (px). Gorsel bu degerle kucultulur. */
  boxWidth: number;
  label: string;
  sublabel?: string;
  selected: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onCopy: () => void;
  busy: boolean;
  disabled: boolean;
}

const PreviewCard = forwardRef<PreviewHandle, Props>(function PreviewCard(
  {
    html,
    template,
    boxWidth,
    label,
    sublabel,
    selected,
    onToggle,
    onDownload,
    onCopy,
    busy,
    disabled,
  },
  ref
) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [autoHeight, setAutoHeight] = useState<number>(
    typeof template.height === "number" ? template.height : 900
  );

  const naturalW = template.width;
  const naturalH = typeof template.height === "number" ? template.height : autoHeight;
  const scale = boxWidth / naturalW;

  useImperativeHandle(ref, () => ({
    iframe: () => frameRef.current,
    height: () => naturalH,
  }));

  // srcdoc degistiginde auto yukseklikleri yeniden olc
  useEffect(() => {
    if (typeof template.height === "number") return;
    const id = window.setTimeout(() => {
      const h = measureFrame(frameRef.current);
      if (h > 0) setAutoHeight(h);
    }, 80);
    return () => window.clearTimeout(id);
  }, [html, template.height, template.id]);

  return (
    <div className="pcard" data-sel={selected}>
      <div className="pcard-bar">
        <button
          className="check"
          data-on={selected}
          onClick={onToggle}
          aria-label={selected ? "Seçimi kaldır" : "Seç"}
          title={selected ? "Seçimi kaldır" : "Seç"}
        >
          <IconCheck />
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold truncate">{label}</div>
          {sublabel && (
            <div className="text-[10.5px] text-[var(--text-3)] truncate tabular-nums">
              {sublabel}
            </div>
          )}
        </div>

        {busy ? (
          <span className="text-[var(--accent)] px-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="spin">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          </span>
        ) : (
          <div className="flex gap-1">
            <button
              className="btn btn-icon btn-ghost !h-7"
              onClick={onCopy}
              disabled={disabled}
              title="Panoya kopyala"
            >
              <IconCopy />
            </button>
            <button
              className="btn btn-icon btn-sm btn-primary"
              onClick={onDownload}
              disabled={disabled}
              title="İndir"
            >
              <IconDownload />
            </button>
          </div>
        )}
      </div>

      <div className="pcard-stage">
        <div
          style={{ width: boxWidth, height: naturalH * scale }}
          className="overflow-hidden rounded-md shadow-[0_8px_28px_rgba(0,0,0,.45)]"
        >
          <iframe
            ref={frameRef}
            className="stage-frame"
            title={label}
            srcDoc={buildDocument(html, naturalW)}
            scrolling="no"
            style={{
              width: naturalW,
              height: naturalH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </div>
  );
});

export default PreviewCard;
