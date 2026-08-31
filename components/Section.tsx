"use client";

import { useState } from "react";
import { IconCaret } from "./Icons";

interface Props {
  title: string;
  icon?: React.ReactNode;
  /** Baslikta sagda gorunen kisa ozet (ornegin "2 hisse"). */
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Sol paneldeki acilir bolum. Uzun formu yonetilebilir parcalara boler. */
export default function Section({ title, icon, hint, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="panel overflow-hidden">
      <button className="sec-head" data-open={open} onClick={() => setOpen((v) => !v)}>
        <IconCaret className="caret" />
        {icon && <span className="text-[var(--text-3)]">{icon}</span>}
        {title}
        {hint && <span className="sec-count">{hint}</span>}
      </button>
      {open && <div className="px-3 pb-3.5 pt-0.5 space-y-3">{children}</div>}
    </section>
  );
}
