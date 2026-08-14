/* ─────────────────────────────────────────────────────────────────────────
   Refined SVG icon set — stroke-based, 16×16 grid, currentColor.
   No emoji, no raster, purely geometric.
   ───────────────────────────────────────────────────────────────────────── */

type P = { size?: number; className?: string };
const defaults = { fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconDecks({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <rect x="4" y="5" width="10" height="9" rx="1.5" opacity="0.45" />
      <rect x="2" y="2" width="10" height="9" rx="1.5" />
      <line x1="4.5" y1="6" x2="9.5" y2="6" />
      <line x1="4.5" y1="8.5" x2="9.5" y2="8.5" opacity="0.5" />
    </svg>
  );
}

export function IconProgress({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <polyline points="1.5,13 5,8.5 8,10.5 12,5 14.5,7" />
      <line x1="1.5" y1="14.5" x2="14.5" y2="14.5" opacity="0.3" />
    </svg>
  );
}

export function IconLife({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <circle cx="8" cy="8" r="6.5" />
      <line x1="8" y1="4" x2="8" y2="8.2" />
      <line x1="8" y1="8.2" x2="11.2" y2="10.5" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconGarden({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <ellipse cx="8" cy="4.5" rx="1.6" ry="2.8" />
      <ellipse cx="8" cy="11.5" rx="1.6" ry="2.8" />
      <ellipse cx="4.5" cy="8" rx="2.8" ry="1.6" />
      <ellipse cx="11.5" cy="8" rx="2.8" ry="1.6" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

export function IconAI({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <circle cx="8" cy="8" r="2.2" />
      <circle cx="8" cy="2" r="1.2" />
      <circle cx="13.2" cy="5" r="1.2" />
      <circle cx="13.2" cy="11" r="1.2" />
      <circle cx="8" cy="14" r="1.2" />
      <circle cx="2.8" cy="11" r="1.2" />
      <circle cx="2.8" cy="5" r="1.2" />
      <line x1="8" y1="6.2" x2="8" y2="3.2" strokeOpacity="0.5" />
      <line x1="9.6" y1="6.8" x2="12.3" y2="5.8" strokeOpacity="0.5" />
      <line x1="9.6" y1="9.2" x2="12.3" y2="10.2" strokeOpacity="0.5" />
      <line x1="8" y1="9.8" x2="8" y2="12.8" strokeOpacity="0.5" />
      <line x1="6.4" y1="9.2" x2="3.7" y2="10.2" strokeOpacity="0.5" />
      <line x1="6.4" y1="6.8" x2="3.7" y2="5.8" strokeOpacity="0.5" />
    </svg>
  );
}

export function IconSettings({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <line x1="1.5" y1="4" x2="14.5" y2="4" />
      <circle cx="10.5" cy="4" r="2" fill="var(--bg-base)" />
      <line x1="1.5" y1="8" x2="14.5" y2="8" />
      <circle cx="5.5" cy="8" r="2" fill="var(--bg-base)" />
      <line x1="1.5" y1="12" x2="14.5" y2="12" />
      <circle cx="11.5" cy="12" r="2" fill="var(--bg-base)" />
    </svg>
  );
}

export function IconMenu({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <line x1="2.5" y1="4.5" x2="13.5" y2="4.5" />
      <line x1="2.5" y1="8" x2="13.5" y2="8" />
      <line x1="2.5" y1="11.5" x2="13.5" y2="11.5" />
    </svg>
  );
}

export function IconClose({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  );
}

export function IconTimer({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <circle cx="8" cy="9" r="6" />
      <line x1="6" y1="1.5" x2="10" y2="1.5" />
      <line x1="8" y1="1.5" x2="8" y2="3" />
      <line x1="8" y1="9" x2="8" y2="6" />
      <line x1="8" y1="9" x2="11" y2="10.5" />
    </svg>
  );
}

export function IconNotes({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
      <line x1="5" y1="5.5" x2="11" y2="5.5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="10.5" x2="8.5" y2="10.5" />
    </svg>
  );
}

export function IconHabits({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <polyline points="4.5,8.5 7,11 11.5,5.5" />
    </svg>
  );
}

export function IconBudget({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4v1.5M8 10.5V12" />
      <path d="M5.5 6.5a2.5 1.5 0 115 0c0 1-5 1.5-5 3a2.5 1.5 0 005 0" />
    </svg>
  );
}

export function IconArrowLeft({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <line x1="13" y1="8" x2="3" y2="8" />
      <polyline points="7,4 3,8 7,12" />
    </svg>
  );
}

export function IconTrash({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <line x1="2" y1="4" x2="14" y2="4" />
      <rect x="4.5" y="6" width="7" height="8" rx="1" />
      <path d="M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" />
      <line x1="7" y1="8" x2="7" y2="12" opacity="0.5" />
      <line x1="9" y1="8" x2="9" y2="12" opacity="0.5" />
    </svg>
  );
}

export function IconEdit({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <path d="M2.5 13.5l.5-2.7 7.4-7.4 2.2 2.2-7.4 7.4z" />
      <line x1="9.2" y1="4.6" x2="11.4" y2="6.8" opacity="0.5" />
    </svg>
  );
}

export function IconUpload({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <line x1="8" y1="2" x2="8" y2="11" />
      <polyline points="4,6 8,2 12,6" />
      <path d="M2 12v2h12v-2" opacity="0.5" />
    </svg>
  );
}

export function IconDownload({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <line x1="8" y1="2" x2="8" y2="11" />
      <polyline points="4,7 8,11 12,7" />
      <path d="M2 12v2h12v-2" opacity="0.5" />
    </svg>
  );
}

export function IconPlay({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <polygon points="5,3 13,8 5,13" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheck({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <polyline points="2.5,8.5 6,12 13.5,4.5" />
    </svg>
  );
}

export function IconKey({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <circle cx="5.5" cy="7" r="3.5" />
      <line x1="8.5" y1="9.2" x2="14" y2="14" />
      <line x1="11" y1="11.5" x2="13" y2="13.5" />
    </svg>
  );
}

export function IconStar({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <path d="M8 1.5l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 5.7l4-.6z" />
    </svg>
  );
}

export function IconTrophy({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <path d="M5 2h6v5a3 3 0 0 1-6 0V2z" />
      <path d="M5 4H3a2 2 0 0 0 0 4h2" />
      <path d="M11 4h2a2 2 0 0 1 0 4h-2" />
      <line x1="8" y1="9.5" x2="8" y2="12" />
      <path d="M5.5 12h5" />
      <path d="M6 14h4" opacity="0.5" />
    </svg>
  );
}

export function IconChart({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <polyline points="1,13 5,8 9,10 15,3" />
      <line x1="1" y1="15" x2="15" y2="15" />
    </svg>
  );
}

export function IconGift({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <rect x="1.5" y="6" width="13" height="8" rx="1" />
      <rect x="1.5" y="4" width="13" height="2.5" rx="0.75" />
      <line x1="8" y1="4" x2="8" y2="14" />
      <path d="M8 4C8 4 6 1.5 4.5 2.5S5 5 8 4z" />
      <path d="M8 4C8 4 10 1.5 11.5 2.5S11 5 8 4z" />
    </svg>
  );
}

/* Two people — work groups. */
export function IconUsers({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <circle cx="5.5" cy="5" r="2.6" />
      <path d="M1.5 14 c0-2.6 1.8-4.2 4-4.2 s4 1.6 4 4.2" />
      <circle cx="11.5" cy="5.6" r="2" opacity="0.55" />
      <path d="M11.8 9.9 c1.7.3 2.9 1.7 2.9 3.6" opacity="0.55" />
    </svg>
  );
}

/* Brand mark — a stack of flashcards in perspective: memory, layered over time. */
export function IconLogo({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <rect x="4.5" y="1.5" width="10" height="7" rx="1.6" opacity="0.45" />
      <rect x="3" y="4" width="10" height="7" rx="1.6" opacity="0.7" />
      <rect x="1.5" y="6.5" width="10" height="7" rx="1.6" />
      <line x1="4" y1="9.4" x2="9" y2="9.4" opacity="0.8" />
      <line x1="4" y1="11.4" x2="7" y2="11.4" opacity="0.5" />
    </svg>
  );
}

export function IconMusic({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...defaults}>
      <circle cx="4.2" cy="12.2" r="2.1" />
      <circle cx="12" cy="10.8" r="2.1" />
      <path d="M6.3 12.2 V4.4 L14.1 3 v7.8" />
      <line x1="6.3" y1="6.6" x2="14.1" y2="5.2" opacity="0.5" />
    </svg>
  );
}
