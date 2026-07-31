import { useRef, useState } from "react";
import { api } from "~/lib/api";
import type { DeskTable } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { SelectField, TextField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, TableWrap, Toolbar } from "./parts";

/**
 * The floor plan, as the owner arranges it.
 *
 * Tables are dragged into place and the position is saved when the drag ends,
 * not on every frame, so moving one table is one request rather than fifty.
 *
 * Dragging is not the only way to do this: the table below the plan is the
 * same data, editable with a keyboard, which is what makes the screen usable
 * without a mouse or a steady hand.
 */

const CANVAS = { width: 640, height: 560 };

export function Floor() {
  const tables = useResource(() => api.desk.tables.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const plan = useRef<HTMLDivElement>(null);

  const [dragging, setDragging] = useState<number | null>(null);
  const [editing, setEditing] = useState<DeskTable | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: "", capacity: 4, zone: "main" });

  /** Turns a pointer position into plan coordinates, clamped to the canvas. */
  function toPlan(clientX: number, clientY: number) {
    const box = plan.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      pos_x: Math.round(Math.min(Math.max(((clientX - box.left) / box.width) * CANVAS.width, 20), CANVAS.width - 20)),
      pos_y: Math.round(Math.min(Math.max(((clientY - box.top) / box.height) * CANVAS.height, 20), CANVAS.height - 20)),
    };
  }

  async function savePosition(id: number, position: { pos_x: number; pos_y: number }) {
    try {
      await api.desk.tables.update(id, position);
      toast.done("Moved.");
    } catch (err) {
      toast.failed(err);
      tables.reload();
    }
  }

  return (
    <DeskPage
      title="Floor"
      lead="Drag a table to move it. Guests see this plan when they book."
      actions={
        <Button
          tone="primary"
          icon="plus"
          onClick={() => {
            setDraft({ label: "", capacity: 4, zone: "main" });
            setAdding(true);
          }}
        >
          Add a table
        </Button>
      }
    >
      {confirmElement}

      <Loaded resource={tables} skeletonHeight="20rem">
        {(rows) => (
          <>
            <div
              ref={plan}
              className="plan plan--edit"
              style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}
              onPointerMove={(event) => {
                if (dragging === null) return;
                const position = toPlan(event.clientX, event.clientY);
                if (!position) return;
                tables.set((current) =>
                  (current ?? []).map((table) => (table.id === dragging ? { ...table, ...position } : table))
                );
              }}
              onPointerUp={(event) => {
                if (dragging === null) return;
                const position = toPlan(event.clientX, event.clientY);
                if (position) void savePosition(dragging, position);
                setDragging(null);
              }}
              onPointerLeave={() => setDragging(null)}
            >
              {rows.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  className="plan__table"
                  data-state={table.active ? "free" : "blocked"}
                  data-zone={table.zone}
                  style={{
                    left: `${(table.pos_x / CANVAS.width) * 100}%`,
                    top: `${(table.pos_y / CANVAS.height) * 100}%`,
                    width: `${Math.min(18, 8 + table.capacity * 1.6)}%`,
                    cursor: dragging === table.id ? "grabbing" : "grab",
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragging(table.id);
                  }}
                  onDoubleClick={() => setEditing(table)}
                  aria-label={`Table ${table.label}, seats ${table.capacity}. Drag to move, double click to edit.`}
                >
                  <span className="plan__label">{table.label}</span>
                  <span className="plan__seats mono">{table.capacity}</span>
                </button>
              ))}
            </div>

            {rows.length === 0 ? <Nothing>No tables yet. Add the first one.</Nothing> : null}

            <Toolbar>
              <p className="fine faint">
                {rows.length} tables, {rows.reduce((sum, table) => sum + table.capacity, 0)} seats
              </p>
            </Toolbar>

            <TableWrap>
              <thead>
                <tr>
                  <th>Table</th>
                  <th className="table__num">Seats</th>
                  <th>Area</th>
                  <th className="table__num">Booked today</th>
                  <th>In use</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((table) => (
                  <tr key={table.id}>
                    <td className="mono">{table.label}</td>
                    <td className="table__num">{table.capacity}</td>
                    <td>{table.zone}</td>
                    <td className="table__num">{table.today_count}</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={table.active === 1}
                          onChange={async (event) => {
                            try {
                              await api.desk.tables.update(table.id, { active: event.target.checked });
                              tables.reload();
                            } catch (err) {
                              toast.failed(err);
                            }
                          }}
                        />
                        <span className="switch__track" aria-hidden="true" />
                        <span className="sr-only">Table {table.label} bookable</span>
                      </label>
                    </td>
                    <td>
                      <div className="table__actions">
                        <IconButton name="edit" label={`Edit table ${table.label}`} size="sm" onClick={() => setEditing(table)} />
                        <IconButton
                          name="trash"
                          label={`Delete table ${table.label}`}
                          size="sm"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Delete table ${table.label}?`,
                              body: "Bookings already on it keep their record, but nobody can book it again.",
                              confirmLabel: "Delete",
                            });
                            if (!ok) return;
                            try {
                              await api.desk.tables.remove(table.id);
                              tables.reload();
                              toast.done("Table deleted.");
                            } catch (err) {
                              toast.failed(err);
                            }
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </>
        )}
      </Loaded>

      <Sheet
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        title={editing ? `Table ${editing.label}` : "New table"}
        footer={
          <>
            <Button
              tone="ghost"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              tone="primary"
              onClick={async () => {
                try {
                  if (editing) {
                    await api.desk.tables.update(editing.id, {
                      label: editing.label,
                      capacity: editing.capacity,
                      zone: editing.zone,
                    });
                  } else {
                    await api.desk.tables.create({
                      label: draft.label.trim(),
                      capacity: draft.capacity,
                      zone: draft.zone,
                      pos_x: Math.round(CANVAS.width / 2),
                      pos_y: Math.round(CANVAS.height / 2),
                    });
                  }
                  setAdding(false);
                  setEditing(null);
                  tables.reload();
                  toast.done("Saved.");
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <TextField
          label="Name"
          hint="Short. It goes on the plan and on the guest's pass."
          value={editing ? editing.label : draft.label}
          maxLength={20}
          onChange={(e) =>
            editing ? setEditing({ ...editing, label: e.target.value }) : setDraft({ ...draft, label: e.target.value })
          }
        />
        <TextField
          label="Seats"
          type="number"
          min={1}
          max={30}
          value={editing ? editing.capacity : draft.capacity}
          onChange={(e) =>
            editing
              ? setEditing({ ...editing, capacity: Number(e.target.value) })
              : setDraft({ ...draft, capacity: Number(e.target.value) })
          }
        />
        <SelectField
          label="Area"
          value={editing ? editing.zone : draft.zone}
          onChange={(e) =>
            editing ? setEditing({ ...editing, zone: e.target.value }) : setDraft({ ...draft, zone: e.target.value })
          }
        >
          <option value="main">Inside</option>
          <option value="outdoor">Outside</option>
          <option value="bar">Bar</option>
        </SelectField>
      </Sheet>
    </DeskPage>
  );
}
