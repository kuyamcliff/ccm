import { useEffect, useState } from "react";
import type { RestaurantTable } from "../api";

interface Props {
  tables: RestaurantTable[];
  selected: number | null;
  onSelect: (id: number) => void;
  partySize?: number;
}

type FurnitureType = "tv" | "bar" | "plant" | "sofa" | "host" | "stage";
interface Furniture { id: string; type: FurnitureType; x: number; y: number; label?: string; }

const FURNITURE_STORAGE_KEY = "fp_furniture_v1";

const SVG_W = 800;
const SVG_H = 530;
const INDOOR_H = 350;
const OUTDOOR_Y = 375;

function loadFurniture(): Furniture[] {
  try { return JSON.parse(localStorage.getItem(FURNITURE_STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function tableRadius(capacity: number) {
  return capacity >= 8 ? 34 : capacity >= 6 ? 28 : capacity >= 4 ? 22 : 17;
}

function ChairDots({ cx, cy, r, capacity, status }: {
  cx: number; cy: number; r: number; capacity: number; status: string;
}) {
  const count = Math.min(capacity, 8);
  const chairR = 4.5;
  const gap = r + 10;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
        return (
          <circle
            key={i}
            cx={cx + gap * Math.cos(angle)}
            cy={cy + gap * Math.sin(angle)}
            r={chairR}
            fill={status === "reserved" ? "rgba(212,37,37,0.55)" : status === "selected" ? "rgba(212,130,37,0.6)" : "rgba(58,155,111,0.45)"}
            stroke={status === "reserved" ? "rgba(212,37,37,0.25)" : "rgba(58,155,111,0.2)"}
            strokeWidth={0.8}
          />
        );
      })}
    </>
  );
}

function FurnitureShape({ f }: { f: Furniture }) {
  if (f.type === "tv") return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={f.x} y={f.y} width={70} height={40} rx={3} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
      <rect x={f.x + 3} y={f.y + 3} width={64} height={28} rx={2} fill="rgba(30,60,120,0.35)" stroke="rgba(80,130,220,0.3)" strokeWidth={1} />
      <line x1={f.x + 28} y1={f.y + 40} x2={f.x + 42} y2={f.y + 40} stroke="rgba(255,255,255,0.15)" strokeWidth={3} strokeLinecap="round" />
      <line x1={f.x + 35} y1={f.y + 43} x2={f.x + 35} y2={f.y + 46} stroke="rgba(255,255,255,0.15)" strokeWidth={2} />
      <text x={f.x + 35} y={f.y + 18} textAnchor="middle" fill="rgba(80,140,220,0.7)" style={{ fontSize: 9, fontFamily: "var(--sans)" }}>TV</text>
    </g>
  );

  if (f.type === "bar") return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={f.x} y={f.y} width={18} height={80} rx={4} fill="rgba(160,100,40,0.25)" stroke="rgba(200,140,60,0.4)" strokeWidth={1.5} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={f.x + 9} cy={f.y + 10 + i * 20} r={4} fill="rgba(200,140,60,0.2)" stroke="rgba(200,140,60,0.35)" strokeWidth={1} />
      ))}
      <text x={f.x + 9} y={f.y + 93} textAnchor="middle" fill="rgba(200,140,60,0.7)" style={{ fontSize: 8, fontFamily: "var(--sans)" }}>Bar</text>
    </g>
  );

  if (f.type === "plant") return (
    <g style={{ pointerEvents: "none" }}>
      <circle cx={f.x + 10} cy={f.y + 10} r={10} fill="rgba(30,100,40,0.3)" stroke="rgba(40,140,60,0.4)" strokeWidth={1.2} />
      <circle cx={f.x + 4}  cy={f.y + 6}  r={6}  fill="rgba(40,120,50,0.4)" stroke="rgba(50,160,70,0.3)" strokeWidth={1} />
      <circle cx={f.x + 16} cy={f.y + 5}  r={6}  fill="rgba(40,120,50,0.4)" stroke="rgba(50,160,70,0.3)" strokeWidth={1} />
      <circle cx={f.x + 10} cy={f.y + 2}  r={5}  fill="rgba(50,140,60,0.4)" stroke="rgba(60,170,80,0.3)" strokeWidth={1} />
    </g>
  );

  if (f.type === "sofa") return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={f.x} y={f.y + 10} width={64} height={28} rx={8} fill="rgba(80,60,40,0.35)" stroke="rgba(140,100,60,0.4)" strokeWidth={1.5} />
      <rect x={f.x + 5} y={f.y} width={54} height={14} rx={5} fill="rgba(100,75,50,0.35)" stroke="rgba(140,100,60,0.35)" strokeWidth={1} />
      <rect x={f.x} y={f.y + 8} width={10} height={30} rx={5} fill="rgba(90,68,45,0.35)" stroke="rgba(140,100,60,0.35)" strokeWidth={1} />
      <rect x={f.x + 54} y={f.y + 8} width={10} height={30} rx={5} fill="rgba(90,68,45,0.35)" stroke="rgba(140,100,60,0.35)" strokeWidth={1} />
      <text x={f.x + 32} y={f.y + 53} textAnchor="middle" fill="rgba(180,130,80,0.6)" style={{ fontSize: 8, fontFamily: "var(--sans)" }}>Lounge</text>
    </g>
  );

  if (f.type === "host") return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={f.x} y={f.y} width={30} height={22} rx={3} fill="rgba(80,80,120,0.3)" stroke="rgba(100,100,180,0.4)" strokeWidth={1.5} />
      <rect x={f.x + 2} y={f.y + 2} width={26} height={14} rx={2} fill="rgba(40,40,80,0.4)" />
      <text x={f.x + 15} y={f.y + 34} textAnchor="middle" fill="rgba(120,120,200,0.6)" style={{ fontSize: 8, fontFamily: "var(--sans)" }}>Host</text>
    </g>
  );

  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={f.x} y={f.y} width={120} height={35} rx={4} fill="rgba(212,37,37,0.07)" stroke="rgba(212,37,37,0.25)" strokeWidth={1.5} strokeDasharray="4,3" />
      <text x={f.x + 60} y={f.y + 22} textAnchor="middle" fill="rgba(212,37,37,0.45)" style={{ fontSize: 10, fontFamily: "var(--sans)", letterSpacing: "0.08em" }}>STAGE</text>
    </g>
  );
}

export function TableMap({ tables, selected, onSelect, partySize = 1 }: Props) {
  const [furniture, setFurniture] = useState<Furniture[]>([]);

  useEffect(() => {
    setFurniture(loadFurniture());
    const onStorage = () => setFurniture(loadFurniture());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function getStatus(t: RestaurantTable) {
    if (selected === t.id) return "selected";
    if (!t.available) return "reserved";
    return "available";
  }

  function handleClick(t: RestaurantTable) {
    if (!t.available) return;
    onSelect(t.id);
  }

  const activeTables = tables.filter((t) => (t as RestaurantTable & { active?: number }).active !== 0);

  return (
    <div className="table-map-wrapper">
      <div className="table-map-legend">
        <span className="legend-item available">Available</span>
        <span className="legend-item reserved">Reserved</span>
        <span className="legend-item selected">Your selection</span>
      </div>

      <div className="table-map">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Restaurant floor plan"
          style={{ width: "100%", display: "block" }}
        >
          <defs>
            <pattern id="pub-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="0.5" cy="0.5" r="0.7" fill="rgba(255,255,255,0.055)" />
            </pattern>
            <radialGradient id="pub-grill-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(212,37,37,0.3)" />
              <stop offset="100%" stopColor="rgba(212,37,37,0)" />
            </radialGradient>
            <radialGradient id="pub-avail-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(58,155,111,0.22)" />
              <stop offset="100%" stopColor="rgba(58,155,111,0)" />
            </radialGradient>
            <radialGradient id="pub-sel-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(212,130,37,0.28)" />
              <stop offset="100%" stopColor="rgba(212,130,37,0)" />
            </radialGradient>
            <radialGradient id="pub-resv-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(212,37,37,0.22)" />
              <stop offset="100%" stopColor="rgba(212,37,37,0)" />
            </radialGradient>
          </defs>

          {/* Floor */}
          <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="#0a0a0a" />
          <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="url(#pub-dots)" />

          {/* Indoor zone */}
          <rect x={6} y={6} width={SVG_W - 12} height={INDOOR_H}
            rx={8} fill="rgba(255,255,255,0.014)" stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
          <text x={18} y={26} className="fp-zone-label">Indoor · Main hall</text>

          {/* Entrance */}
          <rect x={6} y={INDOOR_H / 2 - 30} width={5} height={60} rx={2.5} fill="rgba(255,255,255,0.3)" />
          <text x={17} y={INDOOR_H / 2 - 6} className="fp-zone-sub">Entrance</text>
          <text x={17} y={INDOOR_H / 2 + 8} className="fp-zone-sub">↑</text>

          {/* Grill / Kitchen */}
          <rect x={SVG_W - 138} y={14} width={126} height={64} rx={6}
            fill="rgba(212,37,37,0.07)" stroke="rgba(212,37,37,0.25)" strokeWidth={1.2} />
          <circle cx={SVG_W - 75} cy={46} r={26} fill="url(#pub-grill-glow)" />
          <text x={SVG_W - 75} y={40} textAnchor="middle" fill="rgba(212,37,37,0.6)" style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: 2 }}>▲▲▲</text>
          <text x={SVG_W - 75} y={58} textAnchor="middle" fill="rgba(212,37,37,0.5)" style={{ fontSize: 9, fontFamily: "var(--sans)", letterSpacing: "0.06em" }}>Charcoal Grill</text>

          {/* Outdoor terrace */}
          <rect x={6} y={OUTDOOR_Y} width={SVG_W - 12} height={SVG_H - OUTDOOR_Y - 6}
            rx={8} fill="rgba(255,255,255,0.008)"
            stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} strokeDasharray="6,5" />
          <text x={18} y={OUTDOOR_Y + 22} className="fp-zone-label">Outdoor terrace</text>

          {/* Zone divider */}
          <line x1={20} y1={OUTDOOR_Y - 12} x2={SVG_W - 20} y2={OUTDOOR_Y - 12}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="5,7" />

          {/* Furniture */}
          {furniture.map((f) => (
            <FurnitureShape key={f.id} f={f} />
          ))}

          {/* Tables */}
          {activeTables.map((t) => {
            const r = tableRadius(t.capacity);
            const cx = t.pos_x + r;
            const cy = t.pos_y + r;
            const status = getStatus(t);

            const circleFill = status === "selected"
              ? "rgba(212,130,37,0.18)"
              : status === "reserved" ? "rgba(212,37,37,0.13)" : "rgba(58,155,111,0.1)";
            const circleStroke = status === "selected"
              ? "rgba(212,130,37,0.85)"
              : status === "reserved" ? "rgba(212,37,37,0.7)" : "rgba(58,155,111,0.65)";
            const labelColor = status === "selected" ? "#d48225" : status === "reserved" ? "#e07070" : "#7ac7a8";
            const glowId = status === "selected" ? "url(#pub-sel-glow)" : status === "reserved" ? "url(#pub-resv-glow)" : "url(#pub-avail-glow)";

            return (
              <g
                key={t.id}
                onClick={() => handleClick(t)}
                role="button"
                aria-label={`Table ${t.label}, ${t.capacity} seats, ${status}`}
                aria-pressed={selected === t.id}
                tabIndex={t.available ? 0 : -1}
                style={{ cursor: t.available ? "pointer" : "not-allowed" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleClick(t);
                }}
              >
                <circle cx={cx} cy={cy} r={r + 14} fill={glowId} opacity={0.6} />
                <ChairDots cx={cx} cy={cy} r={r} capacity={t.capacity} status={status} />
                <circle
                  cx={cx} cy={cy} r={r}
                  fill={circleFill}
                  stroke={circleStroke}
                  strokeWidth={status === "selected" ? 2 : 1.5}
                />
                <text x={cx} y={cy - 4} textAnchor="middle" fill={labelColor}
                  style={{ fontSize: r > 20 ? 12 : 10, fontWeight: 700, fontFamily: "Space Mono, monospace", pointerEvents: "none" }}>
                  {t.label}
                </text>
                <text x={cx} y={cy + 9} textAnchor="middle" fill="rgba(255,255,255,0.28)"
                  style={{ fontSize: 8, fontFamily: "Space Mono, monospace", pointerEvents: "none" }}>
                  {t.capacity}p
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selected && (() => {
        const t = tables.find((x) => x.id === selected);
        return t ? (
          <p className="table-selected-info">
            Selected: <strong>Table {t.label}</strong> · {t.capacity} seats ·{" "}
            {t.zone === "outdoor" ? "Outdoor terrace" : "Indoor main hall"}
            {partySize > t.capacity && (
              <span className="table-warning">This table seats {t.capacity}, your party is {partySize}</span>
            )}
          </p>
        ) : null;
      })()}
    </div>
  );
}
