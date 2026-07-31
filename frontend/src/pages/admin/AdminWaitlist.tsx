import { useEffect, useState } from "react";
import { api, WaitlistEntry } from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useLanguage } from "../../i18n/context";

const STATUS_COLORS: Record<string, string> = {
  waiting: "#f59e0b",
  notified: "#3b82f6",
  seated: "#22c55e",
  cancelled: "#6b7280",
  no_show: "#ef4444",
};

const STATUS_KEYS: Record<string, string> = {
  waiting: "statusWaiting",
  notified: "statusNotified",
  seated: "statusSeated",
  cancelled: "statusCancelled",
  no_show: "statusNoShow",
};

export default function AdminWaitlist() {
  const { t } = useLanguage();
  const ta = (key: string) => t("admin", key);
  const tw = (key: string) => t("adminWaitlist", key);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearOpen, setClearOpen] = useState(false);

  const load = () => api.admin.waitlist().then((d) => { setEntries(d.entries); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, []);

  async function update(id: number, status: string) {
    await api.admin.updateWaitlistEntry(id, status);
    load();
  }

  async function doClear() {
    setClearOpen(false);
    await api.admin.clearWaitlist();
    load();
  }

  const waiting = entries.filter((e) => e.status === "waiting").length;

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{tw("title")}</h1>
          <p className="admin-page-sub">{tw("subtitle").replace("{n}", String(waiting))}</p>
        </div>
        <button className="btn btn-sm btn-outline" onClick={() => setClearOpen(true)}>{tw("clearOldEntries")}</button>
      </div>

      {loading && <p className="muted">{ta("loading")}</p>}

      {!loading && entries.length === 0 && <p className="muted">{tw("noEntries")}</p>}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{tw("colNumber")}</th>
              <th>{ta("colName")}</th>
              <th>{ta("colPhone")}</th>
              <th>{tw("colParty")}</th>
              <th>{ta("colNote")}</th>
              <th>{tw("colJoined")}</th>
              <th>{ta("colStatus")}</th>
              <th>{ta("colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id}>
                <td data-label={tw("colNumber")}>{i + 1}</td>
                <td data-label={ta("colName")}>{e.name}</td>
                <td data-label={ta("colPhone")}><a href={`tel:${e.phone}`}>{e.phone}</a></td>
                <td data-label={tw("colParty")}>{e.party_size}</td>
                <td data-label={ta("colNote")}>{e.note || ""}</td>
                <td data-label={tw("colJoined")}>{new Date(e.joined_at + "Z").toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
                <td data-label={ta("colStatus")}>
                  <span className="status-pill" style={{ background: STATUS_COLORS[e.status] + "22", color: STATUS_COLORS[e.status] }}>
                    {ta(STATUS_KEYS[e.status] ?? "statusWaiting")}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {e.status === "waiting" && (
                      <>
                        <button className="btn btn-sm btn-outline" onClick={() => update(e.id, "notified")}>{tw("notify")}</button>
                        <button className="btn btn-sm btn-primary" onClick={() => update(e.id, "seated")}>{tw("seat")}</button>
                        <button className="btn btn-sm btn-outline" onClick={() => update(e.id, "no_show")}>{tw("noShow")}</button>
                      </>
                    )}
                    {e.status === "notified" && (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => update(e.id, "seated")}>{tw("seat")}</button>
                        <button className="btn btn-sm btn-outline" onClick={() => update(e.id, "no_show")}>{tw("noShow")}</button>
                      </>
                    )}
                    {(e.status === "seated" || e.status === "cancelled" || e.status === "no_show") && (
                      <span className="muted" style={{ fontSize: "0.8rem" }}>{ta("done")}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={clearOpen}
        title={tw("clearTitle")}
        body={tw("clearBody")}
        confirmLabel={tw("clearConfirm")}
        confirmClass="btn-danger"
        onConfirm={doClear}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
