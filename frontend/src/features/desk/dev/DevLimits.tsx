import { api } from "~/lib/api";
import type { DevLimit } from "~/lib/api";
import { useMutation, usePoll, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { Action } from "~/ui/Button";
import { Notice } from "~/ui/Feedback";
import { useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded, Nothing, Section, State } from "../parts";

/**
 * Who is locked out, and letting them back in.
 *
 * One real, recurring situation: somebody mistypes their password five times,
 * the limiter does exactly its job, and now the owner cannot reach their own
 * console for fifteen minutes on a Friday evening. The remedies used to be to
 * wait, or to restart the service so the counters went with it.
 *
 * The limiters themselves are not softened. They are the reason a stolen email
 * address is not worth much here, and the answer to "this is inconvenient" is a
 * button for the one person who can be trusted with it, not a higher ceiling.
 *
 * Clearing one is audited, and that is not decoration: this is the only control
 * in the console that makes an attack easier rather than harder, so a record of
 * who did it and for whom is the price of it existing.
 */

/** Plain English for each limiter, so the screen does not require somebody to
    have read `middleware/security.ts` to use it. */
const WHAT: Record<string, string> = {
  "login-ip": "Sign-in attempts from one device",
  "login-email": "Sign-in attempts for one account",
  "login-2fa": "Two-step codes tried",
  register: "New accounts from one device",
  global: "All requests from one device",
  "reset-request": "Password reset requests",
  "reset-redeem": "Password reset codes tried",
  order: "Orders placed",
  pay: "Payment attempts",
};

function humanWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s left`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min left`;
}

export function DevLimits() {
  const toast = useToast();
  const { confirm, element } = useConfirm();

  const limits = useQuery(K.dev.limits, () => api.desk.dev.limits(), { staleMs: 5_000 });

  const entries = limits.data?.entries ?? [];
  const blocked = entries.filter((entry) => entry.blocked);
  const counting = entries.filter((entry) => !entry.blocked);

  /* A countdown is only useful if it counts. */
  usePoll(() => limits.reload(), 10_000);

  const clear = useMutation(async (entry: DevLimit) => {
    await api.desk.dev.clearLimit(entry.bucket, entry.key);
    invalidate("dev.limits");
    limits.reload();
    toast.done("Cleared. They can try again now.");
  });

  return (
    <DeskPage title="Rate limits" hint="Who is being throttled right now.">
      <Notice tone="info">
        Counters live in memory on this instance and expire on their own. Clearing one is written to the audit log.
      </Notice>

      <Loaded query={limits}>
        {(data) => (
          <>
            {blocked.length === 0 && counting.length === 0 ? (
              <Nothing icon="check-circle">Nobody is throttled. All {data.buckets.length} limiters are quiet.</Nothing>
            ) : (
              <Section
                title={blocked.length > 0 ? `${blocked.length} locked out` : "Nobody is locked out"}
                hint={
                  counting.length > 0
                    ? `${counting.length} more being counted but still under the limit.`
                    : "Longest wait first."
                }
              >
                <div className="rows rows--inset">
                  {data.entries.map((entry) => (
                    <div key={`${entry.bucket}:${entry.key}`} className="row">
                      <span className="grow stack stack--tight">
                        <span className="fine mono clip">{entry.key}</span>
                        <span className="micro faint">{WHAT[entry.bucket] ?? entry.bucket}</span>
                      </span>

                      <span className="stack stack--tight right">
                        {/* Blocked and counting are genuinely different states
                            and the screen used to call both "throttled". */}
                        <State tone={entry.blocked ? "bad" : "neutral"}>
                          {entry.blocked ? humanWait(entry.resetInSeconds) : "Counting"}
                        </State>
                        <span className="micro faint">
                          {entry.count} of {entry.max}
                        </span>
                      </span>

                      <Action
                        size="sm"
                        tone="quiet"
                        pending={clear.pendingFor(entry.key)}
                        pendingLabel="Clearing"
                        onClick={async () => {
                          const sure = await confirm({
                            title: "Let them try again?",
                            body: `Clears ${WHAT[entry.bucket] ?? entry.bucket} for ${entry.key}. Do this when you know who it is.`,
                            confirmLabel: "Clear it",
                          });
                          if (!sure) return;
                          await clear.run(entry);
                          const failure = clear.readError();
                          if (failure) toast.failed(failure, "desk");
                        }}
                      >
                        Clear
                      </Action>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* A count, not a wall of chips. Twenty-five names, most of which
                explain themselves and none of which anybody is looking for,
                took more screen than the thing this page is actually for. */}
            <p className="fine faint">{data.buckets.length} limiters running on this instance.</p>
          </>
        )}
      </Loaded>

      {element}
    </DeskPage>
  );
}
