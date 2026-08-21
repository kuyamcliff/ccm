import { api } from "~/lib/api";
import { useQuery, usePoll } from "~/lib/store";
import { K } from "~/lib/keys";
import { Icon } from "~/ui/Icon";
import { DeskPage, Loaded, Section, State, StatTile, Stats } from "../parts";

/**
 * Is everything up.
 *
 * The first screen a developer opens when somebody says the site is broken, and
 * it is built to answer the three questions in that order: is the database
 * reachable, is this instance healthy, and are the optional integrations
 * actually configured *in this environment*.
 *
 * That last one is the quiet one. Almost every "why did nobody get a text" turns
 * out to be credentials that were never set on the deployed instance, and there
 * is no way to see that from the outside at all.
 */

function uptime(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

const INTEGRATION_LABEL: Record<string, { label: string; why: string }> = {
  mtn_momo: { label: "MTN Mobile Money", why: "Without this, MTN is never offered at checkout." },
  orange_money: { label: "Orange Money", why: "Without this, Orange is never offered at checkout." },
  messaging: { label: "WhatsApp and SMS", why: "Without this, messages are written down and never sent." },
  reminders: { label: "Reminder sweep", why: "Without CRON_SECRET the sweep refuses every request." },
};

export function DevSystem() {
  const health = useQuery(K.dev.health, () => api.desk.dev.health(), { staleMs: 10_000 });
  usePoll(() => health.reload(), 30_000);

  return (
    <DeskPage title="System" hint="This instance, right now. Refreshes every thirty seconds.">
      <Loaded query={health}>
        {(data) => (
          <>
            <Stats>
              <StatTile
                label="Database"
                value={data.database === "up" ? "Up" : "Down"}
                note={data.database_latency_ms !== null ? `${data.database_latency_ms}ms` : undefined}
              />
              <StatTile label="Up for" value={uptime(data.uptime_seconds)} />
              <StatTile label="Memory" value={`${data.memory.rss_mb} MB`} note={`heap ${data.memory.heap_used_mb} MB`} />
              <StatTile label="Errors held" value={data.errors_held} note="In memory, this instance" />
            </Stats>

            <Section title="Environment">
              <div className="rows">
                <div className="row">
                  <span className="grow label">Mode</span>
                  <State tone={data.environment === "production" ? "hot" : "neutral"}>{data.environment}</State>
                </div>
                <div className="row">
                  <span className="grow label">Node</span>
                  <span className="fine">{data.node}</span>
                </div>
                <div className="row">
                  <span className="grow label">Frontend URL</span>
                  <span className="fine clip">{data.frontend_url}</span>
                </div>
                <div className="row">
                  <span className="grow label">This check took</span>
                  <span className="fine">{data.checked_in_ms}ms</span>
                </div>
              </div>
            </Section>

            <Section
              title="Integrations"
              hint="Whether the credentials exist on this instance. Not whether the service is up."
            >
              <div className="rows">
                {Object.entries(data.integrations).map(([key, configured]) => {
                  const meta = INTEGRATION_LABEL[key] ?? { label: key, why: "" };
                  return (
                    <div key={key} className="row row--top">
                      <Icon
                        name={configured ? "check-circle" : "alert"}
                        size={17}
                        className={configured ? "row__lead" : "row__lead hot"}
                      />
                      <span className="grow stack stack--tight">
                        <span className="small">{meta.label}</span>
                        {!configured && meta.why ? <span className="fine faint">{meta.why}</span> : null}
                      </span>
                      <State tone={configured ? "good" : "warn"}>{configured ? "Configured" : "Not set"}</State>
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}
      </Loaded>
    </DeskPage>
  );
}
