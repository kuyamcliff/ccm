import { useState } from "react";
import { api } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { stampLabel } from "~/lib/format";
import { DeskPage, Loaded, Nothing, Pager, Search, TableWrap, Toolbar } from "./parts";

/**
 * Who did what.
 *
 * Owner and above only, and read-only by design: an audit log somebody can edit
 * is not an audit log. Paginated on the server because it is the one table that
 * only ever grows.
 *
 * The action names are the raw ones the server writes rather than something
 * friendlier. That is deliberate. This screen exists for the moment somebody
 * needs to establish exactly what happened, and a translated label is a layer
 * between the reader and the record.
 */

const PAGE = 40;

export function AuditLog() {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);

  const log = useQuery(
    K.desk.audit(query, offset),
    () => api.desk.audit({ q: query || undefined, limit: PAGE, offset }),
    { staleMs: 20_000 }
  );

  return (
    <DeskPage title="Audit log" hint="Every action that changed something. Owner only, and read only.">
      <Toolbar>
        <Search
          value={query}
          onChange={(next) => {
            setQuery(next);
            setOffset(0);
          }}
          placeholder="Person, action or target"
        />
      </Toolbar>

      <Loaded query={log}>
        {(page) =>
          page.entries.length === 0 ? (
            <Nothing icon="list">Nothing recorded.</Nothing>
          ) : (
            <>
              <TableWrap label="Audit log">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Did</th>
                    <th>To</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {page.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="nowrap fine faint">{stampLabel(entry.created_at)}</td>
                      <td className="nowrap">{entry.actor_name || <span className="faint">System</span>}</td>
                      <td>
                        <code className="dk-code">{entry.action}</code>
                      </td>
                      <td className="nowrap fine faint">
                        {entry.target_type}
                        {entry.target_id ? ` ${entry.target_id}` : ""}
                      </td>
                      <td className="dk-wrapcell fine">{entry.detail || <span className="faint">None</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>

              <Pager offset={offset} limit={PAGE} more={page.more} onMove={setOffset} />
            </>
          )
        }
      </Loaded>
    </DeskPage>
  );
}
