import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import type { SiteSettings } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { TextField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { useToast } from "~/state/toast";
import { DeskPage, Loaded } from "./parts";

/**
 * The restaurant's own details.
 *
 * Everything on this screen appears on the public site, which is worth saying
 * out loud: a phone number typed wrong here is a phone number nobody can reach
 * you on. The server only accepts the keys listed below, so a typo in a field
 * name silently does nothing rather than inventing a setting.
 */

const FIELDS: { key: keyof SiteSettings; label: string; hint?: string; type?: string }[] = [
  { key: "phone", label: "Phone number", hint: "Shown on the site and used for the call button." },
  { key: "address", label: "Street address", hint: "How somebody would find you on foot." },
  { key: "city", label: "Town" },
  { key: "region", label: "Region" },
  { key: "hours", label: "Opening hours", hint: "Written out, for example: every day, midday until late." },
  { key: "tiktok_url", label: "TikTok", type: "url" },
  { key: "ig_url", label: "Instagram", type: "url" },
  { key: "fb_url", label: "Facebook", type: "url" },
  {
    key: "booking_deposit_fcfa",
    label: "Table deposit, FCFA",
    hint: "What a guest pays to hold a table. It comes off their bill. Changing it changes every price the site quotes.",
    type: "number",
  },
  {
    key: "late_cancel_fee_fcfa",
    label: "Late cancellation fee, FCFA",
    hint: "Kept when somebody cancels inside the hour, because the table sat empty.",
    type: "number",
  },
];

export function Settings() {
  const settings = useResource(() => api.site.settings(), []);
  const toast = useToast();
  const [draft, setDraft] = useState<SiteSettings>({});
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const dirty = FIELDS.some((field) => (draft[field.key] ?? "") !== (settings.data?.[field.key] ?? ""));

  return (
    <DeskPage title="Details" lead="What the site says about the place.">
      <Loaded resource={settings}>
        {() => (
          <form
            className="card stack"
            style={{ maxWidth: "36rem" }}
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                const changed: Record<string, string> = {};
                for (const field of FIELDS) {
                  const value = draft[field.key] ?? "";
                  if (value !== (settings.data?.[field.key] ?? "")) changed[field.key] = value;
                }
                await api.desk.settings.update(changed);
                settings.reload();
                toast.done("Saved. The site shows it now.");
              } catch (err) {
                toast.failed(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            {FIELDS.map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                hint={field.hint}
                type={field.type ?? "text"}
                value={draft[field.key] ?? ""}
                maxLength={400}
                onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
              />
            ))}

            <div className="row">
              <Button type="submit" tone="primary" busy={busy} disabled={!dirty}>
                Save
              </Button>
              {dirty ? (
                <Button tone="quiet" onClick={() => setDraft(settings.data ?? {})}>
                  Undo changes
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </Loaded>

      <section className="card stack" style={{ maxWidth: "36rem" }}>
        <h2 className="card__title">Test the email</h2>
        <p className="fine muted">
          Sends one message to check that password resets can go out. It never contains a reset code.
        </p>
        <TextField
          label="Send it to"
          type="email"
          placeholder="Leave empty to send it to yourself"
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
        />
        <div className="row">
          <Button
            icon="mail"
            onClick={async () => {
              try {
                const result = await api.desk.settings.sendTestEmail(testTo.trim() || undefined);
                toast.done(`Sent to ${result.to}.`);
              } catch (err) {
                toast.failed(err, "Email is not set up on the server.");
              }
            }}
          >
            Send a test
          </Button>
        </div>
        <Notice tone="info">
          If this fails, password resets are switched off and the sign-in page tells people to message you instead.
        </Notice>
      </section>
    </DeskPage>
  );
}
