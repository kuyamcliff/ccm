import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "~/lib/api";
import type { Booking, TakeawayOrder } from "~/lib/api";
import { dayLabel, parseLines, stampLabel, timeLabel } from "~/lib/format";
import { type Resource, useResource } from "~/lib/useResource";
import { Button, LinkButton } from "~/ui/Button";
import { Badge, Money } from "~/ui/Bits";
import { EmptyState, ErrorState, Notice, SkeletonCards } from "~/ui/Feedback";
import { useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { useVenue } from "~/state/venue";
import { useLocale } from "~/state/locale";
import { useBasket } from "~/state/basket";
import { BookingPass } from "./BookingPass";
import { MomoDialog } from "~/features/pay/MomoDialog";

const ORDER_STATUS: Record<TakeawayOrder["status"], { label: { en: string; fr: string }; tone: "neutral" | "good" | "warn" | "bad" | "hot" }> = {
  awaiting_payment: { label: { en: "Not paid", fr: "Non payé" }, tone: "warn" },
  pending: { label: { en: "Sent", fr: "Envoyée" }, tone: "warn" },
  confirmed: { label: { en: "Accepted", fr: "Acceptée" }, tone: "hot" },
  ready: { label: { en: "Ready to collect", fr: "Prête à retirer" }, tone: "good" },
  picked_up: { label: { en: "Collected", fr: "Retirée" }, tone: "neutral" },
  cancelled: { label: { en: "Cancelled", fr: "Annulée" }, tone: "bad" },
};
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function hasMenuId(line: { id?: number; name: string; qty: number; price: number }): line is { id: number; name: string; qty: number; price: number } { return Number.isInteger(line.id) && (line.id ?? 0) > 0; }

function Bookings({ bookings }: { bookings: Resource<Booking[]> }) {
  const { depositFcfa } = useVenue(); const toast = useToast(); const { confirm, confirmElement } = useConfirm(); const [payFor, setPayFor] = useState<Booking | null>(null); const { locale } = useLocale();
  async function cancel(booking: Booking) { const ok = await confirm({ title: locale === "fr" ? "Annuler cette table ?" : "Cancel this table?", body: locale === "fr" ? `${dayLabel(booking.date)} à ${timeLabel(booking.time)}. Un acompte payé plus d'une heure à l'avance revient au client.` : `${dayLabel(booking.date)} at ${timeLabel(booking.time)}. If you have paid a deposit more than an hour ahead, it comes back to you.`, confirmLabel: locale === "fr" ? "Annuler" : "Cancel it" }); if (!ok) return; try { const result = await api.booking.cancel(booking.id); if ("requires_fee" in result) { toast.failed(new Error(locale === "fr" ? `Une pénalité de ${result.fee_fcfa.toLocaleString("fr-FR")} FCFA s'applique. Contactez-nous.` : `Cancelling this late keeps a ${result.fee_fcfa.toLocaleString("en-US")} FCFA fee. Call us instead.`)); return; } toast.done(locale === "fr" ? "Table libérée." : "Table released."); bookings.reload(); } catch (err) { toast.failed(err); } }
  async function hide(booking: Booking) { try { await api.booking.hide(booking.id); bookings.set((current) => (current ?? []).filter((row) => row.id !== booking.id)); } catch (err) { toast.failed(err); } }
  async function receipt(booking: Booking) { try { downloadBlob(await api.me.bookingReceiptFile(booking.id), `${booking.ccm_code ?? booking.id}.pdf`); } catch (err) { toast.failed(err, locale === "fr" ? "Ce reçu n'est pas encore prêt." : "That receipt is not ready yet."); } }
  if (bookings.loading) return <SkeletonCards count={2} height="14rem" />;
  if (bookings.error) return <ErrorState error={bookings.error} onRetry={bookings.reload} />;
  const rows = bookings.data ?? [];
  if (rows.length === 0) return <EmptyState icon="calendar" title={locale === "fr" ? "Aucune table réservée" : "No tables booked"} action={<LinkButton to="/book" tone="primary">{locale === "fr" ? "Réserver" : "Book one"}</LinkButton>}>{locale === "fr" ? "Votre réservation, votre code et vos reçus apparaîtront ici." : "When you book, it shows up here with the code for the door."}</EmptyState>;
  return <div className="stack stack--loose">{confirmElement}{rows.map((booking) => <BookingPass key={booking.id} booking={booking} compact actions={<>{booking.status === "pending_payment" ? <Button tone="primary" size="sm" icon="wallet" onClick={() => setPayFor(booking)}>{locale === "fr" ? "Payer l'acompte" : "Pay the deposit"}</Button> : null}{booking.payment_status === "paid" ? <Button size="sm" tone="ghost" icon="download" onClick={() => receipt(booking)}>{locale === "fr" ? "Reçu" : "Receipt"}</Button> : null}{booking.status === "confirmed" || booking.status === "pending_payment" ? <Button size="sm" tone="danger" onClick={() => cancel(booking)}>{locale === "fr" ? "Annuler" : "Cancel"}</Button> : <Button size="sm" tone="quiet" onClick={() => hide(booking)}>{locale === "fr" ? "Retirer" : "Remove"}</Button>}</>} />)}{payFor ? <MomoDialog open amountFcfa={depositFcfa} title={locale === "fr" ? "Payer l'acompte" : "Pay the deposit"} what={`${dayLabel(payFor.date)} ${locale === "fr" ? "à" : "at"} ${timeLabel(payFor.time)}`} driver={{ allowDiscounts: true, start: (input) => api.booking.payDeposit({ reservationId: payFor.id, momoPhone: input.momoPhone, wallet: input.wallet, promoCode: input.promoCode, giftCardCode: input.giftCardCode, usePoints: input.usePoints, idempotencyKey: input.idempotencyKey }).then((prompt) => ({ reference: prompt.reference, amount_fcfa: prompt.amount_fcfa, zero_cost: prompt.zero_cost, expires_in_seconds: prompt.expires_in_seconds, payment_url: prompt.payment_url })), poll: api.booking.paymentStatus, abandon: api.booking.abandonPayment }} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); toast.done(locale === "fr" ? "Acompte reçu. Votre table est confirmée." : "Deposit received. Your table is confirmed."); bookings.reload(); }} /> : null}</div>;
}

function Orders({ orders }: { orders: Resource<TakeawayOrder[]> }) {
  const toast = useToast(); const [payFor, setPayFor] = useState<TakeawayOrder | null>(null); const { locale } = useLocale(); const { add, clear } = useBasket(); const navigate = useNavigate(); const menu = useResource(() => api.site.menu(), []);
  const orderAgain = (order: TakeawayOrder) => {
    const lines = parseLines(order.items_json).filter(hasMenuId);
    if (lines.length === 0) { toast.say(locale === "fr" ? "Les articles de cette ancienne commande ne peuvent pas être ajoutés automatiquement. Ouvrez le menu pour recommencer." : "Those older items cannot be restored automatically. Open the menu to order again."); navigate("/menu"); return; }
    if (menu.data) {
      const validIds = new Set(menu.data.filter((item) => item.is_active === 1 && item.price_fcfa != null).map((item) => item.id));
      const available = lines.filter((line) => validIds.has(line.id));
      if (!available.length) { toast.say(locale === "fr" ? "Ces articles ne sont plus disponibles. Nous vous avons ouvert le menu." : "Those items are no longer available. We opened the menu for you."); navigate("/menu"); return; }
      clear(); for (const line of available) add(line.id, line.qty);
      toast.done(locale === "fr" ? "Votre commande précédente est de retour dans le panier." : "Your previous order is back in the basket."); navigate("/order"); return;
    }
    toast.say(locale === "fr" ? "Vérification du menu…" : "Checking today's menu…");
  };
  if (orders.loading) return <SkeletonCards count={2} height="10rem" />;
  if (orders.error) return <ErrorState error={orders.error} onRetry={orders.reload} />;
  const rows = orders.data ?? [];
  if (rows.length === 0) return <EmptyState icon="bag" title={locale === "fr" ? "Aucune commande" : "No orders yet"} action={<LinkButton to="/menu" tone="primary">{locale === "fr" ? "Voir le menu" : "Go to the menu"}</LinkButton>}>{locale === "fr" ? "Commandez à l'avance et retirez votre repas sans attendre." : "Order ahead and collect it without queueing."}</EmptyState>;
  return <div className="stack">{rows.map((order) => { const status = ORDER_STATUS[order.status]; const lines = parseLines(order.items_json); const unpaid = order.payment_status !== "paid" && order.status !== "cancelled"; return <article key={order.id} className="card stack"><div className="row row--between row--wrap"><div><p className="label">{locale === "fr" ? "Commande" : "Order"}</p><p className="mono pass__code">{order.order_no}</p></div><Badge tone={status.tone}>{status.label[locale]}</Badge></div><ul className="lines">{lines.map((line, index) => <li key={`${line.name}-${index}`}><span className="mono lines__qty">{line.qty}</span><span>{line.name}</span><Money value={line.price * line.qty} className="push" /></li>)}</ul><div className="row row--between"><span className="muted">{locale === "fr" ? "Retrait à" : "Collect at"} {timeLabel(order.pickup_time)}</span><strong><Money value={order.total_fcfa} /></strong></div>{unpaid ? <Notice tone="warn">{locale === "fr" ? "Cette commande n'est pas payée. La cuisine ne l'a pas commencée." : "This order is not paid yet, so the kitchen has not started on it."}</Notice> : null}<div className="row row--wrap">{unpaid ? <Button tone="primary" size="sm" icon="wallet" onClick={() => setPayFor(order)}>{locale === "fr" ? "Payer maintenant" : "Pay now"}</Button> : <><Button size="sm" tone="ghost" icon="download" onClick={async () => { try { downloadBlob(await api.me.orderReceiptFile(order.order_no), `${order.order_no}.pdf`); } catch (err) { toast.failed(err); } }}>{locale === "fr" ? "Reçu" : "Receipt"}</Button>{order.status !== "cancelled" ? <Button size="sm" tone="quiet" icon="bag" onClick={() => orderAgain(order)}>{locale === "fr" ? "Commander encore" : "Order again"}</Button> : null}</>}<span className="fine faint push">{locale === "fr" ? "Commandée" : "Ordered"} {stampLabel(order.created_at)}</span></div></article>; })}{payFor ? <MomoDialog open amountFcfa={payFor.total_fcfa} title={locale === "fr" ? "Payer la commande" : "Pay for your order"} what={`Order ${payFor.order_no}, ${locale === "fr" ? "retrait à" : "collect at"} ${timeLabel(payFor.pickup_time)}`} driver={{ start: (input) => api.orders.pay(payFor.order_no, input.momoPhone, input.wallet, input.idempotencyKey).then((prompt) => ({ reference: prompt.reference, amount_fcfa: prompt.amount_fcfa, expires_in_seconds: prompt.expires_in_seconds, payment_url: prompt.payment_url })), poll: api.orders.paymentStatus, abandon: api.orders.abandonPayment }} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); toast.done(locale === "fr" ? "Paiement reçu. Nous commençons la préparation." : "Paid. We will start on it."); orders.reload(); }} /> : null}</div>;
}

function activeBookingCount(rows: Booking[] | null): number { return (rows ?? []).filter((b) => b.status === "confirmed" || b.status === "pending_payment").length; }
function activeOrderCount(rows: TakeawayOrder[] | null): number { return (rows ?? []).filter((o) => o.status !== "cancelled" && o.status !== "picked_up").length; }

export function MinePage() {
  const [tab, setTab] = useState<"tables" | "orders">("tables"); const { locale } = useLocale(); const bookings = useResource(() => api.booking.mine(), []); const orders = useResource(() => api.orders.mine(), []); const tableCount = activeBookingCount(bookings.data); const orderCount = activeOrderCount(orders.data);
  return <div className="page section"><div className="section-head"><hr className="heat-rule" /><h1 className="display display--xl">{locale === "fr" ? "Mes visites" : "My visits"}</h1></div><div className="row row--between row--wrap"><div className="tabs" role="tablist" aria-label={locale === "fr" ? "Ce que vous avez avec nous" : "What you have with us"}><button type="button" role="tab" className="tab" aria-selected={tab === "tables"} onClick={() => setTab("tables")}>{locale === "fr" ? "Tables" : "Tables"} {tableCount ? `(${tableCount})` : ""}</button><button type="button" role="tab" className="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")}>{locale === "fr" ? "Commandes" : "Orders"} {orderCount ? `(${orderCount})` : ""}</button></div></div>{tab === "tables" ? <Bookings bookings={bookings} /> : <Orders orders={orders} />}</div>;
}
