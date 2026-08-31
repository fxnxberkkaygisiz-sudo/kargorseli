/** Arayuzde kullanilan kucuk ikon seti. Hepsi 24x24 kutuda, stroke tabanli. */
type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconCaret = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconCheck = ({ size = 11, className }: P) => (
  <svg {...base(size)} strokeWidth={3} className={className}><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconDownload = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3v12M7 11l5 5 5-5M4 21h16" /></svg>
);
export const IconCopy = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const IconPlus = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconTrash = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" /></svg>
);
export const IconSearch = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
);
export const IconRefresh = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg>
);
export const IconImage = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 17 5-5 4 4 3-3 4 4" /></svg>
);
export const IconLayers = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><path d="m12 3 9 5-9 5-9-5 9-5ZM3 14l9 5 9-5" /></svg>
);
export const IconSliders = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
);
export const IconWallet = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></svg>
);
export const IconAlert = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></svg>
);
export const IconSpinner = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3a9 9 0 1 0 9 9" /></svg>
);
