import { api } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { Meter } from "~/ui/Bits";
import { DeskPage, Loaded, StatTile, Stats, TableWrap } from "../parts";

/**
 * What is actually in the database.
 *
 * Row counts and the total size. Enough to answer "is anything being written",
 * "how big is this getting" and "did that import work", which is most of what
 * anybody wants from a database screen they cannot run queries in.
 *
 * There is no query box, deliberately. A console that can run arbitrary SQL
 * against a live restaurant is one bad paste away from an evening's bookings,
 * and the value over reading counts is small. If a developer needs SQL they have
 * the connection string.
 */
export function DevData() {
  const data = useQuery(K.dev.database, () => api.desk.dev.database(), { staleMs: 60_000 });

  return (
    <DeskPage title="Database" hint="Row counts and size. Read only, and deliberately so.">
      <Loaded query={data}>
        {(result) => {
          const total = result.tables.reduce((sum, table) => sum + table.rows, 0);
          const biggest = Math.max(1, ...result.tables.map((table) => table.rows));

          return (
            <>
              <Stats>
                <StatTile label="Tables" value={result.tables.length} />
                <StatTile label="Rows, all told" value={total.toLocaleString("en-US")} />
                <StatTile label="On disk" value={result.database_size} />
              </Stats>

              <TableWrap label="Tables">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Rows</th>
                    <th aria-label="Relative size" />
                  </tr>
                </thead>
                <tbody>
                  {[...result.tables]
                    .sort((a, b) => b.rows - a.rows)
                    .map((table) => (
                      <tr key={table.table}>
                        <td>
                          <code className="dk-code">{table.table}</code>
                        </td>
                        <td className="nowrap strong">{table.rows.toLocaleString("en-US")}</td>
                        <td className="dk-metercell">
                          <Meter value={table.rows} max={biggest} label={`${table.table} rows`} tone="neutral" />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </TableWrap>
            </>
          );
        }}
      </Loaded>
    </DeskPage>
  );
}
