import { useRef, useState } from "react";
import { api } from "~/lib/api";
import type { DeskTable, FixtureKind, FloorFixture } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { SelectField, TextField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, TableWrap, Toolbar } from "./parts";

/**
 * The floor plan, as the owner arranges it.
 *
 * A table is selected first, then acted on. That order matters: dragging used
 * to be the only way to move one and a double click the only way to open it,
 * and a touchscreen has neither gesture to give — the browser claims a drag
 * for scrolling, and a double tap is a zoom. On a phone the plan simply slid
 * about under the finger while nothing moved.
 *
 * So there are now three ways to move a table, and they suit different hands:
 * drag it, press the arrows under the plan, or use the arrow keys once it has
 * focus. The table below the plan remains the full keyboard route to
 * everything, which is what makes this screen usable without a steady hand.
 */

const CANVAS = { width: 640, height: 560 };

/* What the owner can put in the room, and what each one is called on screen.
   The list matches the server's, which is what the plan knows how to draw —
   a kind neither side recognises would come out as an unlabelled grey box. */
const FIXTURE_KINDS: { kind: FixtureKind; word: string }[] = [
  { kind: "grill", word: "Grill" },
  { kind: "kitchen", word: "Kitchen" },
  { kind: "bar", word: "Bar" },
  { kind: "tv", word: "Screen" },
  { kind: "door", word: "Way in" },
  { kind: "toilets", word: "Toilets" },
  { kind: "speaker", word: "Speaker" },
  { kind: "plant", word: "Plant" },
];

/** How far one press of an arrow moves a table, in canvas units. */
const NUDGE = 12;

export function Floor() {
  const tables = useResource(() => api.desk.tables.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const plan = useRef<HTMLDivElement>(null);

  /* The drag lives in a ref as well as in state: the ref is what the pointer
     handlers read mid-gesture, where a state value would still be the one from
     the render that started the drag. The state is only there to paint it. */
  const dragRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  /* Fixtures live beside the tables rather than in the same list: they are not
     bookable, they have a width and a height rather than a capacity, and the
     one thing that must never happen is a guest being offered the grill. */
  const fixtures = useResource(() => api.desk.fixtures.list(), []);
  const [pickedFixture, setPickedFixture] = useState<number | null>(null);
  const fixtureDragRef = useRef<number | null>(null);
  const [addingFixture, setAddingFixture] = useState(false);

  const [editing, setEditing] = useState<DeskTable | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: "", capacity: 4, zone: "main" });

  /** Keeps a table inside the canvas, whichever way it was moved. */
  function clampTo(x: number, y: number) {
    return {
      pos_x: Math.round(Math.min(Math.max(x, 20), CANVAS.width - 20)),
      pos_y: Math.round(Math.min(Math.max(y, 20), CANVAS.height - 20)),
    };
  }

  /** Turns a pointer position into plan coordinates, clamped to the canvas. */
  function toPlan(clientX: number, clientY: number) {
    const box = plan.current?.getBoundingClientRect();
    if (!box) return null;
    return clampTo(((clientX - box.left) / box.width) * CANVAS.width, ((clientY - box.top) / box.height) * CANVAS.height);
  }

  async function savePosition(id: number, position: { pos_x: number; pos_y: number }) {
    try {
      await api.desk.tables.update(id, position);
    } catch (err) {
      toast.failed(err);
      tables.reload();
    }
  }

  async function saveFixture(id: number, patch: Partial<FloorFixture>) {
    try {
      await api.desk.fixtures.update(id, patch);
    } catch (err) {
      toast.failed(err);
      fixtures.reload();
    }
  }

  /** Moves a fixture, or resizes the one currently selected. */
  function nudgeFixture(fixture: FloorFixture, patch: Partial<FloorFixture>) {
    const snapshot = fixtures.data;
    if (snapshot) {
      fixtures.set({
        ...snapshot,
        fixtures: snapshot.fixtures.map((f) => (f.id === fixture.id ? { ...f, ...patch } : f)),
      });
    }
    void saveFixture(fixture.id, patch);
  }

  /** Moves a table by one step and saves where it landed. */
  function nudge(table: DeskTable, dx: number, dy: number) {
    const next = clampTo(table.pos_x + dx, table.pos_y + dy);
    tables.set((current) => (current ?? []).map((row) => (row.id === table.id ? { ...row, ...next } : row)));
    void savePosition(table.id, next);
  }

  return (
    <DeskPage
      title="Floor"
      lead="Tap anything to pick it up, then drag it or use the arrows. Add the grill, the screen and the bar so guests can see the real room. This is the plan they book from."
      actions={
        <>
          <Button icon="plus" onClick={() => setAddingFixture(true)}>
            Add a fixture
          </Button>
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
        </>
      }
    >
      {confirmElement}

      <Loaded resource={tables} skeletonHeight="20rem">
        {(rows) => {
          const current = rows.find((row) => row.id === picked) ?? null;

          return (
            <>
              <div className="plan-frame">
                <div
                  ref={plan}
                  className="plan plan--edit"
                  style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}
                >
                  {(fixtures.data?.fixtures ?? []).map((fixture) => {
                    const word =
                      fixture.label || FIXTURE_KINDS.find((k) => k.kind === fixture.kind)?.word || fixture.kind;
                    return (
                      <button
                        key={`f${fixture.id}`}
                        type="button"
                        className="plan__fixture plan__fixture--edit"
                        data-kind={fixture.kind}
                        data-picked={pickedFixture === fixture.id}
                        aria-pressed={pickedFixture === fixture.id}
                        aria-label={`${word}. Selected fixtures move with the arrow keys.`}
                        style={{
                          left: `${(fixture.pos_x / CANVAS.width) * 100}%`,
                          top: `${(fixture.pos_y / CANVAS.height) * 100}%`,
                          width: `${(fixture.width / CANVAS.width) * 100}%`,
                          height: `${(fixture.height / CANVAS.height) * 100}%`,
                        }}
                        onPointerDown={(event) => {
                          event.currentTarget.setPointerCapture(event.pointerId);
                          fixtureDragRef.current = fixture.id;
                          movedRef.current = false;
                          setPickedFixture(fixture.id);
                          setPicked(null);
                        }}
                        onPointerMove={(event) => {
                          if (fixtureDragRef.current !== fixture.id) return;
                          const position = toPlan(event.clientX, event.clientY);
                          if (!position) return;
                          movedRef.current = true;
                          const snapshot = fixtures.data;
                          if (snapshot) {
                            fixtures.set({
                              ...snapshot,
                              fixtures: snapshot.fixtures.map((f) =>
                                f.id === fixture.id ? { ...f, ...position } : f
                              ),
                            });
                          }
                        }}
                        onPointerUp={(event) => {
                          if (fixtureDragRef.current !== fixture.id) return;
                          fixtureDragRef.current = null;
                          if (!movedRef.current) return;
                          const position = toPlan(event.clientX, event.clientY);
                          if (position) void saveFixture(fixture.id, position);
                        }}
                        onPointerCancel={() => {
                          fixtureDragRef.current = null;
                        }}
                        onKeyDown={(event) => {
                          const step: Record<string, Partial<FloorFixture>> = {
                            ArrowUp: { pos_y: fixture.pos_y - NUDGE },
                            ArrowDown: { pos_y: fixture.pos_y + NUDGE },
                            ArrowLeft: { pos_x: fixture.pos_x - NUDGE },
                            ArrowRight: { pos_x: fixture.pos_x + NUDGE },
                          };
                          const move = step[event.key];
                          if (!move) return;
                          event.preventDefault();
                          setPickedFixture(fixture.id);
                          nudgeFixture(fixture, move);
                        }}
                      >
                        <span className="plan__fixture-word">{word}</span>
                      </button>
                    );
                  })}

                  {rows.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      className="plan__table"
                      data-state={table.active ? "free" : "blocked"}
                      data-zone={table.zone}
                      data-picked={picked === table.id}
                      data-dragging={dragging === table.id}
                      aria-pressed={picked === table.id}
                      style={{
                        left: `${(table.pos_x / CANVAS.width) * 100}%`,
                        top: `${(table.pos_y / CANVAS.height) * 100}%`,
                        width: `${Math.min(18, 8 + table.capacity * 1.6)}%`,
                      }}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragRef.current = table.id;
                        movedRef.current = false;
                        setDragging(table.id);
                        setPicked(table.id);
                        setPickedFixture(null);
                      }}
                      onPointerMove={(event) => {
                        if (dragRef.current !== table.id) return;
                        const position = toPlan(event.clientX, event.clientY);
                        if (!position) return;
                        movedRef.current = true;
                        tables.set((rowsNow) =>
                          (rowsNow ?? []).map((row) => (row.id === table.id ? { ...row, ...position } : row))
                        );
                      }}
                      onPointerUp={(event) => {
                        if (dragRef.current !== table.id) return;
                        dragRef.current = null;
                        setDragging(null);
                        /* A press that never moved is a selection, not a move —
                           saving here would write the position it already had. */
                        if (!movedRef.current) return;
                        const position = toPlan(event.clientX, event.clientY);
                        if (position) void savePosition(table.id, position);
                      }}
                      onPointerCancel={() => {
                        dragRef.current = null;
                        setDragging(null);
                      }}
                      onKeyDown={(event) => {
                        const step: Record<string, [number, number]> = {
                          ArrowUp: [0, -NUDGE],
                          ArrowDown: [0, NUDGE],
                          ArrowLeft: [-NUDGE, 0],
                          ArrowRight: [NUDGE, 0],
                        };
                        const move = step[event.key];
                        if (!move) return;
                        event.preventDefault();
                        setPicked(table.id);
                        nudge(table, move[0], move[1]);
                      }}
                      aria-label={`Table ${table.label}, seats ${table.capacity}, ${table.zone}. Selected tables move with the arrow keys.`}
                    >
                      <span className="plan__label">{table.label}</span>
                      <span className="plan__seats mono">{table.capacity}</span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="plan-hint">
                <span aria-hidden="true">←→</span> Scroll the plan sideways to see the whole room.
              </p>

              {current ? (
                <div className="plan-tools">
                  <div className="plan-tools__who">
                    <strong className="mono">{current.label}</strong>
                    <span className="fine faint">
                      seats {current.capacity} · {current.zone}
                    </span>
                  </div>

                  <div className="plan-tools__pad">
                    <IconButton name="arrow-up" label={`Move ${current.label} up`} onClick={() => nudge(current, 0, -NUDGE)} />
                    <IconButton
                      name="arrow-left"
                      label={`Move ${current.label} left`}
                      onClick={() => nudge(current, -NUDGE, 0)}
                    />
                    <IconButton
                      name="arrow-down"
                      label={`Move ${current.label} down`}
                      onClick={() => nudge(current, 0, NUDGE)}
                    />
                    <IconButton
                      name="arrow-right"
                      label={`Move ${current.label} right`}
                      onClick={() => nudge(current, NUDGE, 0)}
                    />
                  </div>

                  <Button icon="edit" onClick={() => setEditing(current)}>
                    Edit
                  </Button>
                  <Button tone="ghost" onClick={() => setPicked(null)}>
                    Done
                  </Button>
                </div>
              ) : null}

              {(() => {
                const fixture = (fixtures.data?.fixtures ?? []).find((f) => f.id === pickedFixture);
                if (!fixture) return null;
                const word =
                  fixture.label || FIXTURE_KINDS.find((k) => k.kind === fixture.kind)?.word || fixture.kind;
                return (
                  <div className="plan-tools">
                    <div className="plan-tools__who">
                      <strong>{word}</strong>
                      <span className="fine faint">
                        {fixture.width} × {fixture.height}
                      </span>
                    </div>

                    <div className="plan-tools__pad">
                      <IconButton name="arrow-up" label={`Move ${word} up`} onClick={() => nudgeFixture(fixture, { pos_y: fixture.pos_y - NUDGE })} />
                      <IconButton name="arrow-left" label={`Move ${word} left`} onClick={() => nudgeFixture(fixture, { pos_x: fixture.pos_x - NUDGE })} />
                      <IconButton name="arrow-down" label={`Move ${word} down`} onClick={() => nudgeFixture(fixture, { pos_y: fixture.pos_y + NUDGE })} />
                      <IconButton name="arrow-right" label={`Move ${word} right`} onClick={() => nudgeFixture(fixture, { pos_x: fixture.pos_x + NUDGE })} />
                    </div>

                    <div className="row" style={{ gap: "var(--s-1)" }}>
                      <IconButton
                        name="minus"
                        label={`Make ${word} smaller`}
                        onClick={() => nudgeFixture(fixture, { width: fixture.width - 20, height: fixture.height - 20 })}
                      />
                      <IconButton
                        name="plus"
                        label={`Make ${word} bigger`}
                        onClick={() => nudgeFixture(fixture, { width: fixture.width + 20, height: fixture.height + 20 })}
                      />
                    </div>

                    <Button
                      tone="danger"
                      icon="trash"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Remove the ${word.toLowerCase()}?`,
                          body: "It only stops being drawn on the plan. No booking is affected.",
                          confirmLabel: "Remove",
                        });
                        if (!ok) return;
                        try {
                          await api.desk.fixtures.remove(fixture.id);
                          setPickedFixture(null);
                          fixtures.reload();
                          toast.done("Removed.");
                        } catch (err) {
                          toast.failed(err);
                        }
                      }}
                    >
                      Remove
                    </Button>
                    <Button tone="ghost" onClick={() => setPickedFixture(null)}>
                      Done
                    </Button>
                  </div>
                );
              })()}

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
                          <IconButton
                            name="edit"
                            label={`Edit table ${table.label}`}
                            size="sm"
                            onClick={() => setEditing(table)}
                          />
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
                                if (picked === table.id) setPicked(null);
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
          );
        }}
      </Loaded>

      <Sheet
        open={addingFixture}
        onClose={() => setAddingFixture(false)}
        title="Add to the room"
        description="It appears in the middle of the plan. Drag it where it belongs."
      >
        <div className="fixture-picker">
          {FIXTURE_KINDS.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              className="fixture-choice"
              onClick={async () => {
                try {
                  await api.desk.fixtures.create({ kind: entry.kind });
                  setAddingFixture(false);
                  fixtures.reload();
                  toast.done(`${entry.word} added.`);
                } catch (err) {
                  toast.failed(err);
                }
              }}
            >
              {entry.word}
            </button>
          ))}
        </div>
      </Sheet>

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
