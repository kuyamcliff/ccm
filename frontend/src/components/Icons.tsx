import type { ReactNode } from "react";

/**
 * Line icons for the public site.
 *
 * Replaces the emoji that were scattered through the pages. Emoji render
 * differently on every platform, carry colours that fight the palette, and
 * read as placeholder work. These are one stroke weight on one grid, so a row
 * of them looks like a set rather than a pile of unrelated pictures.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* Food and drink */
export const IconFlame = (p: IconProps) => (
  <Svg {...p}><path d="M12 2c1.5 3.5-1 5-1 7a3 3 0 0 0 6 0c0-1-.4-2-1-2.8 2.4 1.6 4 4.2 4 7.3a8 8 0 1 1-16 0c0-4.6 3.4-8.2 8-11.5z" /></Svg>
);
export const IconChicken = (p: IconProps) => (
  <Svg {...p}><path d="M15.5 3a5.5 5.5 0 0 0-5 7.7l-1.9 1.9a2 2 0 0 0 0 2.8l.9.9-2.6 2.6a2 2 0 1 0 2.8 2.8l2.6-2.6.9.9a2 2 0 0 0 2.8 0l1.9-1.9A5.5 5.5 0 1 0 15.5 3z" /></Svg>
);
export const IconMeat = (p: IconProps) => (
  <Svg {...p}><path d="M6.5 17.5a7 7 0 1 1 10-10c2.5 2.5 2.2 6.4-.7 8.6-1.5 1.1-2.3 2-2.6 3.1-.3 1.2-1.5 1.9-2.7 1.5-1.1-.3-1.7-1.4-1.5-2.5.2-1-.2-1.6-1-1.9" /><circle cx="10" cy="11" r="2.5" /></Svg>
);
export const IconPepper = (p: IconProps) => (
  <Svg {...p}><path d="M12 6c4 0 7 3 7 7a5 5 0 0 1-5 5c-4.5 0-8-3.5-8-8" /><path d="M12 6c0-2 1-3 3-3" /></Svg>
);
export const IconDrink = (p: IconProps) => (
  <Svg {...p}><path d="M6 3h12l-1.2 16.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z" /><path d="M6.6 9h10.8" /></Svg>
);
export const IconPlate = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /></Svg>
);

/* Amenities */
export const IconGroup = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16.5 11a3 3 0 1 0-1.8-5.4" /><path d="M17 20a5.5 5.5 0 0 0-2-4.3" /></Svg>
);
export const IconChild = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="7" r="3.2" /><path d="M8 21v-4a4 4 0 0 1 8 0v4" /><path d="M9 13.5 6 16M15 13.5 18 16" /></Svg>
);
export const IconParking = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M10 17V8h3.2a2.9 2.9 0 0 1 0 5.8H10" /></Svg>
);
export const IconChair = (p: IconProps) => (
  <Svg {...p}><path d="M6 4v7h12V4" /><path d="M4 11h16" /><path d="M7 11v9M17 11v9" /><path d="M7 16h10" /></Svg>
);
export const IconBox = (p: IconProps) => (
  <Svg {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></Svg>
);
export const IconCalendar = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>
);
export const IconMusic = (p: IconProps) => (
  <Svg {...p}><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></Svg>
);

/* Interface */
export const IconPhone = (p: IconProps) => (
  <Svg {...p}><path d="M4.5 4.5h4l2 5-2.5 1.5a12 12 0 0 0 5 5L14.5 13.5l5 2v4a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3 6.1 1.5 1.5 0 0 1 4.5 4.5z" /></Svg>
);
export const IconMail = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16.5 11a3 3 0 1 0-1.8-5.4" /><path d="M17 20a5.5 5.5 0 0 0-2-4.3" /></Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="m4.5 12.5 5 5 10-11" /></Svg>
);
export const IconThumbUp = (p: IconProps) => (
  <Svg {...p}><path d="M7 21V10l4.5-7a2.2 2.2 0 0 1 2 3l-1 4h5.8a2.2 2.2 0 0 1 2.1 2.8l-1.8 6.4a2.2 2.2 0 0 1-2.1 1.8z" /><path d="M7 10H4v11h3" /></Svg>
);
export const IconThumbDown = (p: IconProps) => (
  <Svg {...p}><path d="M17 3v11l-4.5 7a2.2 2.2 0 0 1-2-3l1-4H5.7a2.2 2.2 0 0 1-2.1-2.8l1.8-6.4A2.2 2.2 0 0 1 7.5 3z" /><path d="M17 14h3V3h-3" /></Svg>
);
export const IconWarning = (p: IconProps) => (
  <Svg {...p}><path d="M12 4.5 21 19.5H3z" /><path d="M12 10v4M12 17h.01" /></Svg>
);
export const IconSpark = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M18.4 5.6l-3.2 3.2M8.8 15.2l-3.2 3.2" /></Svg>
);
export const IconPin = (p: IconProps) => (
  <Svg {...p}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.8" /></Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconMinus = (p: IconProps) => (
  <Svg {...p}><path d="M5 12h14" /></Svg>
);
export const IconBag = (p: IconProps) => (
  <Svg {...p}><path d="M6 7h12l1 14H5z" /><path d="M9 7V5.5a3 3 0 0 1 6 0V7" /></Svg>
);
export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
);

/* Floor-plan furniture */
export const IconTv = (p: IconProps) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="12" rx="1.6" /><path d="M8 21h8M12 17v4" /></Svg>
);
export const IconPlant = (p: IconProps) => (
  <Svg {...p}><path d="M12 21v-8" /><path d="M12 13c0-3.3-2.2-6-5.5-6 0 3.3 2.2 6 5.5 6z" /><path d="M12 13c0-3.9 2.6-7 6-7 0 3.9-2.6 7-6 7z" /><path d="M8 21h8" /></Svg>
);
export const IconSofa = (p: IconProps) => (
  <Svg {...p}><path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" /><path d="M2.5 12.5a1.8 1.8 0 0 1 3.5.7V16h12v-2.8a1.8 1.8 0 0 1 3.5-.7V18H2.5z" /><path d="M5 18v2M19 18v2" /></Svg>
);
export const IconClipboard = (p: IconProps) => (
  <Svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9 10h6M9 14h4" /></Svg>
);

/**
 * The icons an offer may carry, keyed by the name stored on the row.
 *
 * The backend validates against the same key list, so an offer can never name
 * an icon this map cannot draw.
 */

/**
 * The icons an offer may carry, keyed by the name stored on the row.
 *
 * The backend validates against the same key list, so an offer can never name
 * an icon this map cannot draw.
 */
export const OFFER_ICONS: Record<string, (p: IconProps) => ReactNode> = {
  flame: IconFlame,
  chicken: IconChicken,
  meat: IconMeat,
  pepper: IconPepper,
  drink: IconDrink,
  plate: IconPlate,
  group: IconGroup,
  calendar: IconCalendar,
  clock: IconClock,
  music: IconMusic,
  spark: IconSpark,
  bag: IconBag,
};

export const OFFER_ICON_KEYS = Object.keys(OFFER_ICONS);

/** Draws an offer's icon, falling back to the flame for an unknown key. */
export function OfferIcon({ name, size = 20, className }: IconProps & { name: string }) {
  const Icon = OFFER_ICONS[name] ?? IconFlame;
  return <Icon size={size} className={className} />;
}
