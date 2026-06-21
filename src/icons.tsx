import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const BellIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const InfoIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

/* Chart Settings sub-nav — match Lumen tab icon set */
const tabIcon = (props: IconProps) => ({
  ...base(props),
  strokeWidth: 1.4,
});

/** 1 — Mapping: stacked layers */
export const MapIcon = (p: IconProps) => (
  <svg {...tabIcon(p)}>
    <path d="M12 5.5 18.5 9.25 12 13 5.5 9.25 12 5.5Z" />
    <path d="M5.5 12.25 12 16 18.5 12.25" />
  </svg>
);

/** 2 — Customization: diamond (inset to match tab icon footprint) */
export const PaletteIcon = (p: IconProps) => (
  <svg {...tabIcon(p)}>
    <path d="M8 5.5h8l2.5 4.5-6.5 6L5.5 10Z" />
  </svg>
);

/** 3 — Scaling: focus / resize frame */
export const ScaleIcon = (p: IconProps) => (
  <svg {...tabIcon(p)}>
    <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1" />
    <path d="M5 8.5V5h3.5" />
    <path d="M19 8.5V5h-3.5" />
    <path d="M5 15.5V19h3.5" />
    <path d="M19 15.5V19h-3.5" />
  </svg>
);

/** 4 — Tooltips: info circle */
export const TooltipIcon = (p: IconProps) => (
  <svg {...tabIcon(p)}>
    <circle cx="12" cy="12" r="8.25" />
    <circle cx="12" cy="8.75" r="1" fill="currentColor" stroke="none" />
    <path d="M12 11v4.5" strokeLinecap="round" />
  </svg>
);

/** 3 — Insights: lightbulb (meaning layered on top) */
export const InsightsIcon = (p: IconProps) => (
  <svg {...tabIcon(p)}>
    <path d="M9.5 17.5h5" />
    <path d="M10.5 20h3" />
    <path d="M12 3.75a5 5 0 0 0-3.2 8.85c.62.52 1.2 1.3 1.2 2.15h4c0-.85.58-1.63 1.2-2.15A5 5 0 0 0 12 3.75Z" />
  </svg>
);

/** 4 — Readout: gauge / meter (precision & detail) */
export const ReadoutIcon = (p: IconProps) => (
  <svg {...tabIcon(p)}>
    <path d="M4.5 16a7.5 7.5 0 0 1 15 0" />
    <path d="M12 16l4-3" />
    <circle cx="12" cy="16" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const SparkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 17 9 11l4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function circleLineY(cx: number, cy: number, r: number, x: number) {
  const dy = Math.sqrt(Math.max(0, r * r - (x - cx) ** 2));
  return { y1: cy - dy, y2: cy + dy };
}

export const ContrastIcon = (p: IconProps) => {
  const cx = 12;
  const cy = 12;
  const inner = 8;
  const xs = [12, 15, 18];

  return (
    <svg {...base(p)} strokeWidth={2}>
      <circle cx={cx} cy={cy} r={9} />
      {xs.map((x) => {
        const { y1, y2 } = circleLineY(cx, cy, inner, x);
        return <line key={x} x1={x} y1={y1} x2={x} y2={y2} />;
      })}
    </svg>
  );
};

export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

/** Layers — advanced controls */
export const CrownIcon = (p: IconProps) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M12 2 2 7l10 5 10-5L12 2z" />
    <path d="M2 12l10 5 10-5" />
    <path d="M2 17l10 5 10-5" />
  </svg>
);

/** Branch — conditional / context-dependent fields */
export const ConditionalIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3v12" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9v3a3 3 0 0 1-3 3H9" />
  </svg>
);

/** Circle alert — incomplete required fields on a tab */
export const FieldAlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </svg>
);

/** Asterisk — required fields */
export const RequiredIcon = (p: IconProps) => (
  <svg width={10} height={10} viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" {...p}>
    <text
      x="5"
      y="7.6"
      textAnchor="middle"
      fontSize="10"
      fontWeight="500"
      fontFamily='"IBM Plex Mono", ui-monospace, monospace'
      fill="currentColor"
    >
      *
    </text>
  </svg>
);

/** Single — one solid filled pill */
export const SinglePillIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2" y="8.5" width="20" height="7" rx="3.5" fill="currentColor" stroke="none" />
  </svg>
);

/** Gradient — pill with a left-to-right gradient fill */
export const GradientPillIcon = (p: IconProps) => {
  const gid = "cp-grad-pill";
  return (
    <svg {...base(p)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="1" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect x="2" y="8.5" width="20" height="7" rx="3.5" fill={`url(#${gid})`} stroke="none" />
    </svg>
  );
};

/** Steps — three dots */
export const StepsDotsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);

// sidebar icons (simple, consistent stroke style)
export const Glyph = ({ d, ...p }: IconProps & { d: string }) => (
  <svg {...base(p)}>
    <path d={d} />
  </svg>
);
