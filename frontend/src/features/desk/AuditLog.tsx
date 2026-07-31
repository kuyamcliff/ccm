import { useMemo, useState } from "react";
import { api } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { DeskPage, Loaded, Nothing, TableWrap, Toolbar } from "./parts";

/**
 * Who did what.
 *
 * Owner only. It exists for the conversation that starts "this booking was
 * cancelled and nobody knows why", so it is deliberately plain and complete
 * rather than summarised.
 */
export function AuditLog() {
  const entries = useResource(() => api.desk.audit(300), []);
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = entries.data ?? [];
    if (!needle) return rows;
    return rows.filter((entry) =>
      [entry.actor_name, entry.action, entry.target_type, entry.target_id, entry.detail]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [entries.data, search]);

  return (
    <DeskPage title="Audit log" lead="Every action staff took in the console, newest first.">
      <Toolbar>
        <label className="desk-field desk-field--grow">
          <span className="label">Search</span>
          <input
            type="search"
            className="input"
            placeholder="Name, action or record"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Button tone="ghost" icon="refresh" onClick={entries.reload}>
          Refresh
        </Button>
      </Toolbar>

      <Loaded resource={entries}>
        {() =>
          shown.length === 0 ? (
            <Nothing>Nothing recorded that matches.</Nothing>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Did what</th>
                  <th>To</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((entry) => (
                  <tr key={entry.id}>
                    <td className="fine faint">{stampLabel(entry.created_at)}</td>
                    <td>{entry.actor_name || "System"}</td>
                    <td className="mono fine">{entry.action}</td>
                    <td className="fine">
                      {entry.target_type}
                      {entry.target_id ? <span className="faint"> {entry.target_id}</span> : null}
                    </td>
                    <td className="fine muted">{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        }
      </Loaded>
    </DeskPage>
  );
}
