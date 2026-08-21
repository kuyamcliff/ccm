import { useEffect, useState } from "react";
import { api } from "~/lib/api";
import type { SiteConfig } from "~/lib/siteConfig";
import { DEFAULT_SITE_CONFIG } from "~/lib/siteConfig";
import { useMutation, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { Button } from "~/ui/Button";
import { TextField, TextAreaField, Switch, Segmented } from "~/ui/Field";
import { useConfirm } from "~/ui/Sheet";
import { Notice } from "~/ui/Feedback";
import { DeskPage, Section } from "./parts";
import { useVenue } from "~/state/venue";
import { useToast } from "~/state/toast";
import { useSession } from "~/state/session";

/**
 * The switches that change what customers can do.
 *
 * Owner only, because these close the shop.
 *
 * ── The distinction that runs through this screen ──────────────────────────
 *
 * A **feature** is whether this restaurant does a thing at all. A **service** is
 * whether it is doing it right now. Turning bookings off entirely and pausing
 * them for the evening are different sentences to say to a customer, and the
 * owner's own wording is what gets shown in both cases.
 *
 * ── Maintenance cannot lock anybody out ────────────────────────────────────
 *
 * Closing the site never closes it to staff, and never closes the sign-in page.
 * Both are enforced on the server as well. Without that, an owner could turn
 * this on, sign out, and have no way back to the switch that turns it off.
 */

const FEATURES: { key: keyof SiteConfig["features"]; label: string; hint: string }[] = [
  { key: "customerAccounts", label: "Accounts", hint: "Signing up and signing in. Off means no bookings either." },
  { key: "ordering", label: "Takeaway", hint: "Ordering ahead for collection." },
  { key: "booking", label: "Table booking", hint: "Holding a table with a deposit." },
  { key: "waitlist", label: "The queue", hint: "Walk-ins putting their name down." },
  { key: "reviews", label: "Reviews", hint: "Guests leaving and reading reviews." },
  { key: "gallery", label: "Photos", hint: "The gallery, and guests sending photos in." },
  { key: "offers", label: "Offers", hint: "The offers page and the strip on the home page." },
  { key: "events", label: "Events", hint: "Enquiries about booking the place out." },
  { key: "loyalty", label: "Points", hint: "Earning and spending points." },
  { key: "giftCards", label: "Gift cards", hint: "Redeeming cards at checkout." },
  { key: "supportChat", label: "Chat", hint: "The live support chat and its button." },
];

const HOME: { key: keyof SiteConfig["homepage"]; label: string }[] = [
  { key: "hero", label: "The big photograph at the top" },
  { key: "featured", label: "What people order" },
  { key: "offer", label: "This week's offer" },
  { key: "ways", label: "Three ways in" },
  { key: "gallery", label: "Inside the place" },
  { key: "accountCta", label: "The account prompt" },
  { key: "reviews", label: "One review" },
  { key: "location", label: "Where we are" },
];

export function SiteControl() {
  const toast = useToast();
  const { isTopOwner } = useSession();
  const { siteConfig, refresh } = useVenue();
  const { confirm, element } = useConfirm();

  const [draft, setDraft] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);

  useEffect(() => {
    setDraft(siteConfig);
  }, [siteConfig]);

  const save = useMutation(async (next: SiteConfig) => {
    await api.desk.settings.update({ site_config_json: JSON.stringify(next) });
    invalidate(K.settings);
    refresh();
    toast.done("Saved. The site has changed for everybody.");
  });

  /* Every switch saves at once rather than collecting changes behind a button.
     These are emergency controls: somebody turning takeaway off at nine on a
     Friday because the grill has died should not then have to find Save. */
  function commit(next: SiteConfig) {
    setDraft(next);
    void save.run(next);
  }

  if (!isTopOwner) {
    return (
      <DeskPage title="Site control">
        <Notice tone="info" title="Owner only">
          These switches change what every customer can do, so only the owner can touch them.
        </Notice>
      </DeskPage>
    );
  }

  return (
    <DeskPage title="Site control" hint="These change the site for everybody, the moment you press them.">
      {save.pending ? <p className="fine faint">Saving.</p> : null}

      {/* ── Closed entirely ────────────────────────────────────────────────*/}
      <Section
        title="Close the site"
        hint="Customers see a holding page. You and your staff carry on as normal, and the sign-in page stays open so you can always get back in."
      >
        <Switch
          label="Site closed for maintenance"
          checked={draft.maintenance.enabled}
          onChange={async (enabled) => {
            if (enabled) {
              const sure = await confirm({
                title: "Close the site to customers?",
                body: "Nobody will be able to book, order or read the menu until you turn this back on. Staff are unaffected.",
                confirmLabel: "Close it",
              });
              if (!sure) return;
            }
            commit({ ...draft, maintenance: { ...draft.maintenance, enabled } });
          }}
        />

        <TextAreaField
          label="What the holding page says"
          value={draft.maintenance.message.en}
          onChange={(event) =>
            setDraft({
              ...draft,
              maintenance: { ...draft.maintenance, message: { ...draft.maintenance.message, en: event.target.value } },
            })
          }
          rows={3}
        />
        <TextAreaField
          label="La même chose, en français"
          value={draft.maintenance.message.fr}
          onChange={(event) =>
            setDraft({
              ...draft,
              maintenance: { ...draft.maintenance, message: { ...draft.maintenance.message, fr: event.target.value } },
            })
          }
          rows={3}
        />
        <Button size="sm" tone="ghost" onClick={() => commit(draft)}>
          Save the wording
        </Button>
      </Section>

      {/* ── Tonight ────────────────────────────────────────────────────────*/}
      <Section title="Tonight" hint="For a busy night or an early close, without shutting the site.">
        <Segmented
          value={draft.business.mode}
          onChange={(mode) => commit({ ...draft, business: { ...draft.business, mode } })}
          label="How things are"
          options={[
            { value: "open", label: "Open" },
            { value: "busy", label: "Busy" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <TextAreaField
          label="What to say about it"
          hint="Shows in the strip under the top bar."
          value={draft.business.message.en}
          onChange={(event) =>
            setDraft({
              ...draft,
              business: { ...draft.business, message: { ...draft.business.message, en: event.target.value } },
            })
          }
          rows={2}
        />
        <TextAreaField
          label="En français"
          value={draft.business.message.fr}
          onChange={(event) =>
            setDraft({
              ...draft,
              business: { ...draft.business, message: { ...draft.business.message, fr: event.target.value } },
            })
          }
          rows={2}
        />
        <Button size="sm" tone="ghost" onClick={() => commit(draft)}>
          Save the wording
        </Button>
      </Section>

      {/* ── Pausing one service ────────────────────────────────────────────*/}
      <Section
        title="Pause a service"
        hint="The feature stays on, it is just not taking anything right now."
      >
        {(["ordering", "booking", "waitlist"] as const).map((service) => (
          <div key={service} className="dk-service">
            <Switch
              label={service === "ordering" ? "Takeaway" : service === "booking" ? "Bookings" : "The queue"}
              hint={draft.services[service].mode === "open" ? "Taking orders" : "Paused"}
              checked={draft.services[service].mode === "open"}
              onChange={(open) =>
                commit({
                  ...draft,
                  services: {
                    ...draft.services,
                    [service]: { ...draft.services[service], mode: open ? "open" : "paused" },
                  },
                })
              }
            />
            {draft.services[service].mode !== "open" ? (
              <TextField
                label="What customers are told"
                value={draft.services[service].message.en}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    services: {
                      ...draft.services,
                      [service]: {
                        ...draft.services[service],
                        message: { ...draft.services[service].message, en: event.target.value },
                      },
                    },
                  })
                }
                onBlur={() => commit(draft)}
              />
            ) : null}
          </div>
        ))}
      </Section>

      {/* ── Announcement ───────────────────────────────────────────────────*/}
      <Section title="Announcement" hint="One line across the top of every page.">
        <Switch
          label="Showing an announcement"
          checked={draft.announcement.enabled}
          onChange={(enabled) => commit({ ...draft, announcement: { ...draft.announcement, enabled } })}
        />
        <Segmented
          value={draft.announcement.tone}
          onChange={(tone) => commit({ ...draft, announcement: { ...draft.announcement, tone } })}
          label="How it reads"
          options={[
            { value: "info", label: "Neutral" },
            { value: "good", label: "Good news" },
            { value: "warn", label: "Warning" },
          ]}
        />
        <TextField
          label="The announcement"
          value={draft.announcement.message.en}
          onChange={(event) =>
            setDraft({
              ...draft,
              announcement: {
                ...draft.announcement,
                message: { ...draft.announcement.message, en: event.target.value },
              },
            })
          }
          onBlur={() => commit(draft)}
        />
        <TextField
          label="En français"
          value={draft.announcement.message.fr}
          onChange={(event) =>
            setDraft({
              ...draft,
              announcement: {
                ...draft.announcement,
                message: { ...draft.announcement.message, fr: event.target.value },
              },
            })
          }
          onBlur={() => commit(draft)}
        />
      </Section>

      {/* ── Paying ─────────────────────────────────────────────────────────*/}
      <Section title="How people can pay" hint="Turn one off if a wallet is down.">
        <Switch
          label="MTN Mobile Money"
          checked={draft.payments.mtn}
          onChange={(mtn) => commit({ ...draft, payments: { ...draft.payments, mtn } })}
        />
        <Switch
          label="Orange Money"
          checked={draft.payments.orange}
          onChange={(orange) => commit({ ...draft, payments: { ...draft.payments, orange } })}
        />
        <Switch
          label="Cash at the counter"
          hint="Takeaway orders are placed and held unpaid until somebody takes the money."
          checked={draft.payments.cash}
          onChange={(cash) => commit({ ...draft, payments: { ...draft.payments, cash } })}
        />
      </Section>

      {/* ── Features ───────────────────────────────────────────────────────*/}
      <Section title="What the site does at all" hint="Off means the page is gone, not paused.">
        {FEATURES.map((feature) => (
          <Switch
            key={feature.key}
            label={feature.label}
            hint={feature.hint}
            checked={draft.features[feature.key]}
            onChange={(on) => commit({ ...draft, features: { ...draft.features, [feature.key]: on } })}
          />
        ))}
      </Section>

      {/* ── Home page ──────────────────────────────────────────────────────*/}
      <Section title="What is on the home page">
        {HOME.map((block) => (
          <Switch
            key={block.key}
            label={block.label}
            checked={draft.homepage[block.key]}
            onChange={(on) => commit({ ...draft, homepage: { ...draft.homepage, [block.key]: on } })}
          />
        ))}
      </Section>

      {/* ── Chat ───────────────────────────────────────────────────────────*/}
      <Section title="Support">
        <Switch
          label="Chat is on"
          checked={draft.support.enabled}
          onChange={(enabled) => commit({ ...draft, support: { ...draft.support, enabled } })}
        />
        <Switch
          label="Somebody is at the desk"
          hint="Turn off when nobody is watching it. Guests are told rather than left waiting."
          checked={draft.support.staffed}
          onChange={(staffed) => commit({ ...draft, support: { ...draft.support, staffed } })}
        />
        <Switch
          label="Show the phone number"
          checked={draft.support.phone}
          onChange={(phone) => commit({ ...draft, support: { ...draft.support, phone } })}
        />
        <Switch
          label="Show WhatsApp"
          checked={draft.support.whatsapp}
          onChange={(whatsapp) => commit({ ...draft, support: { ...draft.support, whatsapp } })}
        />
      </Section>

      {/* ── Languages ──────────────────────────────────────────────────────*/}
      <Section title="Languages" hint="Turning one off hides the switcher.">
        <Switch
          label="English"
          checked={draft.locales.en}
          onChange={(en) => commit({ ...draft, locales: { ...draft.locales, en } })}
        />
        <Switch
          label="Français"
          checked={draft.locales.fr}
          onChange={(fr) => commit({ ...draft, locales: { ...draft.locales, fr } })}
        />
      </Section>

      {element}
    </DeskPage>
  );
}
