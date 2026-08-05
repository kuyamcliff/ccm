import { useRef, useState } from "react";
import { api } from "~/lib/api";
import type { DeskTable, FixtureKind, FloorFixture } from "~/lib/api";
import { timeLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button, IconButton } from "~/ui/Button";
import { Icon } from "~/ui/Icon";
import { SelectField, TextField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing } from "./parts";

/**
 * The floor, in two modes that are never both on.
 *
 * Looking is the default and it is the mode staff are in during service: the
 * room as it stands tonight, every table carrying whoever booked it, and
 * nothing on screen that can move a table by accident. A plan that rearranged
 * itself under a thumb while somebody was checking who was on table four was
 * the old design's real fault — arranging the room and reading the room are
 * different jobs, minutes apart at most, and one of them happens while the
 * restaurant is full.
 *
 * Arranging is deliberate: press Edit layout, and only then does anything drag,
 * nudge, delete or get added. The banner across the top is there so nobody is
 * ever in that mode without knowing it.
 *
 * It is built for a phone first. The plan fits the width it is given rather
 * than scrolling sideways — a table off the edge is a table nobody checks —
 * and every gesture has a button beside it, because a double tap is a zoom on
 * a touchscreen and a drag is a scroll.
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

/**
 * What colour a table is, and why.
 *
 * Red is taken, here and on the guest's plan both, so the two pictures of one
 * room can never disagree. A table nobody can book is grey rather than red:
 * it is not spoken for, it is out of service, and telling staff otherwise
 * sends them looking for a guest who does not exist.
 */
function tableState(table: DeskTable): "free" | "taken" | "blocked" {
  if (!table.active) return "blocked";
  return table.booking_id ? "taken" : "free";
}

/** The one line a table is worth when you are hovering over it. */
function summarise(table: DeskTable): string {
  if (!table.active) return "Not bookable";
  if (!table.booking_id) return `Free · seats ${table.capacity}`;
  const who = table.booking_name || "Guest";
  return `${who} · ${timeLabel(table.booking_time ?? "")} · ${table.booking_party} people`;
}

export function Floor() {
  const tables = useResource(() => api.desk.tables.list(), []);
  const fixtures = useResource(() => api.desk.fixtures.list(), []);
  const toast = useToast();
  const { confirm, confirmElement } = useConfirm();
  const plan = useRef<HTMLDivElement>(null);

  /* Nothing on the plan moves until this says so. It is the whole point of the
     redesign, so it is the first thing every handler checks. */
  const [mode, setMode] = useState<"view" | "edit">("view");

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
  const [pickedFixture, setPickedFixture] = useState<number | null>(null);
  const fixtureDragRef = useRef<number | null>(null);
  const [addingFixture, setAddingFixture] = useState(false);

  /* What the little card over the plan is describing. A mouse sets it by
     hovering; a thumb sets it by tapping, which is the only reason it is state
     rather than a CSS :hover rule. */
  const [peek, setPeek] = useState<number | null>(null);
  const [details, setDetails] = useState<number | null>(null);

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

  function leaveEditing() {
    setMode("view");
    setPicked(null);
    setPickedFixture(null);
  }

  const editingLayout = mode === "edit";

  return (
    <DeskPage
      title="Floor"
      lead={
        editingLayout
          ? "Drag anything to move it, or pick it up and use the arrows. Guests book from this plan."
          : "The room as it stands tonight. Red is taken — tap a table to see who has it."
      }
      actions={
        editingLayout ? (
          <Button tone="primary" icon="check" onClick={leaveEditing}>
            Done
          </Button>
        ) : (
          <>
            <Button icon="refresh" tone="ghost" onClick={() => { tables.reload(); fixtures.reload(); }}>
              Refresh
            </Button>
            <Button
              icon="edit"
              onClick={() => {
                setMode("edit");
                setPeek(null);
              }}
            >
              Edit layout
            </Button>
          </>
        )
      }
    >
      {confirmElement}

      {editingLayout ? (
        <div className="floor-banner" role="status">
          <Icon name="edit" size={16} />
          <span>
            <strong>Editing the layout.</strong> Changes save as you make them.
          </span>
          <Button size="sm" tone="ghost" onClick={leaveEditing}>
            Finish
          </Button>
        </div>
      ) : null}

      <Loaded resource={tables} skeletonHeight="20rem">
        {(rows) => {
          const current = rows.find((row) => row.id === picked) ?? null;
          const peeked = rows.find((row) => row.id === peek) ?? null;
          const shown = rows.find((row) => row.id === details) ?? null;
          const booked = rows.filter((row) => row.booking_id).length;
          const seats = rows.reduce((sum, table) => sum + table.capacity, 0);

          return (
            <>
              {!editingLayout ? (
                <div className="floor-stats">
                  <span>
                    <strong>{rows.length}</strong> tables
                  </span>
                  <span>
                    <strong>{seats}</strong> seats
                  </span>
                  <span data-hot={booked > 0}>
                    <strong>{booked}</strong> booked tonight
                  </span>
                </div>
              ) : null}

              <div className="plan-frame">
                <div
                  ref={plan}
                  className={`plan${editingLayout ? " plan--edit" : ""}`}
                  style={{ aspectRatio: `${CANVAS.width} / ${CANVAS.height}` }}
                  onPointerDown={(event) => {
                    // A press on bare floor clears whatever was selected.
                    if (event.target === event.currentTarget) {
                      setPeek(null);
                      setPicked(null);
                      setPickedFixture(null);
                    }
                  }}
                >
                  {(fixtures.data?.fixtures ?? []).map((fixture) => {
                    const word =
                      fixture.label || FIXTURE_KINDS.find((k) => k.kind === fixture.kind)?.word || fixture.kind;

                    /* Scenery when nobody is arranging the room: it takes no
                       pointer and no tab stop, so it cannot swallow a tap meant
                       for the table behind it. */
                    if (!editingLayout) {
                      return (
                        <div
                          key={`f${fixture.id}`}
                          className="plan__fixture"
                          data-kind={fixture.kind}
                          aria-hidden="true"
                          style={{
                            left: `${(fixture.pos_x / CANVAS.width) * 100}%`,
                            top: `${(fixture.pos_y / CANVAS.height) * 100}%`,
                            width: `${(fixture.width / CANVAS.width) * 100}%`,
                            height: `${(fixture.height / CANVAS.height) * 100}%`,
                          }}
                        >
                          <span className="plan__fixture-word">{word}</span>
                        </div>
                      );
                    }

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

                  {rows.map((table) => {
                    const state = tableState(table);
                    return (
                      <button
                        key={table.id}
                        type="button"
                        className="plan__table"
                        data-state={state}
                        data-zone={table.zone}
                        data-picked={editingLayout ? picked === table.id : peek === table.id}
                        data-dragging={dragging === table.id}
                        aria-pressed={editingLayout ? picked === table.id : peek === table.id}
                        style={{
                          left: `${(table.pos_x / CANVAS.width) * 100}%`,
                          top: `${(table.pos_y / CANVAS.height) * 100}%`,
                          width: `${Math.min(18, 8 + table.capacity * 1.6)}%`,
                        }}
                        /* A mouse gets the card by hovering. A thumb has no
                           hover to give, so a tap does the same thing below. */
                        onPointerEnter={(event) => {
                          if (event.pointerType === "mouse" && !editingLayout) setPeek(table.id);
                        }}
                        onPointerLeave={(event) => {
                          if (event.pointerType === "mouse" && !editingLayout) {
                            setPeek((now) => (now === table.id ? null : now));
                          }
                        }}
                        onPointerDown={(event) => {
                          if (!editingLayout) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          dragRef.current = table.id;
                          movedRef.current = false;
                          setDragging(table.id);
                          setPicked(table.id);
                          setPickedFixture(null);
                        }}
                        onPointerMove={(event) => {
                          if (!editingLayout || dragRef.current !== table.id) return;
                          const position = toPlan(event.clientX, event.clientY);
                          if (!position) return;
                          movedRef.current = true;
                          tables.set((rowsNow) =>
                            (rowsNow ?? []).map((row) => (row.id === table.id ? { ...row, ...position } : row))
                          );
                        }}
                        onPointerUp={(event) => {
                          if (!editingLayout || dragRef.current !== table.id) return;
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
                        onClick={() => {
                          if (editingLayout) return;
                          setPeek((now) => (now === table.id ? null : table.id));
                        }}
                        onDoubleClick={() => {
                          if (editingLayout) return;
                          setDetails(table.id);
                        }}
                        onKeyDown={(event) => {
                          if (!editingLayout) {
                            if (event.key === "Enter" || event.key === " ") return;
                            return;
                          }
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
                        aria-label={
                          editingLayout
                            ? `Table ${table.label}, seats ${table.capacity}, ${table.zone}. Selected tables move with the arrow keys.`
                            : `Table ${table.label}, ${summarise(table)}`
                        }
                      >
                        <span className="plan__label">{table.label}</span>
                        <span className="plan__seats mono">{table.capacity}</span>
                      </button>
                    );
                  })}

                  {/* The card. Sits above the table it describes, or below it
                      when the table is near the top and there is no room. */}
                  {peeked && !editingLayout ? (
                    <div
                      className="plan-peek"
                      data-below={peeked.pos_y < CANVAS.height * 0.28}
                      style={{
                        left: `${(peeked.pos_x / CANVAS.width) * 100}%`,
                        top: `${(peeked.pos_y / CANVAS.height) * 100}%`,
                      }}
                      role="status"
                    >
                      <p className="plan-peek__top">
                        <strong className="mono">{peeked.label}</strong>
                        <span className="plan-peek__dot" data-state={tableState(peeked)} aria-hidden="true" />
                        <span>{peeked.active ? (peeked.booking_id ? "Taken" : "Free") : "Off"}</span>
                      </p>
                      {peeked.booking_id ? (
                        <>
                          <p className="plan-peek__who">{peeked.booking_name || "Guest"}</p>
                          <p className="plan-peek__line">
                            {timeLabel(peeked.booking_time ?? "")} · {peeked.booking_party} of {peeked.capacity}
                            {peeked.booking_checked_in ? " · here" : ""}
                          </p>
                        </>
                      ) : (
                        <p className="plan-peek__line">Seats {peeked.capacity}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* ── Looking ──────────────────────────────────────────────── */}
              {!editingLayout ? (
                <>
                  <p className="plan-legend fine">
                    <span data-state="free" /> Free
                    <span data-state="taken" /> Taken
                    <span data-state="blocked" /> Not bookable
                  </p>

                  {peeked ? (
                    <div className="floor-bar">
                      <div className="floor-bar__who">
                        <strong className="mono">{peeked.label}</strong>
                        <span className="fine faint">{summarise(peeked)}</span>
                      </div>
                      <Button size="sm" icon="info" onClick={() => setDetails(peeked.id)}>
                        Details
                      </Button>
                    </div>
                  ) : (
                    <p className="plan-hint fine faint">
                      <Icon name="info" size={14} /> Tap a table for a quick look, twice for everything.
                    </p>
                  )}
                </>
              ) : null}

              {/* ── Arranging ────────────────────────────────────────────── */}
              {editingLayout ? (
                <>
                  <div className="floor-add">
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
                  </div>

                  {current ? (
                    <div className="plan-tools">
                      <div className="plan-tools__who">
                        <strong className="mono">{current.label}</strong>
                        <span className="fine faint">
                          Seats {current.capacity} · {zoneWord(current.zone)}
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

                      <label className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={current.active === 1}
                          onChange={async (event) => {
                            try {
                              await api.desk.tables.update(current.id, { active: event.target.checked });
                              tables.reload();
                            } catch (err) {
                              toast.failed(err);
                            }
                          }}
                        />
                        <span className="switch__track" aria-hidden="true" />
                        <span className="check__text fine">Bookable</span>
                      </label>

                      <Button icon="edit" onClick={() => setEditing(current)}>
                        Edit
                      </Button>
                      <Button
                        tone="danger"
                        icon="trash"
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Delete table ${current.label}?`,
                            body: "Bookings already on it keep their record, but nobody can book it again.",
                            confirmLabel: "Delete",
                          });
                          if (!ok) return;
                          try {
                            await api.desk.tables.remove(current.id);
                            setPicked(null);
                            tables.reload();
                            toast.done("Table deleted.");
                          } catch (err) {
                            toast.failed(err);
                          }
                        }}
                      >
                        Delete
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

                  <p className="plan-hint fine faint">
                    {rows.length} tables, {seats} seats. Tap one to pick it up.
                  </p>
                </>
              ) : null}

              {rows.length === 0 ? (
                <Nothing>
                  {editingLayout ? "No tables yet. Add the first one." : "No tables yet. Press Edit layout to add one."}
                </Nothing>
              ) : null}

              {/* Everything about one table, including the guest holding it. */}
              <Sheet
                open={shown !== null}
                onClose={() => setDetails(null)}
                title={shown ? `Table ${shown.label}` : ""}
                description={shown ? `${shown.capacity} seats · ${zoneWord(shown.zone)}` : undefined}
              >
                {shown ? <TableDetails table={shown} /> : null}
              </Sheet>
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

function zoneWord(zone: string): string {
  if (zone === "outdoor") return "Outside";
  if (zone === "bar") return "Bar";
  return "Inside";
}

/**
 * The long version, opened by a double click or the Details button.
 *
 * The guest's phone number is a link rather than text on purpose: the reason
 * anybody opens this during service is to ring the party that has not turned
 * up, and making that one tap is most of the value of the screen.
 */
function TableDetails({ table }: { table: DeskTable }) {
  const rows: { label: string; value: string }[] = [
    { label: "Seats", value: String(table.capacity) },
    { label: "Area", value: zoneWord(table.zone) },
    { label: "Bookable", value: table.active ? "Yes" : "No" },
    { label: "Bookings today", value: String(table.today_count ?? 0) },
  ];

  return (
    <div className="stack">
      <dl className="detail-list">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="label">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      {table.booking_id ? (
        <section className="card stack stack--tight">
          <div className="row row--between">
            <h3 className="card__title">Who has it</h3>
            <span className={`badge badge--${table.booking_status === "confirmed" ? "good" : "warn"}`}>
              {table.booking_status === "confirmed" ? "Confirmed" : "Awaiting deposit"}
            </span>
          </div>

          <dl className="detail-list">
            <div>
              <dt className="label">Name</dt>
              <dd>{table.booking_name || "Guest"}</dd>
            </div>
            <div>
              <dt className="label">Time</dt>
              <dd>{timeLabel(table.booking_time ?? "")}</dd>
            </div>
            <div>
              <dt className="label">Party</dt>
              <dd>
                {table.booking_party} {table.booking_party === 1 ? "person" : "people"}
              </dd>
            </div>
            {table.booking_code ? (
              <div>
                <dt className="label">Code</dt>
                <dd className="mono">{table.booking_code}</dd>
              </div>
            ) : null}
            <div>
              <dt className="label">Arrived</dt>
              <dd>{table.booking_checked_in ? "Yes" : "Not yet"}</dd>
            </div>
          </dl>

          {table.booking_note ? <p className="fine muted">“{table.booking_note}”</p> : null}

          {table.booking_phone ? (
            <a className="btn btn--sm" href={`tel:${table.booking_phone.replace(/\s/g, "")}`}>
              <Icon name="phone" size={16} />
              Call {table.booking_phone}
            </a>
          ) : null}
        </section>
      ) : (
        <p className="fine faint">
          {table.active ? "Nobody has booked this table today." : "This table is not bookable, so it takes no bookings."}
        </p>
      )}
    </div>
  );
}
