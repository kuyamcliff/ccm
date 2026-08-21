import { useMemo, useRef, useState } from "react";
import { api } from "~/lib/api";
import type { DeskTable, FixtureKind } from "~/lib/api";
import { useMutation, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { Action, Button, IconButton } from "~/ui/Button";
import { TextField, Counter, Field, SelectField } from "~/ui/Field";
import { Sheet, useConfirm } from "~/ui/Sheet";
import { Icon } from "~/ui/Icon";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Loaded, Section } from "./parts";
import { useToast } from "~/state/toast";

/**
 * The room, as it actually is.
 *
 * Guests pick their table off this plan, so it has to match the floor. Drag a
 * table where it really stands, add the grill and the door around it, and the
 * booking page shows the same thing.
 *
 * ── Why this canvas scrolls and the customer's does not ────────────────────
 *
 * The booking page's plan is scaled to fit the screen and must never scroll
 * sideways: a guest choosing a table should see the whole room at once. This one
 * is the opposite. It is an editor, used on a bigger screen, and it needs the
 * coordinates to stay at a usable size while somebody drags a table two pixels
 * to the left. So it keeps a scrolling canvas of its own, at a fixed size, and
 * the wrapper scrolls in both directions.
 *
 * ── Dragging, and the nudge pad ────────────────────────────────────────────
 *
 * Pointer events give the drag. But a drag on a phone is imprecise and the
 * difference between two adjacent tables is a few pixels, so every selected
 * object also gets a four-way nudge pad that moves it exactly one step. That pad
 * is the only way this screen is usable on the device most staff have.
 *
 * Positions are saved on release rather than during the drag, which is one
 * request per move instead of one per frame.
 */

const CANVAS = { width: 640, height: 560 };
const NUDGE = 4;

const FIXTURE_KINDS: FixtureKind[] = ["grill", "tv", "bar", "door", "toilets", "kitchen", "speaker", "plant"];

const FIXTURE_LABEL: Record<FixtureKind, string> = {
  grill: "Grill",
  tv: "TV",
  bar: "Bar",
  door: "Door",
  toilets: "Toilets",
  kitchen: "Kitchen",
  speaker: "Speaker",
  plant: "Plant",
};

type Selection = { kind: "table"; id: number } | { kind: "fixture"; id: number } | null;

export function Floor() {
  const toast = useToast();
  const { confirm, element } = useConfirm();

  const [selected, setSelected] = useState<Selection>(null);
  const [editing, setEditing] = useState<DeskTable | null>(null);
  const [adding, setAdding] = useState(false);

  const canvas = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<{ kind: "table" | "fixture"; id: number; dx: number; dy: number } | null>(null);

  const tables = useQuery(K.desk.tables, () => api.desk.tables.list(), { staleMs: 60_000 });
  const fixtures = useQuery(K.desk.fixtures, () => api.desk.fixtures.list(), { staleMs: 60_000 });

  /* Local positions while dragging, so the object follows the finger without a
     request per frame and without waiting for the server to agree. */
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});

  function refresh() {
    invalidate("desk.tables*");
    invalidate("desk.fixtures*");
    tables.reload();
    fixtures.reload();
  }

  const moveTable = useMutation(async (input: { id: number; x: number; y: number }) => {
    await api.desk.tables.update(input.id, { pos_x: input.x, pos_y: input.y });
    invalidate("desk.tables*");
  });

  const moveFixture = useMutation(async (input: { id: number; x: number; y: number }) => {
    await api.desk.fixtures.update(input.id, { pos_x: input.x, pos_y: input.y });
    invalidate("desk.fixtures*");
  });

  const saveTable = useMutation(async (input: { id: number | null; label: string; capacity: number; zone: string }) => {
    if (input.id === null) {
      await api.desk.tables.create({
        label: input.label,
        capacity: input.capacity,
        zone: input.zone,
        pos_x: Math.round(CANVAS.width / 2),
        pos_y: Math.round(CANVAS.height / 2),
      });
    } else {
      await api.desk.tables.update(input.id, { label: input.label, capacity: input.capacity, zone: input.zone });
    }
    setEditing(null);
    setAdding(false);
    refresh();
    toast.done("Saved.");
  });

  const removeTable = useMutation(async (id: number) => {
    await api.desk.tables.remove(id);
    setSelected(null);
    setEditing(null);
    refresh();
    toast.done("Table removed.");
  });

  const addFixture = useMutation(async (kind: FixtureKind) => {
    await api.desk.fixtures.create({
      kind,
      label: FIXTURE_LABEL[kind],
      pos_x: Math.round(CANVAS.width / 2),
      pos_y: Math.round(CANVAS.height / 2),
      width: 80,
      height: 40,
    });
    refresh();
  });

  const removeFixture = useMutation(async (id: number) => {
    await api.desk.fixtures.remove(id);
    setSelected(null);
    refresh();
  });

  const tableList = tables.data ?? [];
  const fixtureList = fixtures.data?.fixtures ?? [];

  function positionOf(kind: "table" | "fixture", id: number, x: number, y: number) {
    return moved[`${kind}-${id}`] ?? { x, y };
  }

  function onPointerDown(event: React.PointerEvent, kind: "table" | "fixture", id: number, x: number, y: number) {
    const box = canvas.current?.getBoundingClientRect();
    if (!box) return;
    setSelected({ kind, id } as Selection);
    dragging.current = {
      kind,
      id,
      /* The grab offset, so the object does not jump so its corner sits under
         the finger the moment a drag starts. */
      dx: event.clientX - box.left - x,
      dy: event.clientY - box.top - y,
    };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragging.current;
    const box = canvas.current?.getBoundingClientRect();
    if (!drag || !box) return;

    const x = Math.round(Math.min(Math.max(event.clientX - box.left - drag.dx, 0), CANVAS.width));
    const y = Math.round(Math.min(Math.max(event.clientY - box.top - drag.dy, 0), CANVAS.height));
    setMoved((current) => ({ ...current, [`${drag.kind}-${drag.id}`]: { x, y } }));
  }

  function onPointerUp() {
    const drag = dragging.current;
    dragging.current = null;
    if (!drag) return;

    const at = moved[`${drag.kind}-${drag.id}`];
    if (!at) return;
    /* Saved once, on release. One request per move rather than per frame. */
    if (drag.kind === "table") void moveTable.run({ id: drag.id, x: at.x, y: at.y });
    else void moveFixture.run({ id: drag.id, x: at.x, y: at.y });
  }

  function nudge(dx: number, dy: number) {
    if (!selected) return;
    const key = `${selected.kind}-${selected.id}`;

    const current =
      selected.kind === "table"
        ? tableList.find((table) => table.id === selected.id)
        : fixtureList.find((fixture) => fixture.id === selected.id);
    if (!current) return;

    const at = moved[key] ?? { x: current.pos_x, y: current.pos_y };
    const x = Math.round(Math.min(Math.max(at.x + dx * NUDGE, 0), CANVAS.width));
    const y = Math.round(Math.min(Math.max(at.y + dy * NUDGE, 0), CANVAS.height));

    setMoved((currentMoved) => ({ ...currentMoved, [key]: { x, y } }));
    if (selected.kind === "table") void moveTable.run({ id: selected.id, x, y });
    else void moveFixture.run({ id: selected.id, x, y });
  }

  const selectedTable = useMemo(
    () => (selected?.kind === "table" ? tableList.find((table) => table.id === selected.id) : undefined),
    [selected, tableList]
  );

  return (
    <DeskPage
      title="Floor"
      hint="Drag things where they really are. Guests pick their table off this."
      actions={
        <Button size="sm" tone="primary" icon="plus" onClick={() => setAdding(true)}>
          Add a table
        </Button>
      }
    >
      <Notice tone="info">
        Tap something to select it, then drag it or use the arrows. On a phone the arrows are far more accurate than a
        drag.
      </Notice>

      <Loaded query={tables}>
        {() => (
          <>
            <div className="dk-canvaswrap" data-scroller="">
              <div
                ref={canvas}
                className="dk-canvas"
                style={{ width: CANVAS.width, height: CANVAS.height }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {fixtureList.map((fixture) => {
                  const at = positionOf("fixture", fixture.id, fixture.pos_x, fixture.pos_y);
                  const on = selected?.kind === "fixture" && selected.id === fixture.id;
                  return (
                    <div
                      key={`f-${fixture.id}`}
                      className={`dk-fixture dk-fixture--${fixture.kind}`}
                      data-on={on ? "true" : undefined}
                      style={{ left: at.x, top: at.y, width: fixture.width, height: fixture.height }}
                      onPointerDown={(event) => onPointerDown(event, "fixture", fixture.id, at.x, at.y)}
                    >
                      {fixture.label || FIXTURE_LABEL[fixture.kind]}
                    </div>
                  );
                })}

                {tableList.map((table) => {
                  const at = positionOf("table", table.id, table.pos_x, table.pos_y);
                  const on = selected?.kind === "table" && selected.id === table.id;
                  return (
                    <div
                      key={`t-${table.id}`}
                      className="dk-tablemark"
                      data-on={on ? "true" : undefined}
                      data-off={table.active === 0 ? "true" : undefined}
                      data-big={table.capacity > 4 ? "true" : undefined}
                      style={{ left: at.x, top: at.y }}
                      onPointerDown={(event) => onPointerDown(event, "table", table.id, at.x, at.y)}
                      onDoubleClick={() => setEditing(table)}
                    >
                      <span className="dk-tablemark__label">{table.label}</span>
                      <span className="dk-tablemark__seats micro">{table.capacity}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── The nudge pad ────────────────────────────────────────────*/}
            {selected ? (
              <Section title={selectedTable ? `Table ${selectedTable.label}` : "Selected"}>
                <div className="dk-nudge">
                  <IconButton name="arrow-up" label="Move up" onClick={() => nudge(0, -1)} className="dk-nudge__up" />
                  <IconButton name="arrow-left" label="Move left" onClick={() => nudge(-1, 0)} className="dk-nudge__left" />
                  <IconButton name="arrow-right" label="Move right" onClick={() => nudge(1, 0)} className="dk-nudge__right" />
                  <IconButton name="arrow-down" label="Move down" onClick={() => nudge(0, 1)} className="dk-nudge__down" />
                </div>

                <div className="bar bar--tight bar--wrap">
                  {selectedTable ? (
                    <>
                      <Button size="sm" tone="ghost" icon="edit" onClick={() => setEditing(selectedTable)}>
                        Rename or resize
                      </Button>
                      <Action
                        size="sm"
                        tone="quiet"
                        pending={saveTable.pending}
                        pendingLabel="Saving"
                        onClick={() =>
                          void api.desk.tables
                            .update(selectedTable.id, { active: selectedTable.active === 0 })
                            .then(refresh)
                        }
                      >
                        {selectedTable.active === 0 ? "Put back in use" : "Take out of use"}
                      </Action>
                      <Action
                        size="sm"
                        tone="quiet"
                        pending={removeTable.pending}
                        pendingLabel="Removing"
                        onClick={async () => {
                          const sure = await confirm({
                            title: `Remove table ${selectedTable.label}?`,
                            body: "Any booking already on it keeps its record, but guests will not be able to choose it again.",
                            confirmLabel: "Remove it",
                          });
                          if (!sure) return;
                          await removeTable.run(selectedTable.id);
                        }}
                      >
                        Remove
                      </Action>
                    </>
                  ) : (
                    <Action
                      size="sm"
                      tone="quiet"
                      pending={removeFixture.pending}
                      pendingLabel="Removing"
                      onClick={() => void removeFixture.run(selected.id)}
                    >
                      Remove
                    </Action>
                  )}
                  <Button size="sm" tone="quiet" onClick={() => setSelected(null)}>
                    Done
                  </Button>
                </div>
              </Section>
            ) : null}

            {/* ── Fixtures ─────────────────────────────────────────────────*/}
            <Section title="Add a fixture" hint="The things around the tables, so the room reads correctly.">
              <div className="bar bar--wrap bar--tight">
                {FIXTURE_KINDS.map((kind) => (
                  <Action
                    key={kind}
                    size="sm"
                    tone="ghost"
                    pending={addFixture.pending}
                    pendingLabel="Adding"
                    onClick={() => void addFixture.run(kind)}
                  >
                    <Icon name="plus" size={13} /> {FIXTURE_LABEL[kind]}
                  </Action>
                ))}
              </div>
            </Section>
          </>
        )}
      </Loaded>

      <TableSheet
        table={editing}
        open={editing !== null || adding}
        onClose={() => {
          setEditing(null);
          setAdding(false);
        }}
        pending={saveTable.pending}
        onSave={(input) => void saveTable.run(input)}
      />

      {element}
    </DeskPage>
  );
}

function TableSheet({
  table,
  open,
  onClose,
  pending,
  onSave,
}: {
  table: DeskTable | null;
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onSave: (input: { id: number | null; label: string; capacity: number; zone: string }) => void;
}) {
  const [label, setLabel] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [zone, setZone] = useState("");
  const [loadedFor, setLoadedFor] = useState<number | null | undefined>(undefined);

  /* Fills the form the first time this opens for a given table, without an
     effect that would fight the person typing. */
  const target = table?.id ?? null;
  if (open && loadedFor !== target) {
    setLoadedFor(target);
    setLabel(table?.label ?? "");
    setCapacity(table?.capacity ?? 4);
    setZone(table?.zone ?? "");
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={table ? `Table ${table.label}` : "Add a table"}
      footer={
        <Action
          tone="primary"
          block
          pending={pending}
          pendingLabel="Saving"
          disabled={!label.trim()}
          onClick={() => onSave({ id: table?.id ?? null, label: label.trim(), capacity, zone: zone.trim() })}
        >
          Save
        </Action>
      }
    >
      <div className="stack">
        <TextField
          label="What it is called"
          hint="What staff shout across the room. Short."
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={12}
          required
        />

        <Field label="How many it seats">
          {() => <Counter value={capacity} onChange={setCapacity} min={1} max={20} label="Seats" />}
        </Field>

        <SelectField label="Where it is" value={zone} onChange={(event) => setZone(event.target.value)}>
          <option value="">Anywhere</option>
          <option value="Inside">Inside</option>
          <option value="Outside">Outside</option>
          <option value="By the grill">By the grill</option>
          <option value="Upstairs">Upstairs</option>
        </SelectField>
      </div>
    </Sheet>
  );
}
