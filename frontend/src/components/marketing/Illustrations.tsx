import type { ReactNode } from "react";

/**
 * Flat-vector scenes for the marketing page.
 *
 * Hand-built SVG rather than exported images on purpose: they are drawn from
 * the same palette tokens the product uses, so they re-colour with the theme
 * (light and dark) instead of going stale the way a flat PNG would, they stay
 * crisp at any width, and they cost no extra request.
 *
 * Every scene is decorative — each one carries its own `aria-hidden`.
 */

/* Shared palette hooks. `color-mix` against --card lets one scene read
   correctly on both the light ground and the dark surface stack. */
const SKY_TOP = "color-mix(in srgb, var(--accent) 8%, var(--card))";
const SKY_BOTTOM = "var(--card)";
const INK = "var(--foreground)";
const SOFT = "color-mix(in srgb, var(--foreground) 8%, transparent)";
const LINE = "var(--border)";
const CORAL = "var(--accent)";
const CORAL_SOFT = "color-mix(in srgb, var(--accent) 18%, transparent)";
const TEAL = "color-mix(in srgb, #2f9e8f 78%, var(--card))";
const TEAL_SOFT = "color-mix(in srgb, #2f9e8f 20%, transparent)";
const BLUE = "color-mix(in srgb, #4f7cc9 82%, var(--card))";
const BLUE_SOFT = "color-mix(in srgb, #4f7cc9 20%, transparent)";

/* ------------------------------------------------------------------ Hero */

/**
 * The hero backdrop: a campus block and its grounds. Deliberately calm and
 * wide, and carrying no text of its own — the product chrome floats over it,
 * so this is scenery, never the subject.
 */
export function CampusScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 420"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="tg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SKY_TOP} />
          <stop offset="100%" stopColor={SKY_BOTTOM} />
        </linearGradient>
        <linearGradient id="tg-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TEAL_SOFT} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>

      <rect width="1200" height="420" fill="url(#tg-sky)" />

      <path
        d="M0 300 C 140 250 240 268 340 292 C 470 322 560 274 700 286 C 840 298 960 262 1200 296 L1200 420 L0 420 Z"
        fill="url(#tg-ground)"
      />

      {/* Distant blocks, kept faint so they read as depth, not detail */}
      <g opacity="0.45" fill={SOFT}>
        <rect x="80" y="238" width="70" height="86" rx="6" />
        <rect x="164" y="262" width="46" height="62" rx="6" />
        <rect x="1010" y="248" width="62" height="76" rx="6" />
        <rect x="1084" y="272" width="42" height="52" rx="6" />
      </g>

      {/* Main academy building */}
      <g>
        <rect x="470" y="196" width="260" height="132" rx="10" fill="var(--card)" stroke={LINE} strokeWidth="2" />
        <path d="M600 150 L760 200 L440 200 Z" fill={CORAL_SOFT} stroke={CORAL} strokeWidth="2" strokeLinejoin="round" />
        <rect x="588" y="120" width="6" height="34" rx="3" fill={INK} opacity="0.5" />
        <path d="M594 122 L636 132 L594 142 Z" fill={CORAL} />
        <g fill={BLUE_SOFT} stroke={BLUE} strokeWidth="1.5">
          <rect x="496" y="222" width="34" height="30" rx="4" />
          <rect x="546" y="222" width="34" height="30" rx="4" />
          <rect x="620" y="222" width="34" height="30" rx="4" />
          <rect x="670" y="222" width="34" height="30" rx="4" />
          <rect x="496" y="266" width="34" height="30" rx="4" />
          <rect x="670" y="266" width="34" height="30" rx="4" />
        </g>
        <rect x="576" y="266" width="48" height="62" rx="6" fill={CORAL_SOFT} stroke={CORAL} strokeWidth="2" />
        <circle cx="614" cy="298" r="3" fill={CORAL} />
      </g>

      {/* Side wings */}
      <rect x="352" y="240" width="106" height="88" rx="8" fill="var(--card)" stroke={LINE} strokeWidth="2" />
      <rect x="742" y="240" width="106" height="88" rx="8" fill="var(--card)" stroke={LINE} strokeWidth="2" />
      <g fill={TEAL_SOFT} stroke={TEAL} strokeWidth="1.5">
        <rect x="372" y="260" width="28" height="24" rx="4" />
        <rect x="412" y="260" width="28" height="24" rx="4" />
        <rect x="762" y="260" width="28" height="24" rx="4" />
        <rect x="802" y="260" width="28" height="24" rx="4" />
      </g>

      {/* Trees */}
      {[290, 322, 880, 918].map((x, i) => (
        <g key={x}>
          <rect x={x} y={296 - (i % 2) * 6} width="6" height="32" rx="3" fill={INK} opacity="0.35" />
          <circle cx={x + 3} cy={288 - (i % 2) * 6} r={i % 2 ? 20 : 26} fill={TEAL_SOFT} stroke={TEAL} strokeWidth="2" />
        </g>
      ))}

      {/* Approach path with a few figures walking in */}
      <path d="M600 328 C 600 356 520 372 440 392 L760 392 C 690 372 600 356 600 328 Z" fill={SOFT} />
      {[
        { x: 520, c: CORAL },
        { x: 566, c: BLUE },
        { x: 660, c: TEAL },
      ].map((p) => (
        <g key={p.x}>
          <circle cx={p.x} cy="348" r="7" fill={p.c} />
          <path
            d={`M${p.x - 9} 386 L${p.x - 6} 362 Q${p.x} 356 ${p.x + 6} 362 L${p.x + 9} 386 Z`}
            fill={p.c}
            opacity="0.75"
          />
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------- Feature scenes */

function SceneFrame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" aria-hidden="true">
      <rect width="320" height="160" rx="14" fill={SKY_TOP} />
      {children}
    </svg>
  );
}

/** Enquiry to admission: a lead card moving along the pipeline. */
export function EnquiryScene() {
  return (
    <SceneFrame>
      {[24, 122, 220].map((x, i) => (
        <g key={x}>
          <rect
            x={x}
            y="40"
            width="76"
            height="80"
            rx="10"
            fill="var(--card)"
            stroke={i === 2 ? CORAL : LINE}
            strokeWidth={i === 2 ? 2 : 1.5}
          />
          <rect x={x + 12} y="54" width="34" height="6" rx="3" fill={INK} opacity="0.35" />
          <circle cx={x + 24} cy="84" r="10" fill={i === 2 ? CORAL_SOFT : SOFT} />
          <rect x={x + 12} y="102" width="52" height="5" rx="2.5" fill={INK} opacity="0.18" />
        </g>
      ))}
      <path d="M104 80 H118 M202 80 H216" stroke={CORAL} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" />
      <path d="M244 78 l6 6 10-12" stroke={CORAL} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </SceneFrame>
  );
}

/** Academics: batches and subjects laid into a timetable grid. */
export function AcademicsScene() {
  return (
    <SceneFrame>
      <rect x="26" y="30" width="268" height="100" rx="12" fill="var(--card)" stroke={LINE} strokeWidth="1.5" />
      <path d="M26 56 H294" stroke={LINE} strokeWidth="1.5" />
      {[0, 1, 2, 3, 4].map((c) => (
        <path key={c} d={`M${26 + 53.6 * (c + 1)} 56 V130`} stroke={LINE} strokeWidth="1" opacity="0.6" />
      ))}
      {[
        { c: 0, r: 0, f: CORAL_SOFT, s: CORAL },
        { c: 1, r: 1, f: BLUE_SOFT, s: BLUE },
        { c: 2, r: 0, f: TEAL_SOFT, s: TEAL },
        { c: 3, r: 1, f: CORAL_SOFT, s: CORAL },
        { c: 4, r: 0, f: BLUE_SOFT, s: BLUE },
      ].map((b) => (
        <rect
          key={b.c}
          x={32 + 53.6 * b.c}
          y={64 + b.r * 32}
          width="42"
          height="24"
          rx="6"
          fill={b.f}
          stroke={b.s}
          strokeWidth="1.5"
        />
      ))}
      <rect x="36" y="38" width="46" height="8" rx="4" fill={INK} opacity="0.3" />
    </SceneFrame>
  );
}

/** Attendance: a roster being marked, beside the day's rate. */
export function AttendanceScene() {
  return (
    <SceneFrame>
      <rect x="22" y="28" width="164" height="104" rx="12" fill="var(--card)" stroke={LINE} strokeWidth="1.5" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx="44" cy={52 + i * 30} r="9" fill={SOFT} />
          <rect x="60" y={47 + i * 30} width="66" height="6" rx="3" fill={INK} opacity="0.28" />
          <rect x="60" y={57 + i * 30} width="40" height="5" rx="2.5" fill={INK} opacity="0.14" />
          <rect
            x="140"
            y={44 + i * 30}
            width="30"
            height="16"
            rx="8"
            fill={i === 1 ? "var(--warning-soft)" : "var(--success-soft)"}
          />
          <path
            d={i === 1 ? "M150 52 h10" : "M148 52 l3.5 3.5 7-7"}
            transform={`translate(0,${i * 30})`}
            stroke={i === 1 ? "var(--warning)" : "var(--success)"}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
      <circle cx="252" cy="80" r="34" fill="none" stroke={SOFT} strokeWidth="10" />
      <circle
        cx="252"
        cy="80"
        r="34"
        fill="none"
        stroke={TEAL}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray="197 214"
        transform="rotate(-90 252 80)"
      />
      <text x="252" y="86" textAnchor="middle" fontSize="18" fontWeight="700" fill={INK}>
        92%
      </text>
    </SceneFrame>
  );
}

/** Fees: a receipt with its installment ladder settling. */
export function FeesScene() {
  return (
    <SceneFrame>
      <rect x="30" y="24" width="118" height="116" rx="10" fill="var(--card)" stroke={LINE} strokeWidth="1.5" />
      <rect x="44" y="40" width="52" height="7" rx="3.5" fill={INK} opacity="0.35" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="44" y={60 + i * 16} width={70 - i * 8} height="5" rx="2.5" fill={INK} opacity="0.15" />
          <circle cx="128" cy={62 + i * 16} r="4" fill={i < 3 ? "var(--success)" : SOFT} />
        </g>
      ))}
      <path d="M44 128 h48" stroke={CORAL} strokeWidth="3" strokeLinecap="round" />
      <rect x="170" y="46" width="120" height="72" rx="12" fill={CORAL_SOFT} stroke={CORAL} strokeWidth="1.5" />
      <text x="230" y="82" textAnchor="middle" fontSize="20" fontWeight="700" fill={CORAL}>
        &#8377;8.4L
      </text>
      <text x="230" y="100" textAnchor="middle" fontSize="10" fill={INK} opacity="0.55">
        collected this month
      </text>
    </SceneFrame>
  );
}

/** Payroll: a payslip against the run of previous months. */
export function PayrollScene() {
  return (
    <SceneFrame>
      {[60, 62, 78, 70, 92, 84].map((h, i) => (
        <rect key={i} x={28 + i * 22} y={132 - h} width="14" height={h} rx="4" fill={i === 4 ? CORAL : BLUE_SOFT} />
      ))}
      <rect x="180" y="26" width="112" height="108" rx="10" fill="var(--card)" stroke={LINE} strokeWidth="1.5" />
      <rect x="194" y="42" width="46" height="7" rx="3.5" fill={CORAL} opacity="0.8" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="194" y={64 + i * 18} width="48" height="5" rx="2.5" fill={INK} opacity="0.16" />
          <rect
            x="252"
            y={62 + i * 18}
            width="26"
            height="9"
            rx="4.5"
            fill={i === 2 ? "var(--warning-soft)" : "var(--success-soft)"}
          />
        </g>
      ))}
      <path d="M194 122 h84" stroke={LINE} strokeWidth="1.5" />
    </SceneFrame>
  );
}

/** Student portal: the app plus the cards it surfaces. */
export function PortalScene() {
  return (
    <SceneFrame>
      <rect x="120" y="18" width="80" height="140" rx="14" fill="var(--card)" stroke={INK} strokeOpacity="0.25" strokeWidth="2" />
      <rect x="150" y="24" width="20" height="4" rx="2" fill={INK} opacity="0.25" />
      <rect x="130" y="38" width="60" height="26" rx="8" fill={CORAL_SOFT} />
      <rect x="138" y="46" width="30" height="5" rx="2.5" fill={CORAL} />
      <rect x="138" y="55" width="18" height="4" rx="2" fill={CORAL} opacity="0.6" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x="130" y={72 + i * 20} width="60" height="16" rx="6" fill={SOFT} />
      ))}
      <rect x="42" y="52" width="64" height="40" rx="10" fill="var(--card)" stroke={LINE} strokeWidth="1.5" />
      <rect x="52" y="64" width="30" height="5" rx="2.5" fill={INK} opacity="0.25" />
      <rect x="52" y="74" width="44" height="5" rx="2.5" fill={TEAL} opacity="0.6" />
      <rect x="214" y="70" width="64" height="40" rx="10" fill="var(--card)" stroke={LINE} strokeWidth="1.5" />
      <rect x="224" y="82" width="34" height="5" rx="2.5" fill={INK} opacity="0.25" />
      <rect x="224" y="92" width="24" height="5" rx="2.5" fill={CORAL} opacity="0.7" />
    </SceneFrame>
  );
}

/** Multi-tenant architecture: one platform layer, isolated institutes below. */
export function TenancyScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 260" className={className} aria-hidden="true">
      <rect x="130" y="16" width="160" height="52" rx="12" fill={CORAL_SOFT} stroke={CORAL} strokeWidth="2" />
      <text x="210" y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill={INK}>
        Platform layer
      </text>
      <text x="210" y="56" textAnchor="middle" fontSize="10" fill={INK} opacity="0.6">
        provisioning · plans · health
      </text>

      {[40, 160, 280].map((x, i) => (
        <g key={x}>
          <path d={`M210 68 V96 M210 96 H${x + 50} V120`} stroke={LINE} strokeWidth="2" fill="none" strokeLinecap="round" />
          <rect x={x} y="120" width="100" height="118" rx="12" fill="var(--card)" stroke={LINE} strokeWidth="1.5" />
          <rect x={x + 14} y="136" width="48" height="7" rx="3.5" fill={INK} opacity="0.35" />
          <text x={x + 50} y="168" textAnchor="middle" fontSize="10" fill={INK} opacity="0.55">
            Institute {i + 1}
          </text>
          {[0, 1, 2].map((r) => (
            <rect
              key={r}
              x={x + 14}
              y={182 + r * 16}
              width={r === 1 ? 56 : 72}
              height="8"
              rx="4"
              fill={[CORAL_SOFT, BLUE_SOFT, TEAL_SOFT][r]}
            />
          ))}
          {/* The dashed rule between institutes is the tenant boundary. */}
          {i < 2 && <path d={`M${x + 110} 126 v106`} stroke={CORAL} strokeWidth="2" strokeDasharray="4 5" opacity="0.6" />}
        </g>
      ))}
    </svg>
  );
}
