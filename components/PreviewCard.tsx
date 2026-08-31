"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { TemplateMeta } from "@/lib/types";
import { buildDocument, measureFrame } from "@/lib/stage";

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
  label?: string;
  selected?: boolean;
  onToggle?: () => void;
  busy?: boolean;
  actions?: React.ReactNode;
}

const PreviewCard = forwardRef<PreviewHandle, Props>(function PreviewCard(
  { html, template, boxWidth, label, selected, onToggle, busy, actions },
  ref
) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [autoHeight, setAutoHeight] = useState<number>(
    typeof template.height === "number" ? template.height : 600
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
    }, 60);
    return () => window.clearTimeout(id);
  }, [html, template.height, template.id]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--line)]">
        {onToggle && (
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={onToggle}
            className="accent-[var(--accent)] w-4 h-4 cursor-pointer"
            aria-label="Bu görseli seç"
          />
        )}
        <span className="text-xs text-[var(--muted)] truncate flex-1">{label}</span>
        {busy && <span className="text-[11px] text-[var(--accent)]">…</span>}
        {actions}
      </div>

      <div className="flex justify-center bg-[#0e1014] p-3">
        <div
          style={{ width: boxWidth, height: naturalH * scale }}
          className="overflow-hidden rounded-lg shadow-[0_10px_30px_rgba(0,0,0,.5)]"
        >
          <iframe
            ref={frameRef}
            className="stage-frame"
            title={label ?? template.name}
            srcDoc={buildDocument(html, naturalW)}
            width={naturalW}
            height={naturalH}
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
