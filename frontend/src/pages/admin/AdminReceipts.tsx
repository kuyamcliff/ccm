import { useEffect, useState } from "react";
import { api } from "../../api";
import type { ReceiptSummary } from "../../api";
import { useLanguage } from "../../i18n/context";

type AdminReceipt = ReceiptSummary & { user_name: string; user_email: string; pay_reference: string | null };

export function AdminReceipts() {
  const { t } = useLanguage();
  const tr = (key: string) => t("adminReceipts", key);
  const [receipts, setReceipts] = useState<AdminReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [downloading, setDownloading] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.admin.receipts();
      setReceipts(r.receipts as AdminReceipt[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("errLoad"));
    } finally {
      setLoading(false);
    }
  }

  async function download(receipt: AdminReceipt) {
    setDownloading(receipt.id);
    try {
      const res = await api.downloadReceipt(receipt.id);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = receipt.ccm_code ? `${receipt.ccm_code}-receipt.pdf` : `receipt-${receipt.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(tr("errDownload"));
    } finally {
      setDownloading(null);
    }
  }

  const filtered = receipts.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      r.user_name.toLowerCase().includes(s) ||
      r.user_email.toLowerCase().includes(s) ||
      (r.ccm_code ?? "").toLowerCase().includes(s) ||
      (r.pay_reference ?? "").toLowerCase().includes(s)
    );
  });

  const totalRevenue = filtered.reduce((s, r) => s + (r.amount_fcfa ?? 0), 0);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <p className="adash-eyebrow">{tr("eyebrow")}</p>
          <h1 className="admin-page-title">{tr("title")}</h1>
        </div>
        {!loading && (
          <div style={{ textAlign: "right" }}>
            <p style={{ fontFamily: "var(--mono)", fontSize: "1.1rem", color: "var(--amber)" }}>
              {filtered.length > 0 ? `${totalRevenue.toLocaleString()} FCFA` : ""}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{filtered.length} {filtered.length !== 1 ? tr("receiptPlural") : tr("receiptSingular")}</p>
          </div>
        )}
      </div>

      <div className="admin-filters">
        <input
          type="search"
          className="admin-search"
          placeholder={tr("searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p className="empty-admin">{tr("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="empty-admin">{q ? tr("noMatch") : tr("noReceipts")}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr("colCcmCode")}</th>
                <th>{tr("colGuest")}</th>
                <th>{tr("colDate")}</th>
                <th>{tr("colTime")}</th>
                <th>{tr("colTable")}</th>
                <th>{tr("colParty")}</th>
                <th>{tr("colAmount")}</th>
                <th>{tr("colMethod")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td data-label={tr("colCcmCode")} className="mono" style={{ color: "var(--amber)", fontSize: "0.8rem" }}>
                    {r.ccm_code ?? `REC-${String(r.id).padStart(4, "0")}`}
                  </td>
                  <td data-label={tr("colGuest")}>
                    <span style={{ display: "block" }}>{r.user_name}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{r.user_email}</span>
                  </td>
                  <td data-label={tr("colDate")} className="mono">{r.date}</td>
                  <td data-label={tr("colTime")} className="mono">{r.time}</td>
                  <td data-label={tr("colTable")}>{r.table_label ?? ""}</td>
                  <td data-label={tr("colParty")}>{r.party_size}</td>
                  <td data-label={tr("colAmount")} className="mono">
                    {r.amount_fcfa ? `${r.amount_fcfa.toLocaleString()} FCFA` : ""}
                  </td>
                  <td data-label={tr("colMethod")}>
                    {r.pay_method ? (
                      <span className="badge badge-green">
                        {r.pay_method === "orange_money" ? tr("orangeMoney") : tr("mtnMomo")}
                      </span>
                    ) : ""}
                  </td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={downloading === r.id}
                      onClick={() => download(r)}
                    >
                      {downloading === r.id ? "..." : tr("pdf")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
