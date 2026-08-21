import { api } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { money } from "~/lib/format";
import { Stars } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, Section, StatTile, Stats, TableWrap } from "./parts";
import { BarChart, TrendChart } from "./charts";

/**
 * The last thirty days against the thirty before.
 *
 * Every number here is a comparison, because a bare number tells the owner
 * nothing they did not already feel. "412 covers" is a fact; "412 covers, up
 * from 380" is a decision about whether to order more goat.
 *
 * The no-show rate is the one worth staring at: it is the number the reminder
 * sequence exists to move, and the only way to tell whether it is working.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "up 8%", "down 3%", or "about the same". Never a bare signed number. */
function change(now: number, before: number): { word: string; tone: "good" | "bad" | "neutral" } {
  if (before === 0) return now > 0 ? { word: "new", tone: "good" } : { word: "nothing yet", tone: "neutral" };
  const percent = Math.round(((now - before) / before) * 100);
  if (Math.abs(percent) < 3) return { word: "about the same", tone: "neutral" };
  return percent > 0
    ? { word: `up ${percent}%`, tone: "good" }
    : { word: `down ${Math.abs(percent)}%`, tone: "bad" };
}

export function Insights() {
  const insights = useQuery(K.desk.analytics, () => api.desk.analytics(), { staleMs: 5 * 60 * 1000 });

  return (
    <DeskPage title="Insights" hint="The last thirty days, against the thirty before.">
      <Loaded query={insights}>
        {(data) => {
          const revenue = data.revenueByDay.reduce((sum, day) => sum + day.revenue, 0);
          const noShows = data.window30.bookings - data.window30.arrived - data.window30.cancelled;
          const noShowRate = data.window30.bookings > 0 ? Math.round((noShows / data.window30.bookings) * 100) : 0;

          const bookingsChange = change(data.window30.bookings, data.previous.bookings);
          const coversChange = change(data.window30.covers, data.previous.covers);
          const revenueChange = change(revenue, data.previous.revenue);

          return (
            <>
              <Stats>
                <StatTile label="Bookings" value={data.window30.bookings} note={bookingsChange.word} />
                <StatTile label="Covers" value={data.window30.covers} note={coversChange.word} />
                <StatTile label="Taken" value={`${money(revenue)} FCFA`} note={revenueChange.word} />
                <StatTile
                  label="No shows"
                  value={`${noShowRate}%`}
                  note={noShows === 0 ? "None at all" : `${noShows} tables held for nobody`}
                />
              </Stats>

              <Section title="Money, day by day">
                <TrendChart
                  points={data.revenueByDay.map((day) => ({ label: day.day, value: day.revenue }))}
                  label="Money taken per day over the last thirty days"
                  format={(value) => `${money(value)} FCFA`}
                />
              </Section>

              <Section title="When people come" hint="Bookings by hour, across the whole window.">
                <BarChart
                  points={data.peakHours.map((hour) => ({ label: hour.hour, value: hour.count }))}
                  label="Bookings by hour of day"
                />
              </Section>

              <Section title="Which days are busy">
                <BarChart
                  points={data.busiestDays.map((day) => ({
                    label: (WEEKDAYS[day.weekday] ?? "").slice(0, 3),
                    value: day.count,
                  }))}
                  label="Bookings by day of the week"
                />
              </Section>

              <Section title="New accounts">
                <TrendChart
                  points={data.newUsersByDay.map((day) => ({ label: day.day, value: day.count }))}
                  label="New accounts per day"
                />
              </Section>

              <Section title="What actually sells" hint="By quantity, not by how often it is looked at.">
                {data.topMenuItems.length === 0 ? (
                  <Nothing icon="list">Nothing ordered yet in this window.</Nothing>
                ) : (
                  <TableWrap label="Best selling dishes">
                    <thead>
                      <tr>
                        <th>Dish</th>
                        <th>Sold</th>
                        <th>Brought in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topMenuItems.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td className="nowrap">{item.qty}</td>
                          <td className="nowrap strong">{money(item.revenue)} FCFA</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </Section>

              <Section title="Reviews">
                <div className="bar bar--tight">
                  <Stars value={data.reviewSummary.avg_rating ?? 0} size={17} />
                  <span className="fine faint">from {data.reviewSummary.total}</span>
                </div>
              </Section>
            </>
          );
        }}
      </Loaded>
    </DeskPage>
  );
}
