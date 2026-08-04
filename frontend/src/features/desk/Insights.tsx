import { api } from "~/lib/api";
import { dayLabel, money } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Icon } from "~/ui/Icon";
import { DeskPage, Loaded, Stat } from "./parts";
import { BarChart, TrendChart } from "./charts";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Direction of travel against the previous window of the same length. */
function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (before === 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  const up = change >= 0;
  return (
    <span className={`delta${up ? " delta--up" : " delta--down"}`}>
      <Icon name={up ? "arrow-right" : "arrow-right"} size={13} />
      {up ? "+" : ""}
      {change}% {label}
    </span>
  );
}

/**
 * The numbers behind the last thirty days.
 *
 * Every chart here shows one series against one axis. Where two measures would
 * be tempting to overlay, they are two charts instead: sticking revenue and
 * booking counts on the same picture with two scales makes a shape that means
 * nothing.
 */
export function Insights() {
  const analytics = useResource(() => api.desk.analytics(), []);

  return (
    <DeskPage title="Insights" lead="The last thirty days, against the thirty before them.">
      <Loaded resource={analytics} skeletonHeight="12rem">
        {(data) => (
          <>
            <div className="stat-grid">
              <Stat
                label="Bookings"
                value={data.window30.bookings}
                icon="calendar"
                hint={`${data.window30.covers} covers`}
              />
              <Stat label="Turned up" value={data.window30.arrived} icon="check-circle" hint={`${data.window30.cancelled} cancelled`} />
              <Stat
                label="Taken"
                value={data.revenueByDay.reduce((sum, day) => sum + day.revenue, 0)}
                money
                icon="wallet"
              />
              <Stat
                label="Rating"
                value={data.reviewSummary.avg_rating ? data.reviewSummary.avg_rating.toFixed(1) : "No reviews"}
                icon="star"
                hint={`${data.reviewSummary.total} reviews`}
              />
            </div>

            {/* Nothing to compare against on a new site, and three repetitions
                of "no earlier figure" reads as a fault rather than a fact. */}
            {data.previous.bookings > 0 || data.previous.covers > 0 || data.previous.revenue > 0 ? (
              <div className="row row--wrap" style={{ gap: "var(--s-4)" }}>
                <Delta now={data.window30.bookings} before={data.previous.bookings} label="bookings" />
                <Delta now={data.window30.covers} before={data.previous.covers} label="covers" />
                <Delta
                  now={data.revenueByDay.reduce((sum, day) => sum + day.revenue, 0)}
                  before={data.previous.revenue}
                  label="taken"
                />
              </div>
            ) : (
              <p className="fine faint">No earlier month to compare against yet.</p>
            )}

            <div className="chart-grid">
              <section className="card">
                <TrendChart
                  title="Taken per day, FCFA"
                  unit="FCFA"
                  format={money}
                  points={data.revenueByDay.map((day) => ({ label: dayLabel(day.day), value: day.revenue }))}
                />
              </section>

              <section className="card">
                <BarChart
                  title="Bookings by hour"
                  unit="bookings"
                  points={data.peakHours.map((hour) => ({ label: hour.hour, value: hour.count }))}
                />
              </section>

              <section className="card">
                <BarChart
                  title="Busiest days of the week"
                  unit="bookings"
                  points={data.busiestDays.map((day) => ({
                    label: (WEEKDAYS[day.weekday] ?? "").slice(0, 3),
                    value: day.count,
                  }))}
                />
              </section>

              <section className="card">
                <TrendChart
                  title="New accounts per day"
                  unit="accounts"
                  points={data.newUsersByDay.map((day) => ({ label: dayLabel(day.day), value: day.count }))}
                />
              </section>

              <section className="card chart-grid__wide">
                <BarChart
                  horizontal
                  title="Most ordered dishes, by quantity"
                  unit="portions"
                  points={data.topMenuItems.map((item) => ({ label: item.name, value: item.qty }))}
                />
              </section>
            </div>
          </>
        )}
      </Loaded>
    </DeskPage>
  );
}
