import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import type { SiteSettings } from "~/lib/api";
import { useMutation, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { money } from "~/lib/format";
import { Action } from "~/ui/Button";
import { TextField, TextAreaField } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Section } from "./parts";
import { useVenue } from "~/state/venue";
import { useToast } from "~/state/toast";

/**
 * Your phone number, address, hours and social links.
 *
 * ── Why this is the most important screen in the console ───────────────────
 *
 * Everything the site says about this restaurant is read from here. The footer,
 * the Find us page, the contact links, the share card, the maintenance screen,
 * the deposit charged at checkout. Nothing is hardcoded, on purpose, and the
 * consequence is that a wrong phone number here is a phone number nobody can
 * reach and only the owner can fix it.
 *
 * The money fields are the other half. The deposit and the late cancellation fee
 * are enforced by the server, and the loyalty numbers govern what a point is
 * worth. Changing what the scheme costs is not a deploy.
 */

type Draft = Record<string, string>;

const KEYS = [
  "phone",
  "address",
  "city",
  "region",
  "hours",
  "tiktok_url",
  "ig_url",
  "fb_url",
  "booking_deposit_fcfa",
  "late_cancel_fee_fcfa",
  "loyalty_point_value_fcfa",
  "loyalty_min_redeem_points",
  "loyalty_max_redeem_percent",
] as const;

export function Settings() {
  const toast = useToast();
  const { settings, refresh } = useVenue();
  const [draft, setDraft] = useState<Draft>({});
  const [testTo, setTestTo] = useState("");

  /* Loaded once from whatever the venue provider already has, so this screen
     never waits on a request of its own. */
  useEffect(() => {
    const next: Draft = {};
    for (const key of KEYS) next[key] = String((settings as Record<string, unknown>)[key] ?? "");
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const save = useMutation(async () => {
    const updates: Partial<SiteSettings> = {};
    for (const key of KEYS) {
      const value = draft[key] ?? "";
      (updates as Record<string, string>)[key] = value.trim();
    }
    await api.desk.settings.update(updates);
    invalidate(K.settings);
    refresh();
    toast.done("Saved. The whole site reads these.");
  });

  const testEmail = useMutation(async () => {
    const result = await api.desk.settings.sendTestEmail(testTo.trim() || undefined);
    toast.done(`Sent to ${result.to}.`);
  });

  const pointValue = Number(draft.loyalty_point_value_fcfa) || 0;

  return (
    <DeskPage
      title="Details"
      hint="Everything the site says about this place comes from here."
      actions={
        <Action
          size="sm"
          tone="primary"
          pending={save.pending}
          pendingLabel="Saving"
          onClick={async () => {
            await save.run();
            const error = save.readError();
            if (error) toast.failed(error, "desk");
          }}
        >
          Save
        </Action>
      }
    >
      <Notice tone="info">
        A wrong phone number here is a phone number nobody can reach. Check these before a busy night.
      </Notice>

      <Section title="Where you are">
        <TextField
          label="Phone"
          hint="Nine digits, no country code. This is what the Call button rings."
          value={draft.phone ?? ""}
          onChange={(event) => set("phone", event.target.value.replace(/\D/g, ""))}
          inputMode="tel"
        />
        <TextField
          label="Street"
          value={draft.address ?? ""}
          onChange={(event) => set("address", event.target.value)}
        />
        <TextField label="Town" value={draft.city ?? ""} onChange={(event) => set("city", event.target.value)} />
        <TextField label="Region" value={draft.region ?? ""} onChange={(event) => set("region", event.target.value)} />
        <TextAreaField
          label="Opening hours"
          hint='In words, as you would say them. For example "Every day, midday until late".'
          value={draft.hours ?? ""}
          onChange={(event) => set("hours", event.target.value)}
          rows={2}
        />
      </Section>

      <Section title="Where people find you" hint="Leave any of these empty to hide the link.">
        <TextField
          label="TikTok"
          value={draft.tiktok_url ?? ""}
          onChange={(event) => set("tiktok_url", event.target.value)}
          placeholder="https://www.tiktok.com/@cam.chop.meat"
          inputMode="url"
        />
        <TextField
          label="Instagram"
          value={draft.ig_url ?? ""}
          onChange={(event) => set("ig_url", event.target.value)}
          inputMode="url"
        />
        <TextField
          label="Facebook"
          value={draft.fb_url ?? ""}
          onChange={(event) => set("fb_url", event.target.value)}
          inputMode="url"
        />
      </Section>

      <Section title="Money" hint="The server charges what is here, not what is on the board outside.">
        <TextField
          label="Table deposit, FCFA"
          hint="Held to book a table, and taken off the bill."
          value={draft.booking_deposit_fcfa ?? ""}
          onChange={(event) => set("booking_deposit_fcfa", event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />
        <TextField
          label="Late cancellation fee, FCFA"
          hint="Kept when somebody cancels less than an hour before."
          value={draft.late_cancel_fee_fcfa ?? ""}
          onChange={(event) => set("late_cancel_fee_fcfa", event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />
      </Section>

      <Section
        title="Points"
        hint="A guest earns one point per 100 FCFA. These three decide what that is worth."
      >
        <TextField
          label="What one point is worth, FCFA"
          value={draft.loyalty_point_value_fcfa ?? ""}
          onChange={(event) => set("loyalty_point_value_fcfa", event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />
        <TextField
          label="Points needed before any can be spent"
          hint="Stops somebody redeeming four points against a whole bill."
          value={draft.loyalty_min_redeem_points ?? ""}
          onChange={(event) => set("loyalty_min_redeem_points", event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />
        <TextField
          label="Most of one bill points may cover, percent"
          hint="Half is sensible. However many somebody has saved, the rest still arrives as money."
          value={draft.loyalty_max_redeem_percent ?? ""}
          onChange={(event) => set("loyalty_max_redeem_percent", event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />

        {pointValue > 0 ? (
          <p className="fine faint">
            At this rate, a guest spending {money(10000)} FCFA earns 100 points, worth{" "}
            {money(100 * pointValue)} FCFA off a future bill.
          </p>
        ) : null}
      </Section>

      <Section
        title="Email"
        hint="Password reset codes go by email. Send yourself one to check it is working."
      >
        <TextField
          label="Send a test to"
          hint="Leave empty to send it to your own address."
          value={testTo}
          onChange={(event) => setTestTo(event.target.value)}
          type="email"
          inputMode="email"
        />
        <Action
          size="sm"
          tone="ghost"
          icon="mail"
          pending={testEmail.pending}
          pendingLabel="Sending"
          onClick={async () => {
            await testEmail.run();
            const error = testEmail.readError();
            if (error) toast.failed(error, "desk");
          }}
        >
          Send a test
        </Action>
      </Section>
    </DeskPage>
  );
}
