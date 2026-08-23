import { useState } from "react";
import { api } from "~/lib/api";
import type { DevRouteStat } from "~/lib/api";
import { useMutation, usePoll, useQuery, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { timeAgo } from "~/lib/format";
import { Action } from "~/ui/Button";
import { Notice } from "~/ui/Feedback";
import { useConfirm } from "~/ui/Sheet";
import { DeskPage, Loaded, Nothing, Search, Section, State, Stats, StatTile } from "../parts";

/**
 * Where the time goes.
 *
 * The counterpart to Errors: that screen answers "what broke", this one answers
 * the question that usually comes first and is far harder to get at from a
 * phone. A hosted platform's metrics page is a laptop and a login away, and the
 * person asking is usually standing in the restaurant.
 *
 * ── What the numbers mean, and why two of them ─────────────────────────────
 *
 * Sorted by p95, not by traffic. The busiest route is almost never the one
 * causing trouble, and an average hides the problem completely: a route that
 * answers in 20ms for ninety-nine people and 4 seconds for the hundredth has a
 * fine average and one furious customer.
 *
 * Errors and failures are counted separately and shown separately. A 409 from
 * the booking clash is the product working exactly as designed; rolling it in
 * with the 500s would make a busy Friday look like an outage.
 *
 * ── Mobile first ──────────────────────────────────────────────────────────
 *
 * No table. Each route is a row that reads top to bottom on a phone: what it is,
 * then the two numbers that matter, then how much of it there was. Tables belong
 * on screens where the columns line up, and four numeric columns on a 390px
 * screen line up nowhere.
 */
export function DevTraffic() {
  const [query, setQuery] = useState("");
  const { confirm, element } = useConfirm();

  const traffic = useQuery(K.dev.traffic, () => api.desk.dev.traffic(), { staleMs: 5_000 });

  /* This is a live picture of a running server, and the reason to have it open
     is to watch something. Ten seconds is often enough to see a change and rare
     enough to cost nothing. */
  usePoll(() => traffic.reload(), 10_000);

  const reset = useMutation(async () => {
    await api.desk.dev.clearTraffic();
    invalidate("dev.traffic");
    traffic.reload();
  });

  const routes = (traffic.data?.routes ?? []).filter((row) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return row.route.toLowerCase().includes(needle) || row.method.toLowerCase().includes(needle);
  });

  const totals = traffic.data;
  const failing = (totals?.routes ?? []).reduce((sum, row) => sum + row.failures, 0);

  return (
    <DeskPage
      title="Traffic"
      hint="Per-route timings since this instance started."
      actions={
        <Action
          size="sm"
          tone="quiet"
          icon="refresh"
          pending={reset.pending}
          pendingLabel="Clearing"
          onClick={async () => {
            const sure = await confirm({
              title: "Start counting again?",
              body: "Clears the timings so you can watch one thing in isolation. Nothing is lost that would have survived a restart anyway.",
              confirmLabel: "Start again",
            });
            if (!sure) return;
            await reset.run();
          }}
        >
          Reset
        </Action>
      }
    >
      <Notice tone="info">
        Held in memory on this instance. It starts empty after every restart and answers what is happening now, not what
        happened last Tuesday.
      </Notice>

      <Loaded query={traffic}>
        {(data) => (
          <>
            <Stats>
              <StatTile label="Requests" value={data.total.toLocaleString("en-US")} note={`since ${timeAgo(data.since)}`} />
              <StatTile label="Routes" value={data.routes.length} />
              <StatTile label="Server faults" value={failing} note={failing === 0 ? "nothing broken" : "see Errors"} />
            </Stats>

            {data.dropped > 0 ? (
              <Notice tone="warn" title="Some requests were not counted">
                {data.dropped.toLocaleString("en-US")} requests hit the ceiling on how many routes are tracked, which
                means a path shape is not being normalised and is making a bucket per id. Worth a look at
                <code> lib/traffic.ts</code>.
              </Notice>
            ) : null}

            {data.slowest.length > 0 ? (
              <Section title="Slowest requests" hint="The individual worst, not the most recent.">
                <div className="rows rows--inset">
                  {data.slowest.slice(0, 8).map((slow, index) => (
                    <div key={`${slow.at}-${index}`} className="row">
                      <span className="grow stack stack--tight">
                        <span className="fine mono clip">
                          {slow.method} {slow.route}
                        </span>
                        <span className="micro faint">{timeAgo(slow.at)}</span>
                      </span>
                      <State tone={slow.ms > 1000 ? "bad" : "warn"}>{slow.ms}ms</State>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            <Search value={query} onChange={setQuery} placeholder="Filter routes" />

            {routes.length === 0 ? (
              <Nothing icon="search">
                {data.total === 0 ? "Nothing has been asked of this instance yet." : "No route matches that."}
              </Nothing>
            ) : (
              <div className="stack stack--snug">
                {routes.map((row) => (
                  <RouteRow key={`${row.method} ${row.route}`} row={row} />
                ))}
              </div>
            )}
          </>
        )}
      </Loaded>

      {element}
    </DeskPage>
  );
}

/**
 * One route.
 *
 * p95 leads because it is the number that describes what a customer actually
 * felt. p50 sits beside it as the contrast: far apart means the route is
 * usually fine and occasionally terrible, which is a different bug from one
 * that is uniformly slow.
 */
function RouteRow({ row }: { row: DevRouteStat }) {
  const slow = row.p95 >= 1000;
  const warn = !slow && row.p95 >= 400;

  return (
    <article className="dk-route" data-tone={slow ? "bad" : warn ? "warn" : undefined}>
      <div className="bar bar--between bar--top">
        <span className="fine mono clip grow">
          <span className="dk-route__method">{row.method}</span> {row.route}
        </span>
        {row.failures > 0 ? <State tone="bad">{row.failures} failed</State> : null}
      </div>

      <div className="dk-route__figures">
        <span className="stack stack--tight">
          <span className="micro faint">p95</span>
          <span className="strong">{row.p95}ms</span>
        </span>
        <span className="stack stack--tight">
          <span className="micro faint">p50</span>
          <span className="fine">{row.p50}ms</span>
        </span>
        <span className="stack stack--tight">
          <span className="micro faint">worst</span>
          <span className="fine">{row.max}ms</span>
        </span>
        <span className="stack stack--tight">
          <span className="micro faint">calls</span>
          <span className="fine">{row.count.toLocaleString("en-US")}</span>
        </span>
      </div>

      {row.errors > 0 ? (
        <p className="micro faint">
          {row.errors} answered 4xx or 5xx
          {row.failures === 0 ? ", none of them ours" : ""}
        </p>
      ) : null}
    </article>
  );
}
