import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import type { AuditEntry } from "~/lib/api";
import { stampLabel } from "~/lib/format";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { DeskPage, Loaded, Nothing, TableWrap, Toolbar } from "./parts";

/**
 * Who did what.
 *
 * Owner only. It exists for the conversation that starts "this booking was
 * cancelled and nobody knows why", so it is deliberately plain and complete
 * rather than summarised — but a busy console can log thousands of these,
 * so the search runs on the server and the list pages in rather than
 * arriving as one long fetch.
 */
const PAGE = 30;

export function AuditLog() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useResource(() => api.desk.audit({ q: term || undefined, limit: PAGE }), [term]);

  useEffect(() => {
    if (page.data) { setRows(page.data.entries); setMore(page.data.more); }
  }, [page.data]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await api.desk.audit({ q: term || undefined, limit: PAGE, offset: rows.length });
      setRows((current) => [...current, ...next.entries]);
      setMore(next.more);
    } finally {
      setLoadingMore(false);
    }
  }

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
        <Button tone="ghost" icon="refresh" onClick={page.reload}>
          Refresh
        </Button>
      </Toolbar>

      <Loaded resource={page}>
        {() =>
          rows.length === 0 ? (
            <Nothing>Nothing recorded that matches.</Nothing>
          ) : (
            <>
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
                  {rows.map((entry) => (
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
              {more ? (
                <Button tone="ghost" busy={loadingMore} onClick={() => void loadMore()}>
                  Show more
                </Button>
              ) : null}
            </>
          )
        }
      </Loaded>
    </DeskPage>
  );
}
