import { useEffect, useMemo, useState } from "react";
import { api } from "~/lib/api";
import { DEFAULT_SITE_CONFIG, featureIsOn, parseSiteConfig, type FeatureName, type FeatureWindow, type HomeSection, type SiteConfig } from "~/lib/siteConfig";
import { useResource } from "~/lib/useResource";
import { Button } from "~/ui/Button";
import { TextAreaField, Switch } from "~/ui/Field";
import { Notice } from "~/ui/Feedback";
import { useToast } from "~/state/toast";
import { useVenue } from "~/state/venue";
import { DeskPage } from "./parts";

const featureRows: { key: FeatureName; label: string; hint: string }[] = [
  { key: "customerAccounts", label: "Customer accounts", hint: "Sign-in, bookings history, receipts and loyalty." },
  { key: "ordering", label: "Online takeaway", hint: "The customer takeaway flow and its navigation." },
  { key: "booking", label: "Online table booking", hint: "The table reservation flow." },
  { key: "waitlist", label: "Waitlist", hint: "Let people join the queue from their phones." },
  { key: "offers", label: "Offers", hint: "Show deals and promotions to customers." },
  { key: "reviews", label: "Reviews", hint: "Customer reviews, ratings and replies." },
  { key: "gallery", label: "Gallery", hint: "Public restaurant photos." },
  { key: "events", label: "Private events", hint: "Event enquiry forms and event content." },
  { key: "loyalty", label: "Loyalty", hint: "Points earned and redeemed by customers." },
  { key: "giftCards", label: "Gift cards", hint: "Gift card validation and customer display." },
  { key: "supportChat", label: "Support chat", hint: "The floating support conversation." },
];
const homeRows: { key: HomeSection; label: string; hint: string }[] = [
  { key: "hero", label: "Hero", hint: "The first visual and primary calls to action." },
  { key: "featured", label: "Featured dishes", hint: "Popular items on the homepage." },
  { key: "ways", label: "Quick ways in", hint: "Order, book and queue shortcuts." },
  { key: "offer", label: "Offer of the day", hint: "One current promotion near the top of the homepage." },
  { key: "gallery", label: "Gallery preview", hint: "A small photo strip linking into the full gallery." },
  { key: "accountCta", label: "Account invitation", hint: "The sign-in/create-account strip for visitors." },
  { key: "reviews", label: "Word of mouth", hint: "Featured customer review." },
  { key: "location", label: "Find us", hint: "Address, hours, phone and directions." },
];
function toggle<T extends Record<string, boolean>>(value: T, key: keyof T): T { return { ...value, [key]: !value[key] }; }

/**
 * Converts between an absolute instant and what a `datetime-local` input wants.
 *
 * The input speaks the owner's own wall clock and has no idea what timezone
 * that is; the config stores absolute instants, because a schedule set in Buea
 * and read by a customer whose phone is set to London has to mean the same
 * moment to both. These two functions are where that conversion happens, and
 * nowhere else.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (value.trim() === "") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** What a schedule is doing right now, said in a sentence rather than left for
    the owner to work out from two timestamps. */
function scheduleState(window: FeatureWindow | undefined, switchedOn: boolean): { tone: "good" | "warn" | "bad"; text: string } | null {
  if (!switchedOn) return { tone: "bad", text: "Switched off. The schedule does not apply until you turn it back on." };
  if (!window) return null;

  const now = Date.now();
  const start = window.startAt ? Date.parse(window.startAt) : null;
  const end = window.endAt ? Date.parse(window.endAt) : null;

  if (start !== null && end !== null && end <= start) {
    return { tone: "bad", text: "The end is before the start, so this never turns on. Check the dates." };
  }
  if (start !== null && now < start) return { tone: "warn", text: `Off until ${new Date(start).toLocaleString()}.` };
  if (end !== null && now >= end) return { tone: "bad", text: `Ended ${new Date(end).toLocaleString()}. Customers cannot see this.` };
  if (end !== null) return { tone: "good", text: `On until ${new Date(end).toLocaleString()}.` };
  return { tone: "good", text: "On, with no end set." };
}

function FeatureRow({
  item,
  draft,
  setDraft,
}: {
  item: { key: FeatureName; label: string; hint: string };
  draft: SiteConfig;
  setDraft: (next: SiteConfig) => void;
}) {
  const window = draft.schedules[item.key];
  const [open, setOpen] = useState(Boolean(window));
  const switchedOn = draft.features[item.key];
  const state = scheduleState(window, switchedOn);
  const live = featureIsOn(draft, item.key);

  function setWindow(next: FeatureWindow | null) {
    const schedules = { ...draft.schedules };
    if (next === null || (next.startAt === null && next.endAt === null)) delete schedules[item.key];
    else schedules[item.key] = next;
    setDraft({ ...draft, schedules });
  }

  return (
    <div className="feature-row">
      <Switch
        checked={switchedOn}
        label={
          <span className="site-control__label">
            <strong>{item.label}</strong>
            <span className="site-control__hint">{item.hint}</span>
          </span>
        }
        onChange={() => setDraft({ ...draft, features: toggle(draft.features, item.key) })}
      />
      <div className="feature-row__schedule">
        <button type="button" className="feature-row__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {window ? "Scheduled" : "Schedule"}
          {window && !live ? <span className="feature-row__dot" aria-hidden="true" /> : null}
        </button>
        {open ? (
          <div className="feature-row__window">
            <label className="field">
              <span className="field__label">On from</span>
              <input
                className="input"
                type="datetime-local"
                value={toLocalInput(window?.startAt ?? null)}
                onChange={(event) => setWindow({ startAt: fromLocalInput(event.target.value), endAt: window?.endAt ?? null })}
              />
            </label>
            <label className="field">
              <span className="field__label">Off from</span>
              <input
                className="input"
                type="datetime-local"
                value={toLocalInput(window?.endAt ?? null)}
                onChange={(event) => setWindow({ startAt: window?.startAt ?? null, endAt: fromLocalInput(event.target.value) })}
              />
            </label>
            {state ? <p className={`fine feature-row__state feature-row__state--${state.tone}`}>{state.text}</p> : (
              <p className="fine faint">Leave both empty and this feature follows its switch alone.</p>
            )}
            {window ? (
              <button type="button" className="feature-row__clear" onClick={() => setWindow(null)}>
                Remove the schedule
              </button>
            ) : null}
          </div>
        ) : state && window ? (
          <p className={`fine feature-row__state feature-row__state--${state.tone}`}>{state.text}</p>
        ) : null}
      </div>
    </div>
  );
}

export function SiteControl() {
  const settings = useResource(() => api.site.settings(), []);
  const venue = useVenue();
  const toast = useToast();
  const [draft, setDraft] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [busy, setBusy] = useState(false);

  /* Through the parser, not JSON.parse. A blob saved by an older version, or
     hand-edited, is missing whole sections — and a draft missing `payments`
     takes this page down with it the moment it renders `draft.payments.mtn`.
     The parser fills every gap with the same default the customer site uses,
     so what the owner edits is what the customer sees. */
  useEffect(() => {
    if (!settings.data) return;
    setDraft(parseSiteConfig(settings.data.site_config_json));
  }, [settings.data]);

  /* Compared against the parsed form, not the stored text. Otherwise the
     parser filling in a missing section reads as an unsaved edit and the page
     warns about leaving before the owner has touched anything. */
  const dirty = useMemo(
    () => JSON.stringify(parseSiteConfig(settings.data?.site_config_json)) !== JSON.stringify(draft),
    [draft, settings.data?.site_config_json]
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const dependencyWarning = !draft.features.customerAccounts && (draft.features.booking || draft.features.loyalty)
    ? "Customer accounts are required by the current booking/loyalty flows. Turn Customer accounts back on, or disable those dependent features too."
    : null;

  async function save() {
    if (dependencyWarning) { toast.say(dependencyWarning); return; }
    setBusy(true);
    try {
      await api.desk.settings.update({ site_config_json: JSON.stringify(draft) });
      settings.reload(); venue.refresh();
      toast.done("Site control saved. The customer preview updates from this configuration.");
    } catch (err) { toast.failed(err); }
    finally { setBusy(false); }
  }

  function preview(path: string) { window.open(`/admin${path}`, "_blank", "noopener,noreferrer"); }
  function setMode(mode: SiteConfig["business"]["mode"]) { setDraft({ ...draft, business: { ...draft.business, mode } }); }

  return (
    <DeskPage title="Site control" lead="Control customer-facing features, homepage sections, service availability, support and live restaurant state.">
      <div className="row row--wrap" style={{ marginBottom: "var(--s-5)" }}>
        <Button tone="ghost" icon="eye" onClick={() => preview("/")}>Preview customer site</Button>
        <Button tone="quiet" onClick={() => preview("/?lang=fr")}>Preview French</Button>
      </div>
      <div className="stack stack--loose">
        {dependencyWarning ? <Notice tone="warn" title="Feature dependency">{dependencyWarning}</Notice> : null}
        <section className="card stack site-control__grid"><div className="site-control__section"><div className="section-head"><h2 className="display display--md">Live restaurant state</h2><p className="fine muted">This changes the status customers see across the preview site.</p></div><div className="site-control__mode">{(["open", "busy", "closed"] as const).map((mode) => <button key={mode} type="button" data-active={draft.business.mode === mode} onClick={() => setMode(mode)}>{mode === "open" ? "Open" : mode === "busy" ? "Busy right now" : "Closed"}</button>)}</div><TextAreaField label="Customer message" hint="Shown with the live status. Keep it short and human." rows={3} value={draft.business.message.en} onChange={(event) => setDraft({ ...draft, business: { ...draft.business, message: { ...draft.business.message, en: event.target.value } } })} /><TextAreaField label="Message en français" rows={3} value={draft.business.message.fr} onChange={(event) => setDraft({ ...draft, business: { ...draft.business, message: { ...draft.business.message, fr: event.target.value } } })} /></div></section>
        <div className="site-control__grid"><section className="card stack site-control__section site-control__section--half"><div className="section-head"><h2 className="display display--md">Customer features</h2><p className="fine muted">Turn a feature off and the customer navigation, route and relevant calls to action disappear or show a friendly unavailable state.</p></div><p className="fine faint">A schedule narrows when a feature is on. It can only take away: a feature you switch off stays off inside its window.</p>{featureRows.map((item) => <FeatureRow key={item.key} item={item} draft={draft} setDraft={setDraft} />)}</section><section className="card stack site-control__section site-control__section--half"><div className="section-head"><h2 className="display display--md">Homepage sections</h2><p className="fine muted">Choose exactly which content blocks customers see on the homepage.</p></div>{homeRows.map((item) => <Switch key={item.key} checked={draft.homepage[item.key]} label={<span className="site-control__label"><strong>{item.label}</strong><span className="site-control__hint">{item.hint}</span></span>} onChange={() => setDraft({ ...draft, homepage: toggle(draft.homepage, item.key) })} />)}</section></div>
        <div className="site-control__grid"><section className="card stack site-control__section site-control__section--half"><div className="section-head"><h2 className="display display--md">Service controls</h2><p className="fine muted">Pausing a service keeps the rest of the site usable and gives customers a clear explanation.</p></div><ServiceSwitch label="Takeaway" mode={draft.services.ordering.mode} setMode={(mode) => setDraft({ ...draft, services: { ...draft.services, ordering: { ...draft.services.ordering, mode } } })} /><ServiceSwitch label="Table booking" mode={draft.services.booking.mode} setMode={(mode) => setDraft({ ...draft, services: { ...draft.services, booking: { ...draft.services.booking, mode } } })} /><ServiceSwitch label="Waitlist" mode={draft.services.waitlist.mode} setMode={(mode) => setDraft({ ...draft, services: { ...draft.services, waitlist: { ...draft.services.waitlist, mode } } })} /></section><section className="card stack site-control__section site-control__section--half"><div className="section-head"><h2 className="display display--md">Payments</h2><p className="fine muted">CCM accepts only MTN Mobile Money and Orange Money. There is no card payment option.</p></div><Switch checked={draft.payments.mtn} label="MTN Mobile Money" onChange={() => setDraft({ ...draft, payments: { ...draft.payments, mtn: !draft.payments.mtn } })} /><Switch checked={draft.payments.orange} label="Orange Money" onChange={() => setDraft({ ...draft, payments: { ...draft.payments, orange: !draft.payments.orange } })} />{!draft.payments.mtn && !draft.payments.orange ? <Notice tone="warn">No payment method is enabled. Customers cannot complete paid bookings or takeaway orders.</Notice> : null}</section></div>
        <section className="card stack"><div className="section-head"><h2 className="display display--md">Support</h2><p className="fine muted">Control where customer support appears and how it describes availability.</p></div><Switch checked={draft.support.enabled} label="Enable customer support chat" onChange={() => setDraft({ ...draft, support: { ...draft.support, enabled: !draft.support.enabled } })} /><Switch checked={draft.support.staffed} label="Show support as staffed" onChange={() => setDraft({ ...draft, support: { ...draft.support, staffed: !draft.support.staffed } })} /><Switch checked={draft.support.whatsapp} label="Show WhatsApp contact" onChange={() => setDraft({ ...draft, support: { ...draft.support, whatsapp: !draft.support.whatsapp } })} /><Switch checked={draft.support.phone} label="Show phone contact" onChange={() => setDraft({ ...draft, support: { ...draft.support, phone: !draft.support.phone } })} /><label className="field"><span className="field__label">Typical support reply, minutes</span><input className="input" type="number" min={1} max={1440} value={draft.support.responseMinutes} onChange={(event) => setDraft({ ...draft, support: { ...draft.support, responseMinutes: Math.max(1, Math.min(1440, Number(event.target.value) || 1)) } })} /></label><TextAreaField label="After-hours message (English)" rows={2} value={draft.support.afterHoursMessage.en} onChange={(event) => setDraft({ ...draft, support: { ...draft.support, afterHoursMessage: { ...draft.support.afterHoursMessage, en: event.target.value } } })} /><TextAreaField label="After-hours message (French)" rows={2} value={draft.support.afterHoursMessage.fr} onChange={(event) => setDraft({ ...draft, support: { ...draft.support, afterHoursMessage: { ...draft.support.afterHoursMessage, fr: event.target.value } } })} /></section>
        <section className="card stack"><div className="section-head"><h2 className="display display--md">Languages</h2><p className="fine muted">English and French are the customer languages.</p></div><Switch checked={draft.locales.en} label="English" onChange={() => setDraft({ ...draft, locales: { ...draft.locales, en: !draft.locales.en } })} /><Switch checked={draft.locales.fr} label="French" onChange={() => setDraft({ ...draft, locales: { ...draft.locales, fr: !draft.locales.fr } })} /><div className="row row--wrap">{(["en", "fr"] as const).map((locale) => <button key={locale} type="button" className={`btn ${draft.defaultLocale === locale ? "btn--primary" : "btn--ghost"}`} disabled={!draft.locales[locale]} onClick={() => setDraft({ ...draft, defaultLocale: locale })}>Default: {locale.toUpperCase()}</button>)}</div></section>
        <section className="card stack"><div className="section-head"><h2 className="display display--md">Announcement bar</h2><p className="fine muted">One short customer-visible message across the site.</p></div><Switch checked={draft.announcement.enabled} label="Show announcement" onChange={() => setDraft({ ...draft, announcement: { ...draft.announcement, enabled: !draft.announcement.enabled } })} /><select className="select" value={draft.announcement.tone} onChange={(event) => setDraft({ ...draft, announcement: { ...draft.announcement, tone: event.target.value as SiteConfig["announcement"]["tone"] } })}><option value="info">Info</option><option value="good">Good news</option><option value="warn">Important</option></select><TextAreaField label="English" rows={2} value={draft.announcement.message.en} onChange={(event) => setDraft({ ...draft, announcement: { ...draft.announcement, message: { ...draft.announcement.message, en: event.target.value } } })} /><TextAreaField label="French" rows={2} value={draft.announcement.message.fr} onChange={(event) => setDraft({ ...draft, announcement: { ...draft.announcement, message: { ...draft.announcement.message, fr: event.target.value } } })} /></section>
        <div className="row row--between"><span className={dirty ? "site-control__status" : "fine faint"}>{dirty ? "Unsaved changes" : "All customer controls are saved."}</span><Button tone="primary" busy={busy} disabled={!dirty || Boolean(dependencyWarning)} onClick={() => void save()}>Save site control</Button></div>
      </div>
    </DeskPage>
  );
}
function ServiceSwitch({ label, mode, setMode }: { label: string; mode: "open" | "paused"; setMode: (mode: "open" | "paused") => void }) { return <Switch checked={mode === "open"} label={<span className="site-control__label"><strong>{label}</strong><span className="site-control__hint">{mode === "open" ? "Accepting customers" : "Paused for customers"}</span></span>} onChange={(checked) => setMode(checked ? "open" : "paused")} />; }
