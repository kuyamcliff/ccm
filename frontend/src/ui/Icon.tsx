/**
 * The icon set.
 *
 * Drawn here rather than pulled from a package: the product needs about forty
 * glyphs, and shipping a library for that costs more bytes than the whole
 * interface. Every icon is built on the same 24 grid with a 1.75 stroke, round
 * caps and round joins, so they sit together as one family.
 *
 * An icon never carries meaning on its own — it is always beside a label, or
 * the button that holds it has an accessible name.
 */

export type IconName =
  | "flame"
  | "menu"
  | "close"
  | "check"
  | "check-circle"
  | "alert"
  | "info"
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "chevron-right"
  | "chevron-down"
  | "plus"
  | "minus"
  | "search"
  | "filter"
  | "refresh"
  | "download"
  | "upload"
  | "trash"
  | "edit"
  | "more"
  | "calendar"
  | "clock"
  | "users"
  | "user"
  | "phone"
  | "mail"
  | "pin"
  | "star"
  | "bag"
  | "basket"
  | "image"
  | "camera"
  | "message"
  | "send"
  | "scan"
  | "ticket"
  | "gift"
  | "tag"
  | "shield"
  | "key"
  | "lock"
  | "logout"
  | "eye"
  | "eye-off"
  | "settings"
  | "chart"
  | "grid"
  | "list"
  | "globe"
  | "wallet"
  | "receipt"
  | "ban"
  | "undo"
  | "external"
  | "sparkle"
  | "thumb-up"
  | "thumb-down"
  | "wifi-off"
  | "smartphone"
  | "tablet"
  | "monitor";

/* Paths are stroked, not filled, unless noted. Coordinates are exact so the
   whole set stays optically aligned at 20px. */
const PATHS: Record<IconName, string> = {
  flame: "M12 3c.6 3.2-1 4.8-2.6 6.4C7.8 11 6.4 12.6 6.4 15a5.6 5.6 0 0 0 11.2 0c0-2.6-1.4-4.2-3-5.8-.6 1.2-1.4 1.8-2.2 2 .6-2.6.6-5.4-.4-8.2Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 13l4 4L19 7",
  "check-circle": "M21 12a9 9 0 1 1-4.6-7.8M9 12l2.5 2.5L20 6",
  alert: "M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.1A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z",
  info: "M12 11v6M12 7.5v.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  "arrow-right": "M4 12h15M13 6l6 6-6 6",
  "arrow-left": "M20 12H5M11 18l-6-6 6-6",
  /* Same shaft length and the same head as the horizontal pair, turned a
     quarter, so the four read as one compass on the plan's nudge pad. */
  "arrow-up": "M12 20V5M6 11l6-6 6 6",
  "arrow-down": "M12 4v15M6 13l6 6 6-6",
  "chevron-right": "M9 5l7 7-7 7",
  "chevron-down": "M5 9l7 7 7-7",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  filter: "M3 5h18l-7 8v6l-4 2v-8L3 5Z",
  refresh: "M20 11a8 8 0 1 0-.6 4M20 4v7h-7",
  download: "M12 3v12M7 11l5 5 5-5M4 20h16",
  upload: "M12 20V8M7 12l5-5 5 5M4 4h16",
  trash: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v5M14 11v5",
  edit: "M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 6.5l3 3",
  more: "M12 6.5v.01M12 12v.01M12 17.5v.01",
  calendar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7ZM4 10h16M8 3v4M16 3v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.2 2",
  users: "M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM22 20v-1.5a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6",
  user: "M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  phone: "M6.5 3h3l1.5 4-2 1.4a12 12 0 0 0 5.6 5.6L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z",
  mail: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3.5 6.5l8.5 6 8.5-6",
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z",
  bag: "M5 8h14l1 12H4L5 8ZM9 8V6a3 3 0 0 1 6 0v2",
  basket: "M3 9h18l-1.6 9.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 9ZM8 9l2-5M16 9l-2-5M10 13v3M14 13v3",
  image: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6ZM4 16l4.5-4.5a2 2 0 0 1 2.8 0L16 16M14.5 14.5l1.7-1.7a2 2 0 0 1 2.8 0L20 14M9 9.5v.01",
  camera: "M3 8a2 2 0 0 1 2-2h2.2l1.4-2h6.8l1.4 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8ZM12 16.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  message: "M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  send: "M21 3 3 10.5l7 3 3 7L21 3ZM10 14l3.5-3.5",
  scan: "M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16",
  ticket: "M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8ZM14 6v12",
  gift: "M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9ZM3 7.5h18V11H3V7.5ZM12 7.5V21M12 7.5C10.5 4 8.8 3 7.6 3.6c-1.5.8-1 3 .8 3.9M12 7.5c1.5-3.5 3.2-4.5 4.4-3.9 1.5.8 1 3-.8 3.9",
  tag: "M4 4h7l9 9-7 7-9-9V4ZM8.5 8.5v.01",
  shield: "M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6l8-3ZM9 12l2 2 4-4",
  key: "M15.5 3a5.5 5.5 0 1 0-4.4 8.8L4 19v2h4v-2h2v-2h2l1.1-1.1A5.5 5.5 0 0 0 15.5 3ZM16.5 7.5v.01",
  lock: "M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM8 11V7.5a4 4 0 0 1 8 0V11M12 15v2.5",
  logout: "M15 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3M11 16l-4-4 4-4M7 12h11",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  "eye-off": "M4 4l16 16M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4M6.3 8.1A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.3 3.3-.7M10 10a3 3 0 0 0 4 4",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M16 4.8v4.4M8 14.8v4.4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  grid: "M4 4h7v7H4V4ZM13 4h7v7h-7V4ZM4 13h7v7H4v-7ZM13 13h7v7h-7v-7Z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z",
  wallet: "M3 8a2 2 0 0 1 2-2h12v3M3 8v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M3 8h16a2 2 0 0 1 2 2v2h-5a2 2 0 0 0 0 4h5",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9.5 8h5M9.5 12h5",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  undo: "M4 8h10a5 5 0 0 1 0 10H8M4 8l4-4M4 8l4 4",
  external: "M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4",
  sparkle: "M12 3l1.8 4.9L18.5 10l-4.7 2.1L12 17l-1.8-4.9L5.5 10l4.7-2.1L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
  "thumb-up": "M7 10v10H4V10h3ZM7 10l4-7a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.4l-1.4 6A2 2 0 0 1 17 20H7",
  "thumb-down": "M17 14V4h3v10h-3ZM17 14l-4 7a2 2 0 0 1-2-2v-4H5.5a2 2 0 0 1-2-2.4l1.4-6A2 2 0 0 1 7 4h10",
  smartphone: "M7.5 2h9a1.5 1.5 0 0 1 1.5 1.5v17a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5v-17A1.5 1.5 0 0 1 7.5 2ZM11 19h2",
  tablet: "M5.5 3h13A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3ZM11 18.5h2",
  monitor: "M3.5 4h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8 21h8M12 17v4",
  "wifi-off": "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3.5-2.3M19 13a10 10 0 0 0-3-2.2M2 9a15 15 0 0 1 5-3.1M22 9a15 15 0 0 0-9.5-3.4M12 20h.01",
};

/** Icons that read better filled than stroked. */
const FILLED = new Set<IconName>(["star", "flame"]);

interface IconProps {
  name: IconName;
  /** Pixel size on the 24 grid. Stick to 16, 20 or 24. */
  size?: number;
  className?: string;
  /** Supply only when the icon is the sole carrier of meaning. */
  title?: string;
}

export function Icon({ name, size = 20, className, title }: IconProps) {
  const filled = FILLED.has(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
