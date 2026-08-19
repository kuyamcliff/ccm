import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, clashFromError, SLOTS } from "~/lib/api";
import type { Booking, BookingAlternatives, BookingClash, MenuItem } from "~/lib/api";
import { ApiError } from "~/lib/http";
import { addDays, dayLabel, isPastSlot, longDate, money, normalisePhone, timeLabel, todayISO, toISODate } from "~/lib/format";
import { useAction, useResource } from "~/lib/useResource";
import { Button, LinkButton } from "~/ui/Button";
import { Icon } from "~/ui/Icon";
import { Notice, Skeleton } from "~/ui/Feedback";
import { useSession } from "~/state/session";
import { useToast } from "~/state/toast";
import { useVenue } from "~/state/venue";
import { useLocale } from "~/state/locale";
import { MomoDialog } from "~/features/pay/MomoDialog";
import { BookingPass } from "~/features/mine/BookingPass";
import { basketLines, basketTotal, type Basket } from "./OrderStep";
import { DAYS_AHEAD, ReviewStep, WhenStep, WhereStep, WhoStep } from "./steps";

type Step = "when" | "who" | "where" | "review";
const ORDER: Step[] = ["when", "who", "where", "review"];
const TITLES: Record<Step, string> = { when: "When are you coming?", who: "How many of you?", where: "Where would you like to sit?", review: "Check and pay" };
const DRAFT_KEY = "ccm.booking.draft.v2";
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
interface BookingDraft { savedAt: number; date: string; time: string | null; party: number; tableId: number | null; phone: string; note: string; basket: Basket; }
function isStep(value: string | null): value is Step { return value !== null && (ORDER as string[]).includes(value); }
function firstOpenSlot(date: string): string | null { return SLOTS.find((slot) => !isPastSlot(date, slot)) ?? null; }
function readDraft(): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as BookingDraft;
    if (!draft || typeof draft.savedAt !== "number" || Date.now() - draft.savedAt > DRAFT_TTL_MS) { sessionStorage.removeItem(DRAFT_KEY); return null; }
    if (typeof draft.date !== "string" || !Array.isArray(Object.entries(draft.basket ?? {}))) return null;
    return draft;
  } catch { return null; }
}
function clearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} }

/**
 * What a clash is called, in the guest's own language.
 *
 * The server sends the reason as a word — "table", "guest" — and an English
 * sentence for anything that has nowhere to put a word. This screen has
 * somewhere to put it, so it uses the word and writes its own sentence rather
 * than showing a French-speaking guest an English one.
 */
const CLASH_TITLE = {
  en: { table: "That table has just gone", guest: "You are already booked for then" },
  fr: { table: "Cette table vient de partir", guest: "Vous avez déjà une table à cette heure" },
} as const;

const CLASH_BODY = {
  en: {
    table: "Somebody took it while you were filling this in. Nothing has been charged.",
    guest: "You already have a table booked for that exact time. Nothing has been charged.",
  },
  fr: {
    table: "Quelqu'un l'a prise pendant que vous remplissiez ceci. Rien n'a été débité.",
    guest: "Vous avez déjà une table réservée à cette heure exacte. Rien n'a été débité.",
  },
} as const;

export function BookPage() {
  const { user, ready } = useSession();
  const { depositFcfa } = useVenue();
  const { locale } = useLocale();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [draft] = useState<BookingDraft | null>(() => readDraft());
  const [date, setDate] = useState(() => draft?.date || todayISO());
  const [time, setTime] = useState<string | null>(() => draft?.time ?? firstOpenSlot(draft?.date || todayISO()));
  const [party, setParty] = useState(() => draft?.party ?? 2);
  const [tableId, setTableId] = useState<number | null>(() => draft?.tableId ?? null);
  const [phone, setPhone] = useState(() => draft?.phone ?? "");
  const [note, setNote] = useState(() => draft?.note ?? "");
  const [basket, setBasket] = useState<Basket>(() => draft?.basket ?? {});
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* Set only when the slot went while they were filling the form. Kept apart
     from `problem` because it is not more explanation, it is the way out. */
  const [clash, setClash] = useState<BookingClash | null>(null);
  const [pending, setPending] = useState<{ booking: Booking; dueNow: number; hasFood: boolean } | null>(null);
  const [paid, setPaid] = useState<Booking | null>(null);
  const raw = params.get("step");
  const step: Step = isStep(raw) ? raw : "when";
  const index = ORDER.indexOf(step);
  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => toISODate(addDays(new Date(), i))), []);
  const floor = useResource(() => (time ? api.booking.floor(date, time) : api.booking.floor()), [date, time]);
  const create = useAction(api.booking.create);
  const tables = floor.data?.tables ?? [];
  const chosenTable = tables.find((table) => table.id === tableId) ?? null;
  const foodTotal = basketTotal(basket, menu);
  const dueNow = depositFcfa + foodTotal;
  const phoneReady = normalisePhone(phone).length >= 8;

  useEffect(() => { if (index > 0 && !time) setParams({}, { replace: true }); }, [index, time, setParams]);

  /* The review step is taller than a phone, and the pay button sits in a bar
     pinned over the bottom of it. A message appended below the summary
     therefore lands under that bar and under the tab bar beneath it: the guest
     taps pay, nothing appears to happen, and the reason is off the screen.
     Bring it to them instead of expecting them to go looking. */
  const problemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!problem) return;
    problemRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [problem, clash]);

  useEffect(() => {
    if (!ready || !user || pending || paid) return;
    try {
      const next: BookingDraft = { savedAt: Date.now(), date, time, party, tableId, phone, note, basket };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* Private browsing or a full storage bucket. The in-memory flow still works. */
    }
  }, [ready, user, pending, paid, date, time, party, tableId, phone, note, basket]);

  function clearProblem() { setProblem(null); setClash(null); }
  function go(next: Step) { clearProblem(); setParams({ step: next }); }
  function back() { clearProblem(); navigate(-1); }

  async function submit() {
    clearProblem();
    if (!time) { go("when"); return; }
    const created = await create.run({ date, time, partySize: party, phone: normalisePhone(phone), note, tableId, items: basketLines(basket) });
    if (!created) {
      const failure = create.readError();
      setProblem(failure instanceof ApiError ? failure.message : "That booking could not be made. You can retry without losing what you entered.");
      setClash(clashFromError(failure));
      return;
    }
    setPending({ booking: created, dueNow, hasFood: basketLines(basket).length > 0 });
  }

  /** Takes one of the offered times. The table goes with it: what was free at
      half seven says nothing about eight, so the guest picks again. */
  function takeTime(slot: string) {
    clearProblem();
    setTime(slot);
    setTableId(null);
    setParams({ step: "where" });
  }

  /** Takes one of the offered tables, at the time they already chose. */
  function takeTable(id: number) {
    clearProblem();
    setTableId(id);
    setParams({ step: "review" });
  }

  if (!ready) return <div className="page section stack"><Skeleton height="3rem" width="16rem" /><Skeleton height="18rem" radius="var(--r-lg)" /></div>;

  if (!user) {
    return <div className="page section"><div className="section-head"><hr className="heat-rule" /><h1 className="display display--xl">{locale === "fr" ? "Réserver une table" : "Book a table"}</h1></div><div className="stack stack--loose" style={{ maxWidth: "32rem" }}><p className="lead">{locale === "fr" ? "La réservation a besoin d'un compte pour garder votre table, votre code et votre reçu au même endroit." : "Booking needs an account so your table, code and receipt stay together and you can change or cancel without calling."}</p><div className="actions"><LinkButton to="/join" tone="primary" size="lg">{locale === "fr" ? "Créer un compte" : "Create an account"}</LinkButton><LinkButton to="/signin" tone="ghost" size="lg">{locale === "fr" ? "J'ai déjà un compte" : "I already have one"}</LinkButton></div><p className="fine faint">{locale === "fr" ? "Pressé ? Commandez à emporter ou rejoignez la file si vous êtes déjà sur place." : "In a hurry? Order takeaway or join the queue if you're already outside."}</p></div></div>;
  }

  if (paid) {
    clearDraft();
    return <div className="page section stack stack--loose"><div className="section-head"><hr className="heat-rule" /><h1 className="display display--xl">{locale === "fr" ? "Table confirmée" : "Table held"}</h1><p className="lead">{locale === "fr" ? "Présentez ceci à l'entrée. Votre réservation est aussi dans Mes visites." : "Show this at the door. It is also in My visits, so you do not need to keep this page open."}</p></div><BookingPass booking={{ ...paid, status: "confirmed", payment_status: "paid" }} /><div className="actions"><LinkButton to="/mine" tone="primary" iconEnd="arrow-right">{locale === "fr" ? "Voir mes réservations" : "See my bookings"}</LinkButton><Button tone="ghost" onClick={() => { clearDraft(); setPaid(null); setPending(null); setTime(null); setTableId(null); setBasket({}); setParams({}, { replace: true }); }}> {locale === "fr" ? "Réserver encore" : "Book another"}</Button></div></div>;
  }

  const forward = step === "review" ? <Button tone="primary" size="lg" icon="wallet" busy={create.busy} onClick={submit}>{locale === "fr" ? `Payer ${money(dueNow)} FCFA` : `Pay ${money(dueNow)} FCFA`}</Button> : <Button tone="primary" size="lg" iconEnd="arrow-right" disabled={(step === "when" && !time) || (step === "who" && !phoneReady)} onClick={() => go(ORDER[index + 1]!)}>{locale === "fr" ? "Continuer" : "Continue"}</Button>;
  const recap = step === "when" ? (time ? `${dayLabel(date)}, ${timeLabel(time)}` : (locale === "fr" ? "Choisissez une date et une heure" : "Pick a day and a time")) : step === "who" ? (phoneReady ? `${party === 1 ? (locale === "fr" ? "Seul" : "Just me") : `${party} ${locale === "fr" ? "personnes" : "people"}`}, ${dayLabel(date)}` : (locale === "fr" ? "Nous avons besoin d'un numéro" : "We need a phone number")) : step === "where" ? (chosenTable ? `${locale === "fr" ? "Table" : "Table"} ${chosenTable.label}, ${chosenTable.capacity} ${locale === "fr" ? "places" : "seats"}` : (locale === "fr" ? "N'importe quelle table" : "Any table")) : `${money(dueNow)} FCFA ${locale === "fr" ? "à payer" : "to pay now"}`;

  return <div className="booking">
    {draft && !params.get("step") ? <div className="page" style={{ paddingTop: "var(--s-4)" }}><Notice tone="good" title={locale === "fr" ? "Votre réservation est toujours là" : "Your booking is still here"}>{locale === "fr" ? "Nous avons gardé ce que vous aviez déjà saisi. Vous pouvez continuer sans recommencer." : "We kept what you had already entered, so you can continue without starting again."}</Notice></div> : null}
    <header className="booking__head"><div className="page booking__head-in"><button type="button" className="booking__back" onClick={back} aria-label={locale === "fr" ? "Retour" : "Back"}><Icon name="arrow-left" size={20} /></button><span className="label">{locale === "fr" ? `Étape ${index + 1} sur ${ORDER.length}` : `Step ${index + 1} of ${ORDER.length}`}</span><ol className="booking__ticks">{ORDER.map((name, i) => <li key={name}><button type="button" data-state={i < index ? "done" : i === index ? "now" : "todo"} disabled={i > index} aria-label={`${locale === "fr" ? "Étape" : "Step"} ${i + 1}, ${TITLES[name]}`} aria-current={i === index ? "step" : undefined} onClick={() => go(name)} /></li>)}</ol></div></header>
    <div className="page booking__body">
      <h1 className="display display--xl booking__q">{locale === "fr" ? ({ when: "Quand venez-vous ?", who: "Combien serez-vous ?", where: "Où souhaitez-vous vous asseoir ?", review: "Vérifiez et payez" } as Record<Step, string>)[step] : TITLES[step]}</h1>
      {step === "when" ? <WhenStep days={days} date={date} time={time} onDate={(next) => { setDate(next); setTime(firstOpenSlot(next)); setTableId(null); }} onTime={(next) => { setTime(next); setTableId(null); }} /> : null}
      {step === "who" ? <WhoStep party={party} phone={phone} note={note} onParty={(next) => { setParty(next); if (chosenTable && chosenTable.capacity < next) setTableId(null); }} onPhone={setPhone} onNote={setNote} /> : null}
      {step === "where" && time ? <WhereStep date={date} time={time} party={party} tables={tables} fixtures={floor.data?.fixtures ?? []} loading={floor.loading} tableId={tableId} onSelect={setTableId} /> : null}
      {step === "review" && time ? <ReviewStep date={date} time={time} party={party} table={chosenTable} basket={basket} menu={menu} depositFcfa={depositFcfa} foodTotal={foodTotal} onBasket={setBasket} onMenuLoaded={setMenu} onEdit={go} /> : null}
      <div ref={problemRef} className="booking__problem">
        {problem && clash ? <Notice tone="warn" role="alert" title={CLASH_TITLE[locale === "fr" ? "fr" : "en"][clash.reason]}>{CLASH_BODY[locale === "fr" ? "fr" : "en"][clash.reason]}{clash.alternatives ? <ClashWayOut alternatives={clash.alternatives} locale={locale} onTime={takeTime} onTable={takeTable} /> : null}</Notice> : null}
        {problem && !clash ? <Notice tone="bad" title={locale === "fr" ? "Nous n'avons pas pu continuer" : "We couldn't continue"}>{problem}<div className="fine" style={{ marginTop: "var(--s-2)" }}>{locale === "fr" ? "Vos choix sont toujours enregistrés. Vérifiez votre connexion et réessayez." : "Your choices are still saved. Check your connection and try again."}</div></Notice> : null}
      </div>
    </div>
    <div className="booking__foot"><div className="page row row--between"><span className="booking__recap">{recap}</span>{forward}</div></div>
    {pending ? <MomoDialog
      open
      amountFcfa={pending.dueNow}
      title={pending.hasFood ? (locale === "fr" ? "Payer l'acompte et la commande" : "Pay the deposit and your order") : (locale === "fr" ? "Payer l'acompte" : "Pay the deposit")}
      what={`${longDate(pending.booking.date)} at ${timeLabel(pending.booking.time)}, ${pending.booking.party_size} people`}
      driver={{
        allowDiscounts: true,
        start: (input) => api.booking.payDeposit({ reservationId: pending.booking.id, momoPhone: input.momoPhone, wallet: input.wallet, promoCode: input.promoCode, giftCardCode: input.giftCardCode, usePoints: input.usePoints, idempotencyKey: input.idempotencyKey }).then((prompt) => ({ reference: prompt.reference, amount_fcfa: prompt.amount_fcfa, zero_cost: prompt.zero_cost, expires_in_seconds: prompt.expires_in_seconds, payment_url: prompt.payment_url })),
        poll: api.booking.paymentStatus,
        abandon: api.booking.abandonPayment,
      }}
      onClose={() => { setPending(null); toast.say(locale === "fr" ? "Votre table reste réservée pendant 30 minutes pendant le paiement." : "Your table is held for 30 minutes while you pay."); navigate("/mine"); }}
      onPaid={() => { setPaid(pending.booking); setPending(null); }}
    /> : null}
  </div>;
}

/**
 * The way out of a slot that went while the guest was filling in the form.
 *
 * A refusal on its own sends somebody who has already answered four questions
 * back to the floor plan to work out for themselves what is left, on a phone.
 * These are the two answers they were about to go looking for — the same
 * evening at a nearby time, or a different table at the time they wanted — and
 * each one is a single tap that keeps everything else they entered.
 *
 * Suggestions can go stale between being offered and being tapped, on a busy
 * Friday. That is not a problem to design around: the tap re-books, and a
 * second clash comes back with fresh suggestions.
 */
function ClashWayOut({
  alternatives,
  locale,
  onTime,
  onTable,
}: {
  alternatives: BookingAlternatives;
  locale: string;
  onTime: (slot: string) => void;
  onTable: (id: number) => void;
}) {
  return (
    <div className="clash">
      {alternatives.times.length > 0 ? (
        <div className="clash__group">
          <p className="fine faint">{locale === "fr" ? "Le même jour, tout près :" : "The same day, close to it:"}</p>
          <div className="clash__choices">
            {alternatives.times.map((slot) => (
              <button key={slot} type="button" className="chip" onClick={() => onTime(slot)}>
                {timeLabel(slot)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {alternatives.tables.length > 0 ? (
        <div className="clash__group">
          <p className="fine faint">{locale === "fr" ? "Encore libre à cette heure :" : "Still free at that time:"}</p>
          <div className="clash__choices">
            {alternatives.tables.map((table) => (
              <button key={table.id} type="button" className="chip" onClick={() => onTable(table.id)}>
                {`Table ${table.label}`}
                <span className="faint">
                  {table.zone ? `${table.zone}, ` : ""}
                  {table.capacity} {locale === "fr" ? "places" : "seats"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
