import { api } from "~/lib/api";
import { useMutation, invalidate } from "~/lib/store";
import { K } from "~/lib/keys";
import { writeLaunched, PREVIEW_PREFIX } from "~/lib/launch";
import { Action } from "~/ui/Button";
import { Icon } from "~/ui/Icon";
import { Notice } from "~/ui/Feedback";
import { useConfirm } from "~/ui/Sheet";
import { useToast } from "~/state/toast";
import { useVenue } from "~/state/venue";
import { DeskPage, Section, State } from "../parts";

/**
 * The switch that opens the site to the world.
 *
 * ── Why it is its own screen ───────────────────────────────────────────────
 *
 * Everything else in the console is a thing somebody does during a shift. This
 * is meant to be pressed about twice, ever, and it decides whether the business
 * has a public website. A control like that does not belong in a list of
 * toggles where it can be caught with a thumb.
 *
 * So it gets a page, it states what will happen in the present tense before it
 * happens, and it asks. The confirm is not ceremony: turning it on cannot be
 * undone by turning it off, because by then a search engine or a shared link
 * has already seen the site.
 *
 * ── What actually changes ──────────────────────────────────────────────────
 *
 * Dark, the root address is a holding page and the restaurant is only reachable
 * through the staff prefix. Live, the root is the restaurant. The staff prefix
 * works either way and keeps working after launch, so nothing anybody here has
 * bookmarked breaks on the morning this is pressed. `lib/launch.ts` carries the
 * detail, including why a returning visitor never waits to find out which it
 * is.
 */
export function DevLaunch() {
  const toast = useToast();
  const { siteConfig, refresh } = useVenue();
  const { confirm, element } = useConfirm();

  const live = siteConfig.launched;
  const origin = window.location.origin;

  const set = useMutation(async (next: boolean) => {
    await api.desk.dev.setLive(next);

    /* Written here as well as by the provider, so the very next page load in
       this browser resolves without asking. */
    writeLaunched(next);
    invalidate(K.settings);
    refresh();

    toast.done(next ? "The site is live." : "The site is closed to the public.");
  });

  return (
    <DeskPage title="Launch" hint="Whether the world can see the site.">
      <Section title="Right now">
        <div className="launch" data-live={live ? "true" : undefined}>
          <Icon name={live ? "globe" : "lock"} size={26} />
          <div className="stack stack--tight grow">
            <span className="bar bar--tight">
              <span className="title">{live ? "Live" : "Not launched"}</span>
              <State tone={live ? "good" : "neutral"}>{live ? "Public" : "Staff only"}</State>
            </span>
            <span className="fine muted">
              {live
                ? "Anybody who visits the address sees the restaurant."
                : `The restaurant is at ${PREVIEW_PREFIX} and nowhere else. Every other address shows a holding page.`}
            </span>
          </div>
        </div>
      </Section>

      <Section title="The two addresses" hint="Yours does not change when the site goes live.">
        <div className="rows rows--inset">
          <div className="row">
            <span className="grow label">Customers</span>
            <span className="fine mono clip">{live ? origin : "Nobody yet"}</span>
          </div>
          <div className="row">
            <span className="grow label">You</span>
            <span className="fine mono clip">{`${origin}${PREVIEW_PREFIX}/desk`}</span>
          </div>
        </div>
      </Section>

      {live ? (
        <Section
          title="Close it again"
          hint="Puts the holding page back. Anybody with the site already open keeps it until they reload."
        >
          <Action
            tone="quiet"
            block
            icon="lock"
            pending={set.pending}
            pendingLabel="Closing"
            onClick={async () => {
              const sure = await confirm({
                title: "Take the site down?",
                body: "Customers get the holding page again. Bookings and orders already placed are untouched, and you carry on at your own address.",
                confirmLabel: "Take it down",
                cancelLabel: "Leave it up",
              });
              if (!sure) return;
              await set.run(false);
              const failure = set.readError();
              if (failure) toast.failed(failure, "desk");
            }}
          >
            Take the site down
          </Action>
        </Section>
      ) : (
        <Section title="Go live" hint="Opens the site at its own address. There is no holding page after this.">
          <Notice tone="warn" title="Worth checking first">
            Prices and photographs in Menu, the room in Floor, and your phone number and hours in Details. Everything a
            customer sees comes from those, and once this is on, they see it.
          </Notice>

          <Action
            tone="primary"
            block
            icon="globe"
            pending={set.pending}
            pendingLabel="Going live"
            onClick={async () => {
              const sure = await confirm({
                title: "Open the site to everybody?",
                body: "It goes to the public address straight away. You can close it again, but anybody who has already seen it, or shared it, has seen it.",
                confirmLabel: "Go live",
                cancelLabel: "Not yet",
                tone: "primary",
              });
              if (!sure) return;
              await set.run(true);
              const failure = set.readError();
              if (failure) toast.failed(failure, "desk");
            }}
          >
            Go live
          </Action>
        </Section>
      )}

      {element}
    </DeskPage>
  );
}
