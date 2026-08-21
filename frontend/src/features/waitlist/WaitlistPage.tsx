import { useState } from "react";
import { api } from "~/lib/api";
import { useMutation, useQuery, usePoll } from "~/lib/store";
import { K } from "~/lib/keys";
import { normalisePhone } from "~/lib/format";
import { Action, LinkButton } from "~/ui/Button";
import { TextField, PhoneField, Counter, Field } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { Icon } from "~/ui/Icon";
import { Pulse } from "~/ui/Bits";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { useCopy } from "~/state/locale";

/**
 * The queue, on a full night.
 *
 * Somebody standing outside a busy restaurant will give you about twenty seconds
 * and three fields. Name, number, how many, done. No account needed: the whole
 * point is that they are already here.
 *
 * Once they are on the list the screen turns into a status board, and it polls,
 * because the answer they want is "how much longer" and it changes.
 */
export function WaitlistPage() {
  const { c, fill } = useCopy();
  const { user } = useSession();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [party, setParty] = useState(2);
  const [joined, setJoined] = useState<{ position: number; wait: number } | null>(null);

  const queue = useQuery(K.waitlist, () => api.site.waitlist(), { staleMs: 20_000 });
  usePoll(() => queue.reload(), joined ? 30_000 : null);

  const join = useMutation(async () => {
    const result = await api.site.joinWaitlist({
      name: name.trim(),
      phone: normalisePhone(phone),
      party_size: party,
    });
    setJoined({ position: result.position, wait: result.est_wait_minutes });
    toast.done(c.queue.joined);
    queue.reload();
  });

  /* ── Already on the list ──────────────────────────────────────────────────*/
  if (joined) {
    return (
      <div className="page section stack queue">
        <header className="stack stack--tight">
          <h1 className="display display--xl">{c.queue.joined}</h1>
        </header>

        {/* One of the three raised surfaces in the product. This is a thing you
            hold up and show somebody at the door. */}
        <div className="carry queue__pass">
          <p className="label">{c.queue.title}</p>
          <p className="display display--hero queue__number">{joined.position}</p>
          <p className="lead">{fill(c.queue.position, { n: joined.position })}</p>
          {joined.wait > 0 ? <p className="fine muted">{fill(c.queue.wait, { n: joined.wait })}</p> : null}
        </div>

        <Notice tone="info">
          Keep this page open, or keep your phone to hand. We will text you the moment a table clears.
        </Notice>

        <div className="rows">
          <div className="row">
            <Icon name="users" size={17} className="row__lead" />
            <span className="grow fine">{fill(c.queue.waiting, { n: queue.data?.waiting ?? 0 })}</span>
            <Pulse on label="Live" />
          </div>
        </div>

        <div className="bar bar--wrap">
          <LinkButton to="/menu" tone="primary" size="sm" icon="list">
            {c.home.seeMenu}
          </LinkButton>
        </div>
      </div>
    );
  }

  /* ── Joining ──────────────────────────────────────────────────────────────*/
  const ready = name.trim().length > 1 && normalisePhone(phone).length === 9;

  return (
    <div className="page section stack queue">
      <header className="stack stack--tight">
        <h1 className="display display--xl">{c.queue.title}</h1>
        <p className="lead">{c.queue.lead}</p>
      </header>

      {queue.data && queue.data.waiting > 0 ? (
        <Notice tone="info">
          {fill(c.queue.waiting, { n: queue.data.waiting })}
          {queue.data.est_wait_minutes > 0 ? `. ${fill(c.queue.wait, { n: queue.data.est_wait_minutes })}` : ""}
        </Notice>
      ) : null}

      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          await join.run();
          const error = join.readError();
          if (error) toast.failed(error, "join-queue");
        }}
      >
        <TextField
          label={c.queue.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />

        <PhoneField
          label={c.queue.phone}
          hint="We will text this number when your table is ready."
          value={phone}
          onChange={setPhone}
          required
        />

        <Field label={c.queue.party}>
          {() => <Counter value={party} onChange={setParty} min={1} max={20} label={c.queue.party} />}
        </Field>

        <Action
          type="submit"
          tone="primary"
          block
          pending={join.pending}
          pendingLabel={c.pending.joining}
          disabled={!ready}
        >
          {c.queue.join}
        </Action>
      </form>
    </div>
  );
}
