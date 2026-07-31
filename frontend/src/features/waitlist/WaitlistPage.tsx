import { useState } from "react";
import { api } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { normalisePhone, pluralise } from "~/lib/format";
import { useAction, usePoll, useResource } from "~/lib/useResource";
import { Button, LinkButton } from "~/ui/Button";
import { Counter, PhoneField, TextField } from "~/ui/Field";
import { Icon } from "~/ui/Icon";
import { Notice, Skeleton } from "~/ui/Feedback";
import { useSession } from "~/state/session";

/**
 * The queue, for people who are already standing outside.
 *
 * Written for someone holding a phone in a car park: how long, and put my name
 * down. The wait figure refreshes on its own because it is the one number that
 * changes while they are looking at it.
 */
export function WaitlistPage() {
  const { user } = useSession();
  const queue = useResource(() => api.site.waitlist(), []);
  usePoll(queue.reload, 30_000);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [party, setParty] = useState(2);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ position: number; est_wait_minutes: number } | null>(null);

  const join = useAction(api.site.joinWaitlist);

  if (joined) {
    return (
      <div className="page section stack stack--loose" style={{ maxWidth: "32rem" }}>
        <div className="section-head">
          <hr className="heat-rule" />
          <h1 className="display display--xl">You are on the list</h1>
        </div>
        <div className="card stack queue-card">
          <div>
            <span className="label">Your place</span>
            <p className="queue-card__num mono">{joined.position}</p>
          </div>
          <p className="muted">
            Roughly {pluralise(joined.est_wait_minutes, "minute")}. We will call {phone} when your table is ready, so
            keep your phone with you and stay nearby.
          </p>
        </div>
        <LinkButton to="/menu" tone="ghost">
          Look at the menu while you wait
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Join the queue</h1>
        <p className="lead">
          For when the place is full and you are already here. If you are planning ahead, book a table instead.
        </p>
      </div>

      <div className="queue-layout">
        <div className="card stack queue-now">
          {queue.loading ? (
            <Skeleton height="5rem" />
          ) : (
            <>
              <div>
                <span className="label">Waiting now</span>
                <p className="queue-card__num mono">{queue.data?.waiting ?? 0}</p>
              </div>
              <p className="muted">
                <Icon name="clock" size={16} /> About {pluralise(queue.data?.est_wait_minutes ?? 0, "minute")} from now.
              </p>
              <p className="fine faint">This updates by itself.</p>
            </>
          )}
        </div>

        <form
          className="card stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setProblem(null);
            const digits = normalisePhone(phone);
            if (name.trim().length < 2) {
              setProblem("Enter the name we should call out.");
              return;
            }
            if (digits.length < 8) {
              setProblem("Enter a phone number we can call.");
              return;
            }
            const result = await join.run({
              name: name.trim(),
              phone: digits,
              party_size: party,
              note: note.trim() || undefined,
            });
            if (!result) {
              const failure = join.readError();
              setProblem(failure instanceof ApiError ? failure.message : "That did not go through.");
              return;
            }
            setJoined(result);
          }}
        >
          <TextField
            label="Name"
            hint="What we will call out."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
          <PhoneField label="Phone number" value={phone} onChange={setPhone} required />

          <div className="field">
            <span className="field__label">How many of you</span>
            <Counter value={party} min={1} max={20} onChange={setParty} label="party size" />
          </div>

          <TextField
            label="Anything to note"
            placeholder="Optional. Outside table, high chair."
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
          />

          {problem ? <Notice tone="bad">{problem}</Notice> : null}

          <Button type="submit" tone="primary" size="lg" block busy={join.busy}>
            Put my name down
          </Button>
        </form>
      </div>
    </div>
  );
}
