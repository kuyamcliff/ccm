import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { RestaurantTable, Reservation } from "../../api";
import {
  IconClipboard, IconDrink, IconMusic, IconPlant, IconSofa, IconTv,
} from "../../components/Icons";
import { useLanguage } from "../../i18n/context";

type AdminTable = RestaurantTable & { today_count: number };
type AdminReservation = Reservation & { user_name: string; user_email: string };

type FurnitureType = "tv" | "bar" | "plant" | "sofa" | "host" | "stage";
interface Furniture {
  id: string; type: FurnitureType; x: number; y: number; label?: string;
}

interface Tooltip { x: number; y: number; table: AdminTable; res: AdminReservation | undefined; }
interface AddTableForm { label: string; capacity: number; zone: string; pos_x: number; pos_y: number; }
interface EditTableForm { label: string; capacity: number; zone: string; }

const SVG_W = 800;
const SVG_H = 530;
const INDOOR_H = 350;
const OUTDOOR_Y = 375;

const FURNITURE_LABEL_KEYS: Record<FurnitureType, string> = {
  tv: "furnitureTv", bar: "furnitureBar", plant: "furniturePlant", sofa: "furnitureSofa", host: "furnitureHost", stage: "furnitureStage",
};

const FURNITURE_ICONS: Record<FurnitureType, (p: { size?: number }) => React.ReactNode> = {
  tv: IconTv, bar: IconDrink, plant: IconPlant, sofa: IconSofa, host: IconClipboard, stage: IconMusic,
};

const FURNITURE_DEFAULTS: Record<FurnitureType, Furniture> = {
  tv:    { id: "", type: "tv",    x: 400, y: 20,  label: "TV" },
  bar:   { id: "", type: "bar",   x: 30,  y: 100, label: "Bar" },
  plant: { id: "", type: "plant", x: 300, y: 300, label: "" },
  sofa:  { id: "", type: "sofa",  x: 150, y: 280, label: "Lounge" },
  host:  { id: "", type: "host",  x: 20,  y: 175, label: "Host" },
  stage: { id: "", type: "stage", x: 250, y: 390, label: "Stage" },
};

const FURNITURE_STORAGE_KEY = "fp_furniture_v1";

function loadFurniture(): Furniture[] {
  try { return JSON.parse(localStorage.getItem(FURNITURE_STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveFurniture(items: Furniture[]) {
  localStorage.setItem(FURNITURE_STORAGE_KEY, JSON.stringify(items));
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
            fill={status === "reserved" ? "rgba(212,37,37,0.55)" : status === "dragging" ? "rgba(212,37,37,0.7)" : "rgba(58,155,111,0.45)"}
            stroke={status === "reserved" ? "rgba(212,37,37,0.25)" : "rgba(58,155,111,0.2)"}
            strokeWidth={0.8}
          />
        );
      })}
    </>
  );
}

function FurnitureShape({ f, editMode, onMouseDown }: {
  f: Furniture; editMode: boolean; onMouseDown: (e: React.MouseEvent, id: string) => void;
}) {
  const { t } = useLanguage();
  const tf = (key: string) => t("adminTableEditor", key);
  const baseStyle: React.CSSProperties = { cursor: editMode ? "grab" : "default" };
  const common = { onMouseDown: (e: React.MouseEvent) => onMouseDown(e, f.id) };

  if (f.type === "tv") return (
    <g style={baseStyle} {...common}>
      <rect x={f.x} y={f.y} width={70} height={40} rx={3} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
      <rect x={f.x + 3} y={f.y + 3} width={64} height={28} rx={2} fill="rgba(30,60,120,0.35)" stroke="rgba(80,130,220,0.3)" strokeWidth={1} />
      <line x1={f.x + 28} y1={f.y + 40} x2={f.x + 42} y2={f.y + 40} stroke="rgba(255,255,255,0.15)" strokeWidth={3} strokeLinecap="round" />
      <line x1={f.x + 35} y1={f.y + 43} x2={f.x + 35} y2={f.y + 46} stroke="rgba(255,255,255,0.15)" strokeWidth={2} />
      <text x={f.x + 35} y={f.y + 18} textAnchor="middle" fill="rgba(80,140,220,0.7)" style={{ fontSize: 9, fontFamily: "var(--sans)" }}>{tf("furnitureTv")}</text>
    </g>
  );

  if (f.type === "bar") return (
    <g style={baseStyle} {...common}>
      <rect x={f.x} y={f.y} width={18} height={80} rx={4} fill="rgba(160,100,40,0.25)" stroke="rgba(200,140,60,0.4)" strokeWidth={1.5} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={f.x + 9} cy={f.y + 10 + i * 20} r={4} fill="rgba(200,140,60,0.2)" stroke="rgba(200,140,60,0.35)" strokeWidth={1} />
      ))}
      <text x={f.x + 9} y={f.y + 93} textAnchor="middle" fill="rgba(200,140,60,0.7)" style={{ fontSize: 8, fontFamily: "var(--sans)" }}>{tf("furnitureBar")}</text>
    </g>
  );

  if (f.type === "plant") return (
    <g style={baseStyle} {...common}>
      <circle cx={f.x + 10} cy={f.y + 10} r={10} fill="rgba(30,100,40,0.3)" stroke="rgba(40,140,60,0.4)" strokeWidth={1.2} />
      <circle cx={f.x + 4}  cy={f.y + 6}  r={6}  fill="rgba(40,120,50,0.4)" stroke="rgba(50,160,70,0.3)" strokeWidth={1} />
      <circle cx={f.x + 16} cy={f.y + 5}  r={6}  fill="rgba(40,120,50,0.4)" stroke="rgba(50,160,70,0.3)" strokeWidth={1} />
      <circle cx={f.x + 10} cy={f.y + 2}  r={5}  fill="rgba(50,140,60,0.4)" stroke="rgba(60,170,80,0.3)" strokeWidth={1} />
    </g>
  );

  if (f.type === "sofa") return (
    <g style={baseStyle} {...common}>
      <rect x={f.x} y={f.y + 10} width={64} height={28} rx={8} fill="rgba(80,60,40,0.35)" stroke="rgba(140,100,60,0.4)" strokeWidth={1.5} />
      <rect x={f.x + 5} y={f.y} width={54} height={14} rx={5} fill="rgba(100,75,50,0.35)" stroke="rgba(140,100,60,0.35)" strokeWidth={1} />
      <rect x={f.x} y={f.y + 8} width={10} height={30} rx={5} fill="rgba(90,68,45,0.35)" stroke="rgba(140,100,60,0.35)" strokeWidth={1} />
      <rect x={f.x + 54} y={f.y + 8} width={10} height={30} rx={5} fill="rgba(90,68,45,0.35)" stroke="rgba(140,100,60,0.35)" strokeWidth={1} />
      <text x={f.x + 32} y={f.y + 53} textAnchor="middle" fill="rgba(180,130,80,0.6)" style={{ fontSize: 8, fontFamily: "var(--sans)" }}>{tf("furnitureSofa")}</text>
    </g>
  );

  if (f.type === "host") return (
    <g style={baseStyle} {...common}>
      <rect x={f.x} y={f.y} width={30} height={22} rx={3} fill="rgba(80,80,120,0.3)" stroke="rgba(100,100,180,0.4)" strokeWidth={1.5} />
      <rect x={f.x + 2} y={f.y + 2} width={26} height={14} rx={2} fill="rgba(40,40,80,0.4)" />
      <text x={f.x + 15} y={f.y + 34} textAnchor="middle" fill="rgba(120,120,200,0.6)" style={{ fontSize: 8, fontFamily: "var(--sans)" }}>{tf("furnitureHost")}</text>
    </g>
  );

  // stage
  return (
    <g style={baseStyle} {...common}>
      <rect x={f.x} y={f.y} width={120} height={35} rx={4} fill="rgba(212,37,37,0.07)" stroke="rgba(212,37,37,0.25)" strokeWidth={1.5} strokeDasharray="4,3" />
      <text x={f.x + 60} y={f.y + 22} textAnchor="middle" fill="rgba(212,37,37,0.45)" style={{ fontSize: 10, fontFamily: "var(--sans)", letterSpacing: "0.08em" }}>{tf("furnitureStageCaps")}</text>
    </g>
  );
}

export function AdminTableEditor() {
  const { t } = useLanguage();
  const tf = (key: string) => t("adminTableEditor", key);
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);

  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [detailRes, setDetailRes] = useState<AdminReservation | null>(null);
  const [detailTable, setDetailTable] = useState<AdminTable | null>(null);

  // Table drag
  const [dragging, setDragging] = useState<{ id: number; offsetX: number; offsetY: number } | null>(null);
  const [didDrag, setDidDrag] = useState(false);
  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({});

  // Furniture
  const [furniture, setFurniture] = useState<Furniture[]>(loadFurniture);
  const [draggingFurniture, setDraggingFurniture] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [addFurnitureOpen, setAddFurnitureOpen] = useState(false);
  const [removeFurnitureId, setRemoveFurnitureId] = useState<string | null>(null);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddTableForm>({ label: "", capacity: 4, zone: "indoor", pos_x: 120, pos_y: 120 });
  const [addBusy, setAddBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminTable | null>(null);
  const [editForm, setEditForm] = useState<EditTableForm>({ label: "", capacity: 4, zone: "indoor" });
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminTable | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const [tr, rr] = await Promise.all([
        api.admin.tables(),
        api.admin.reservations({ date: todayLocal(), status: "confirmed" }),
      ]);
      setTables(tr.tables);
      setPositions(Object.fromEntries(tr.tables.map((t) => [t.id, { x: t.pos_x, y: t.pos_y }])));
      setReservations(rr.reservations);
    } catch (e) {
      setError(e instanceof Error ? e.message : tf("errLoad"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function resForTable(tableId: number) {
    return reservations.find((r) => {
      const t = tables.find((x) => x.label === r.table_label);
      return t?.id === tableId;
    });
  }

  function svgPoint(e: React.MouseEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (SVG_W / rect.width),
      y: (e.clientY - rect.top) * (SVG_H / rect.height),
    };
  }

  // ── Table drag ──

  function onTableMouseDown(e: React.MouseEvent, t: AdminTable) {
    if (!editMode) return;
    e.stopPropagation();
    setDidDrag(false);
    const pt = svgPoint(e);
    const pos = positions[t.id] ?? { x: t.pos_x, y: t.pos_y };
    const r = tableRadius(t.capacity);
    setDragging({ id: t.id, offsetX: pt.x - (pos.x + r), offsetY: pt.y - (pos.y + r) });
  }

  const onSvgMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) {
        setDidDrag(true);
        const pt = svgPoint(e);
        const r = tableRadius(tables.find((t) => t.id === dragging.id)?.capacity ?? 4);
        setPositions((p) => ({
          ...p,
          [dragging.id]: {
            x: Math.max(0, Math.min(SVG_W - r * 2, pt.x - dragging.offsetX - r)),
            y: Math.max(0, Math.min(SVG_H - r * 2, pt.y - dragging.offsetY - r)),
          },
        }));
      }
      if (draggingFurniture) {
        setDidDrag(true);
        const pt = svgPoint(e);
        setFurniture((items) => items.map((f) =>
          f.id === draggingFurniture.id
            ? { ...f, x: Math.round(pt.x - draggingFurniture.offsetX), y: Math.round(pt.y - draggingFurniture.offsetY) }
            : f
        ));
      }
    },
    [dragging, draggingFurniture, tables]
  );

  async function onSvgMouseUp() {
    if (dragging) {
      const pos = positions[dragging.id];
      const id = dragging.id;
      setDragging(null);
      if (pos) {
        try {
          await api.admin.updateTable(id, { pos_x: Math.round(pos.x), pos_y: Math.round(pos.y) });
          setTables((ts) => ts.map((t) => t.id === id ? { ...t, pos_x: Math.round(pos.x), pos_y: Math.round(pos.y) } : t));
        } catch {
          setError(tf("errSavePosition"));
          await load();
        }
      }
    }
    if (draggingFurniture) {
      setDraggingFurniture(null);
      saveFurniture(furniture);
    }
  }

  function onTableClick(e: React.MouseEvent, t: AdminTable) {
    e.stopPropagation();
    if (editMode && !didDrag) {
      setEditTarget(t);
      setEditForm({ label: t.label, capacity: t.capacity, zone: t.zone });
    }
  }

  function onTableMouseEnter(e: React.MouseEvent, t: AdminTable) {
    if (editMode) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const res = resForTable(t.id);
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, table: t, res });
  }
  function onTableMouseLeave() { setTooltip(null); }

  function onTableMouseMove(e: React.MouseEvent, t: AdminTable) {
    if (editMode) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const res = resForTable(t.id);
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, table: t, res });
  }

  // ── Furniture drag ──

  function onFurnitureMouseDown(e: React.MouseEvent, id: string) {
    if (!editMode) return;
    e.stopPropagation();
    setDidDrag(false);
    const pt = svgPoint(e);
    const f = furniture.find((x) => x.id === id);
    if (!f) return;
    setDraggingFurniture({ id, offsetX: pt.x - f.x, offsetY: pt.y - f.y });
  }

  function addFurniture(type: FurnitureType) {
    const def = FURNITURE_DEFAULTS[type];
    const newItem: Furniture = { ...def, id: `${type}_${Date.now()}` };
    const updated = [...furniture, newItem];
    setFurniture(updated);
    saveFurniture(updated);
    setAddFurnitureOpen(false);
  }

  function removeFurniture(id: string) {
    const updated = furniture.filter((f) => f.id !== id);
    setFurniture(updated);
    saveFurniture(updated);
    setRemoveFurnitureId(null);
  }

  // ── Add table ──

  async function doAdd() {
    setAddBusy(true);
    try {
      const r = await api.admin.createTable(addForm);
      const newTable = { ...r.table, today_count: 0 } as AdminTable;
      setTables((ts) => [...ts, newTable]);
      setPositions((p) => ({ ...p, [r.table.id]: { x: r.table.pos_x, y: r.table.pos_y } }));
      setAddOpen(false);
      setAddForm({ label: "", capacity: 4, zone: "indoor", pos_x: 120, pos_y: 120 });
    } catch (e) {
      setError(e instanceof Error ? e.message : tf("errAddTable"));
    } finally {
      setAddBusy(false);
    }
  }

  // ── Edit table ──

  async function doEditTable() {
    if (!editTarget) return;
    setEditBusy(true);
    try {
      await api.admin.updateTable(editTarget.id, {
        label: editForm.label,
        capacity: editForm.capacity,
        zone: editForm.zone,
      });
      setTables((ts) => ts.map((t) =>
        t.id === editTarget.id ? { ...t, label: editForm.label, capacity: editForm.capacity, zone: editForm.zone } : t
      ));
      setEditTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : tf("errUpdateTable"));
    } finally {
      setEditBusy(false);
    }
  }

  // ── Delete table ──

  async function doDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await api.admin.deleteTable(id);
      setTables((ts) => ts.filter((t) => t.id !== id));
      setPositions((p) => { const n = { ...p }; delete n[id]; return n; });
    } catch (e) {
      setError(e instanceof Error ? e.message : tf("errRemoveTable"));
    }
  }

  const activeTables = tables.filter((t) => t.active !== 0);
  const reservedCount = activeTables.filter((t) => !!resForTable(t.id)).length;
  const availableCount = activeTables.length - reservedCount;
  const reservedTables = activeTables
    .map((t) => ({ table: t, res: resForTable(t.id) }))
    .filter((x) => x.res)
    .sort((a, b) => (a.res!.time ?? "").localeCompare(b.res!.time ?? ""));

  return (
    <div>
      <div className="fp-header">
        <div>
          <p className="fp-eyebrow">{tf("eyebrow")}</p>
          <h1 className="fp-title">{tf("title")}</h1>
        </div>
        <div className="fp-toolbar">
          {editMode && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => setAddFurnitureOpen(true)}>{tf("addFurniture")}</button>
              <button className="btn btn-amber btn-sm" onClick={() => setAddOpen(true)}>{tf("addTable")}</button>
            </>
          )}
          <button
            className={`btn btn-sm ${editMode ? "btn-amber" : "btn-outline"}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? tf("doneEditing") : tf("editLayout")}
          </button>
        </div>
      </div>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">{tf("loading")}</p>
      ) : (
        <div className="fp-body">
          {/* Map column */}
          <div className="fp-map-col">
            <div className="fp-legend">
              <span className="fp-leg fp-leg-avail">{tf("available")}</span>
              <span className="fp-leg fp-leg-resv">{tf("reserved")}</span>
              {editMode ? (
                <span className="fp-leg-hint">{tf("editHint")}</span>
              ) : (
                <span className="fp-leg-hint">{tf("viewHint")}</span>
              )}
            </div>

            <div className="fp-wrap" ref={wrapRef}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className={`fp-svg${editMode ? " edit-mode" : ""}`}
                onMouseMove={onSvgMouseMove}
                onMouseUp={onSvgMouseUp}
                onMouseLeave={() => { setDragging(null); setDraggingFurniture(null); setTooltip(null); }}
              >
                <defs>
                  <pattern id="fp-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="0.5" cy="0.5" r="0.7" fill="rgba(255,255,255,0.055)" />
                  </pattern>
                  <radialGradient id="fp-grill-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(212,37,37,0.3)" />
                    <stop offset="100%" stopColor="rgba(212,37,37,0)" />
                  </radialGradient>
                  <radialGradient id="fp-avail-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(58,155,111,0.22)" />
                    <stop offset="100%" stopColor="rgba(58,155,111,0)" />
                  </radialGradient>
                  <radialGradient id="fp-resv-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(212,37,37,0.22)" />
                    <stop offset="100%" stopColor="rgba(212,37,37,0)" />
                  </radialGradient>
                  <filter id="fp-shadow">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.5)" />
                  </filter>
                </defs>

                {/* Floor */}
                <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="#0a0a0a" />
                <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="url(#fp-dots)" />

                {/* ── Indoor zone ── */}
                <rect x={6} y={6} width={SVG_W - 12} height={INDOOR_H}
                  rx={8} fill="rgba(255,255,255,0.014)" stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
                <text x={18} y={26} className="fp-zone-label">{tf("indoorMainHall")}</text>

                {/* Entrance */}
                <rect x={6} y={INDOOR_H / 2 - 30} width={5} height={60} rx={2.5} fill="rgba(255,255,255,0.3)" />
                <text x={17} y={INDOOR_H / 2 - 6} className="fp-zone-sub">{tf("entrance")}</text>
                <text x={17} y={INDOOR_H / 2 + 8} className="fp-zone-sub">↑</text>

                {/* ── Grill / Kitchen ── */}
                <rect x={SVG_W - 138} y={14} width={126} height={64} rx={6}
                  fill="rgba(212,37,37,0.07)" stroke="rgba(212,37,37,0.25)" strokeWidth={1.2} />
                <circle cx={SVG_W - 75} cy={46} r={26} fill="url(#fp-grill-glow)" />
                <text x={SVG_W - 75} y={40} textAnchor="middle" fill="rgba(212,37,37,0.6)" style={{ fontSize: 11, fontFamily: "var(--mono)", letterSpacing: 2 }}>▲▲▲</text>
                <text x={SVG_W - 75} y={58} textAnchor="middle" fill="rgba(212,37,37,0.5)" style={{ fontSize: 9, fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{tf("charcoalGrill")}</text>

                {/* ── Outdoor terrace ── */}
                <rect x={6} y={OUTDOOR_Y} width={SVG_W - 12} height={SVG_H - OUTDOOR_Y - 6}
                  rx={8} fill="rgba(255,255,255,0.008)"
                  stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} strokeDasharray="6,5" />
                <text x={18} y={OUTDOOR_Y + 22} className="fp-zone-label">{tf("outdoorTerrace")}</text>

                {/* Zone divider */}
                <line x1={20} y1={OUTDOOR_Y - 12} x2={SVG_W - 20} y2={OUTDOOR_Y - 12}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="5,7" />

                {/* ── Furniture ── */}
                {furniture.map((f) => (
                  <FurnitureShape key={f.id} f={f} editMode={editMode} onMouseDown={onFurnitureMouseDown} />
                ))}
                {editMode && furniture.map((f) => (
                  <text
                    key={`del-${f.id}`}
                    x={f.x + (f.type === "bar" ? 9 : f.type === "tv" ? 35 : f.type === "plant" ? 10 : f.type === "host" ? 15 : f.type === "stage" ? 60 : 32)}
                    y={f.y - 4}
                    textAnchor="middle"
                    fill="rgba(212,37,37,0.75)"
                    style={{ fontSize: 10, cursor: "pointer", fontWeight: 700, pointerEvents: "all" }}
                    onClick={(e) => { e.stopPropagation(); setRemoveFurnitureId(f.id); }}
                  >✕</text>
                ))}

                {/* ── Tables ── */}
                {activeTables.map((t) => {
                  const pos = positions[t.id] ?? { x: t.pos_x, y: t.pos_y };
                  const r = tableRadius(t.capacity);
                  const cx = pos.x + r;
                  const cy = pos.y + r;
                  const res = resForTable(t.id);
                  const reserved = !!res;
                  const isDragging = dragging?.id === t.id;
                  const status = isDragging ? "dragging" : reserved ? "reserved" : "available";

                  const circleFill = isDragging
                    ? "rgba(212,37,37,0.2)"
                    : reserved ? "rgba(212,37,37,0.13)" : "rgba(58,155,111,0.1)";
                  const circleStroke = isDragging
                    ? "rgba(212,37,37,0.9)"
                    : reserved ? "rgba(212,37,37,0.7)" : "rgba(58,155,111,0.65)";
                  const labelColor = isDragging ? "#d42525" : reserved ? "#e07070" : "#7ac7a8";

                  return (
                    <g
                      key={t.id}
                      className={`fp-table ${status}${editMode ? " editable" : ""}`}
                      onMouseDown={(e) => onTableMouseDown(e, t)}
                      onClick={(e) => editMode ? onTableClick(e, t) : (res && (setDetailRes(res), setDetailTable(t)))}
                      onMouseEnter={(e) => onTableMouseEnter(e, t)}
                      onMouseMove={(e) => onTableMouseMove(e, t)}
                      onMouseLeave={onTableMouseLeave}
                      style={{ cursor: editMode ? "grab" : reserved ? "pointer" : "default" }}
                    >
                      <circle cx={cx} cy={cy} r={r + 14} fill={reserved ? "url(#fp-resv-glow)" : "url(#fp-avail-glow)"} opacity={0.55} />
                      <ChairDots cx={cx} cy={cy} r={r} capacity={t.capacity} status={status} />
                      <circle cx={cx} cy={cy} r={r} fill={circleFill} stroke={circleStroke} strokeWidth={1.5} filter={isDragging ? "url(#fp-shadow)" : undefined} />
                      <text x={cx} y={cy - 4} textAnchor="middle" fill={labelColor}
                        style={{ fontSize: r > 20 ? 12 : 10, fontWeight: 700, fontFamily: "Space Mono, monospace", pointerEvents: "none" }}>
                        {t.label}
                      </text>
                      <text x={cx} y={cy + 9} textAnchor="middle" fill="rgba(255,255,255,0.28)"
                        style={{ fontSize: 8, fontFamily: "Space Mono, monospace", pointerEvents: "none" }}>
                        {t.capacity}p
                      </text>
                      {editMode && (
                        <text
                          x={cx + r - 2} y={cy - r + 9}
                          textAnchor="middle"
                          fill="rgba(212,37,37,0.8)"
                          style={{ fontSize: 10, cursor: "pointer", fontWeight: 700, pointerEvents: "all" }}
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}
                        >✕</text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip */}
              {tooltip && !editMode && (
                <div
                  className="fp-tooltip"
                  style={{
                    left: Math.min(tooltip.x + 16, (wrapRef.current?.offsetWidth ?? 600) - 160),
                    top: tooltip.y - 12,
                  }}
                >
                  <p className="fp-tooltip-title">{tf("tableLabel").replace("{label}", tooltip.table.label)}</p>
                  <p className="fp-tooltip-cap">{tf("seatsZone").replace("{n}", String(tooltip.table.capacity)).replace("{zone}", tooltip.table.zone === "outdoor" ? tf("zoneOutdoor") : tf("zoneIndoor"))}</p>
                  {tooltip.res ? (
                    <>
                      <div className="fp-tooltip-divider" />
                      <p className="fp-tooltip-name">{tooltip.res.user_name}</p>
                      <p className="fp-tooltip-meta">{tf("timeParty").replace("{time}", tooltip.res.time).replace("{n}", String(tooltip.res.party_size)).replace("{unit}", tooltip.res.party_size === 1 ? tf("person") : tf("people"))}</p>
                      <p className="fp-tooltip-meta">{tooltip.res.phone}</p>
                      {tooltip.res.note && <p className="fp-tooltip-note">"{tooltip.res.note}"</p>}
                      <span className={`badge badge-${tooltip.res.payment_status === "paid" ? "green" : "amber"}`} style={{ fontSize: "0.7rem", marginTop: "0.35rem", display: "inline-block" }}>
                        {tooltip.res.payment_status === "paid" ? tf("paid") : tf("unpaid")}
                      </span>
                      <p className="fp-tooltip-hint">{tf("clickForDetails")}</p>
                    </>
                  ) : (
                    <p className="fp-tooltip-avail">{tf("availableToday")}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="fp-side">
            <div className="fp-side-head">
              <p className="fp-side-date">
                {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <p className="fp-side-label">{tf("today")}</p>
            </div>

            <div className="fp-counts">
              <div className="fp-count fp-count-resv">
                <span className="fp-count-num">{reservedCount}</span>
                <span className="fp-count-lbl">{tf("reserved")}</span>
              </div>
              <div className="fp-count fp-count-avail">
                <span className="fp-count-num">{availableCount}</span>
                <span className="fp-count-lbl">{tf("available")}</span>
              </div>
              <div className="fp-count">
                <span className="fp-count-num">{activeTables.length}</span>
                <span className="fp-count-lbl">{tf("total")}</span>
              </div>
            </div>

            {reservedTables.length === 0 ? (
              <p className="fp-side-empty">{tf("noReservationsToday")}</p>
            ) : (
              <div className="fp-res-list">
                {reservedTables.map(({ table, res }) => (
                  <button
                    key={table.id}
                    className="fp-res-row"
                    onClick={() => { if (res) { setDetailRes(res); setDetailTable(table); } }}
                  >
                    <span className="fp-res-table">{table.label}</span>
                    <div className="fp-res-info">
                      <span className="fp-res-name">{res!.user_name}</span>
                      <span className="fp-res-meta">{res!.time}, {res!.party_size}p</span>
                    </div>
                    <span className={`badge badge-${res!.payment_status === "paid" ? "green" : "amber"}`}>
                      {res!.payment_status === "paid" ? tf("paid") : tf("unpaid")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Guest detail modal ── */}
      {detailRes && detailTable && (
        <div className="modal-backdrop" onClick={() => { setDetailRes(null); setDetailTable(null); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className="modal-title">{tf("tableGuest").replace("{label}", detailTable.label)}</h2>
            <dl className="ticket-rows" style={{ marginTop: "1rem" }}>
              <div><dt>{tf("ccmCode")}</dt><dd style={{ color: "var(--amber)", fontFamily: "var(--mono)", fontSize: "0.88rem" }}>{detailRes.ccm_code ?? ""}</dd></div>
              <div><dt>{tf("name")}</dt><dd>{detailRes.user_name}</dd></div>
              <div><dt>{tf("email")}</dt><dd style={{ fontSize: "0.85rem" }}>{detailRes.user_email}</dd></div>
              <div><dt>{tf("phone")}</dt><dd>{detailRes.phone}</dd></div>
              <div><dt>{tf("time")}</dt><dd>{detailRes.date} at {detailRes.time}</dd></div>
              <div><dt>{tf("party")}</dt><dd>{detailRes.party_size} {detailRes.party_size === 1 ? tf("person") : tf("people")}</dd></div>
              <div><dt>{tf("table")}</dt><dd>{detailTable.label}, {detailTable.capacity} {tf("seats")}, {detailTable.zone === "outdoor" ? tf("zoneOutdoor") : tf("zoneIndoor")}</dd></div>
              <div><dt>{tf("payment")}</dt><dd><span className={`badge badge-${detailRes.payment_status === "paid" ? "green" : "amber"}`}>{detailRes.payment_status === "paid" ? tf("paid") : tf("unpaid")}</span></dd></div>
              {detailRes.note && <div><dt>{tf("note")}</dt><dd style={{ color: "var(--text-muted)", fontStyle: "italic" }}>"{detailRes.note}"</dd></div>}
            </dl>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setDetailRes(null); setDetailTable(null); }}>{tf("close")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit table modal ── */}
      {editTarget && (
        <div className="modal-backdrop" onClick={() => setEditTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className="modal-title">{tf("editTable").replace("{label}", editTarget.label)}</h2>
            <div className="form" style={{ gap: "0.85rem" }}>
              <div className="form-row two">
                <label>
                  {tf("label")}
                  <input type="text" value={editForm.label} onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))} />
                </label>
                <label>
                  {tf("capacity")}
                  <input type="number" min={1} max={20} value={editForm.capacity} onChange={(e) => setEditForm((f) => ({ ...f, capacity: Number(e.target.value) }))} />
                </label>
              </div>
              <label>
                {tf("zone")}
                <select value={editForm.zone} onChange={(e) => setEditForm((f) => ({ ...f, zone: e.target.value }))}>
                  <option value="indoor">{tf("indoor")}</option>
                  <option value="outdoor">{tf("outdoorTerraceOption")}</option>
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" style={{ marginRight: "auto" }} onClick={() => { setDeleteTarget(editTarget); setEditTarget(null); }}>
                {tf("removeTable")}
              </button>
              <button className="btn btn-outline" onClick={() => setEditTarget(null)}>{tf("cancel")}</button>
              <button className="btn btn-amber" disabled={editBusy || !editForm.label.trim()} onClick={doEditTable}>
                {editBusy ? tf("saving") : tf("saveChanges")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add table modal ── */}
      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className="modal-title">{tf("addTableTitle")}</h2>
            <div className="form" style={{ gap: "0.85rem" }}>
              <div className="form-row two">
                <label>
                  {tf("label")}
                  <input type="text" placeholder={tf("labelPlaceholder")} value={addForm.label} onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))} />
                </label>
                <label>
                  {tf("capacity")}
                  <input type="number" min={1} max={20} value={addForm.capacity} onChange={(e) => setAddForm((f) => ({ ...f, capacity: Number(e.target.value) }))} />
                </label>
              </div>
              <label>
                {tf("zone")}
                <select value={addForm.zone} onChange={(e) => setAddForm((f) => ({ ...f, zone: e.target.value }))}>
                  <option value="indoor">{tf("indoor")}</option>
                  <option value="outdoor">{tf("outdoorTerraceOption")}</option>
                </select>
              </label>
              <div className="form-row two">
                <label>{tf("positionX")}<input type="number" min={0} max={SVG_W} value={addForm.pos_x} onChange={(e) => setAddForm((f) => ({ ...f, pos_x: Number(e.target.value) }))} /></label>
                <label>{tf("positionY")}<input type="number" min={0} max={SVG_H} value={addForm.pos_y} onChange={(e) => setAddForm((f) => ({ ...f, pos_y: Number(e.target.value) }))} /></label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setAddOpen(false)}>{tf("cancel")}</button>
              <button className="btn btn-amber" disabled={addBusy || !addForm.label.trim()} onClick={doAdd}>
                {addBusy ? tf("adding") : tf("addTableTitle")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add furniture modal ── */}
      {addFurnitureOpen && (
        <div className="modal-backdrop" onClick={() => setAddFurnitureOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className="modal-title">{tf("addFurnitureTitle")}</h2>
            <div className="fp-furniture-grid">
              {(Object.entries(FURNITURE_LABEL_KEYS) as [FurnitureType, string][]).map(([type, labelKey]) => {
                const Icon = FURNITURE_ICONS[type] ?? IconMusic;
                return (
                  <button key={type} className="fp-furniture-btn" onClick={() => addFurniture(type)}>
                    <span className="fp-furniture-icon"><Icon size={22} /></span>
                    <span>{tf(labelKey)}</span>
                  </button>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setAddFurnitureOpen(false)}>{tf("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete table confirm ── */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className="modal-title">{tf("removeTableTitle").replace("{label}", deleteTarget.label)}</h2>
            <p className="modal-body">{tf("removeTableBody")}</p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>{tf("cancel")}</button>
              <button className="btn btn-danger" onClick={doDelete}>{tf("remove")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove furniture confirm ── */}
      {removeFurnitureId && (
        <div className="modal-backdrop" onClick={() => setRemoveFurnitureId(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className="modal-title">{tf("removeItemTitle")}</h2>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setRemoveFurnitureId(null)}>{tf("cancel")}</button>
              <button className="btn btn-danger" onClick={() => removeFurniture(removeFurnitureId)}>{tf("remove")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
