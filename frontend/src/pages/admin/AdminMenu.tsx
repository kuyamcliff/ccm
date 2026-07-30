import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type { MenuItem } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";

const CATEGORIES = ["Grills", "Sides", "Drinks", "Extras"];

const EMPTY: Partial<MenuItem> = {
  category: "Grills",
  name: "",
  description: "",
  price_fcfa: null,
  price_label: "",
  image_url: "",
  position: 0,
  is_active: 1,
};

/** Images are inlined as data URLs, so an oversized file bloats every menu read. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * The menu board.
 *
 * The editor is a side sheet rather than a centred dialog. The form is tall —
 * nine fields and an image preview — and a centred box grew past the viewport
 * on a laptop with no way to reach the save button. A sheet is full height by
 * construction, scrolls its own body, and keeps the actions pinned where they
 * can always be reached.
 */
export function AdminMenu() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | "new" | null>(null);

  const [editItem, setEditItem] = useState<Partial<MenuItem> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  useEffect(() => { void load(); }, []);

  /* The sheet is a modal surface: the page behind it must not scroll, and
     Escape must close it. */
  useEffect(() => {
    if (!editItem) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeEdit(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [editItem]);

  async function load() {
    setLoading(true);
    try {
      const r = await api.admin.getMenu();
      setMenu(r.menu);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the menu.");
    } finally {
      setLoading(false);
    }
  }

  function openNew() { setEditItem({ ...EMPTY }); setIsNew(true); setError(""); }
  function openEdit(item: MenuItem) { setEditItem({ ...item }); setIsNew(false); setError(""); }
  function closeEdit() { setEditItem(null); setIsNew(false); }

  const set = <K extends keyof MenuItem>(k: K, v: MenuItem[K]) =>
    setEditItem((x) => (x ? { ...x, [k]: v } : x));

  async function save() {
    if (!editItem) return;
    if (!editItem.name?.trim()) { setError("Give the item a name."); return; }

    setBusy(isNew ? "new" : (editItem.id ?? null));
    setError("");
    try {
      if (isNew) {
        const r = await api.admin.createMenuItem(editItem);
        setMenu((m) => [...m, r.item]);
      } else if (editItem.id) {
        await api.admin.updateMenuItem(editItem.id, editItem);
        setMenu((m) => m.map((x) => (x.id === editItem.id ? { ...x, ...editItem } as MenuItem : x)));
      }
      closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that item.");
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setBusy(id);
    try {
      await api.admin.deleteMenuItem(id);
      setMenu((m) => m.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that item.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(item: MenuItem) {
    setBusy(item.id);
    try {
      const next = item.is_active ? 0 : 1;
      await api.admin.updateMenuItem(item.id, { is_active: next });
      setMenu((m) => m.map((x) => (x.id === item.id ? { ...x, is_active: next } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update that item.");
    } finally {
      setBusy(null);
    }
  }

  function readImage(file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is over 2 MB. Pick a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => set("image_url", ev.target?.result as string);
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  const categories = useMemo(
    () => Array.from(new Set([...CATEGORIES, ...menu.map((m) => m.category)])),
    [menu]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter(
      (m) =>
        (catFilter === "All" || m.category === catFilter) &&
        (!q || m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q))
    );
  }, [menu, search, catFilter]);

  const liveCount = menu.filter((m) => m.is_active).length;

  return (
    <div className="admin-page amn">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Menu</h1>
          <p className="admin-page-sub mono">{liveCount} live · {menu.length} total</p>
        </div>
        <button className="btn btn-amber btn-sm" onClick={openNew}>Add item</button>
      </div>

      {error && !editItem && <p className="form-error" role="alert">{error}</p>}

      <div className="amn-toolbar">
        <input
          className="amn-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items"
          aria-label="Search menu items"
        />
        <div className="amn-cats">
          {["All", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              className={`filter-chip${catFilter === c ? " active" : ""}`}
              onClick={() => setCatFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="empty-admin">Loading</p>}
      {!loading && visible.length === 0 && <p className="empty-admin">Nothing matches that.</p>}

      <div className="amn-grid">
        {visible.map((item) => (
          <article key={item.id} className={`amn-card${item.is_active ? "" : " is-off"}`}>
            <div className="amn-card-media">
              {item.image_url ? (
                <img src={item.image_url} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="amn-card-blank" aria-hidden="true">{item.name.charAt(0) || "?"}</span>
              )}
              {!item.is_active && <span className="amn-card-flag">Hidden</span>}
            </div>

            <div className="amn-card-body">
              <div className="amn-card-head">
                <h3 className="amn-card-name">{item.name}</h3>
                <span className="amn-card-price mono">
                  {item.price_fcfa
                    ? `${item.price_fcfa.toLocaleString()}`
                    : (item.price_label || "—")}
                </span>
              </div>
              <p className="amn-card-cat mono">{item.category}</p>
              {item.description && <p className="amn-card-desc">{item.description}</p>}
            </div>

            <div className="amn-card-actions">
              <button className="btn btn-sm btn-outline" onClick={() => openEdit(item)} disabled={busy === item.id}>Edit</button>
              <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(item)} disabled={busy === item.id}>
                {item.is_active ? "Hide" : "Show"}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(item)} disabled={busy === item.id}>Delete</button>
            </div>
          </article>
        ))}
      </div>

      {/* ── Editor sheet ── */}
      {editItem && (
        <div className="amn-sheet-backdrop" onMouseDown={closeEdit}>
          <aside
            className="amn-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="amn-sheet-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="amn-sheet-head">
              <h2 className="amn-sheet-title" id="amn-sheet-title">
                {isNew ? "Add menu item" : "Edit menu item"}
              </h2>
              <button type="button" className="amn-sheet-close" onClick={closeEdit} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="amn-sheet-body">
              <label className="amn-field">
                Name
                <input
                  type="text"
                  value={editItem.name ?? ""}
                  maxLength={80}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Grilled chicken, half"
                />
              </label>

              <label className="amn-field">
                Description
                <textarea
                  rows={3}
                  value={editItem.description ?? ""}
                  maxLength={300}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Charcoal all the way, with onions and pepper sauce."
                />
              </label>

              <div className="amn-field-row">
                <label className="amn-field">
                  Category
                  <select value={editItem.category ?? ""} onChange={(e) => set("category", e.target.value)}>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="amn-field">
                  Position
                  <input
                    type="number"
                    min={0}
                    value={editItem.position ?? 0}
                    onChange={(e) => set("position", Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="amn-field-row">
                <label className="amn-field">
                  Price, FCFA
                  <input
                    type="number"
                    min={0}
                    value={editItem.price_fcfa ?? ""}
                    onChange={(e) => set("price_fcfa", e.target.value ? Number(e.target.value) : null)}
                    placeholder="2500"
                  />
                </label>
                <label className="amn-field">
                  Price label
                  <input
                    type="text"
                    value={editItem.price_label ?? ""}
                    maxLength={40}
                    onChange={(e) => set("price_label", e.target.value || null)}
                    placeholder="from 2,500 FCFA"
                  />
                </label>
              </div>
              <p className="amn-hint">
                A label replaces the number on the board. Leave both empty for “Ask for counter”.
              </p>

              <div className="amn-field">
                Photo
                <div className="amn-photo">
                  {editItem.image_url ? (
                    <img className="amn-photo-preview" src={editItem.image_url} alt="" />
                  ) : (
                    <span className="amn-photo-blank" aria-hidden="true">No photo</span>
                  )}

                  <div className="amn-photo-controls">
                    <label className="btn btn-outline btn-sm amn-upload">
                      {editItem.image_url ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) readImage(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {editItem.image_url && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("image_url", null)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <label className="amn-field">
                Or paste an image URL
                <input
                  type="url"
                  value={editItem.image_url?.startsWith("data:") ? "" : (editItem.image_url ?? "")}
                  onChange={(e) => set("image_url", e.target.value || null)}
                  placeholder="https://"
                />
              </label>

              {error && <p className="form-error" role="alert">{error}</p>}
            </div>

            <footer className="amn-sheet-foot">
              <button className="btn btn-outline" onClick={closeEdit}>Cancel</button>
              <button className="btn btn-amber" disabled={busy !== null} onClick={save}>
                {busy !== null ? "Saving" : "Save"}
              </button>
            </footer>
          </aside>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={`Delete "${deleteTarget?.name}"?`}
        body="This removes the item from the menu permanently."
        confirmLabel="Delete"
        confirmClass="btn-danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
