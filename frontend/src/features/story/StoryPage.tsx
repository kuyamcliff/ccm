import { api } from "~/lib/api";
import { useResource } from "~/lib/useResource";
import { Icon } from "~/ui/Icon";
import { Photo } from "~/ui/Photo";
import { LinkButton } from "~/ui/Button";
import { Reveal } from "~/ui/Reveal";
import { useVenue } from "~/state/venue";

/**
 * Our story.
 *
 * Short on purpose. Nobody arrives on a restaurant's about page wanting a
 * history; they want to know whether the food is worth the trip and whether
 * the people cooking it care. So it is three paragraphs, three facts, and the
 * three things we will not cut corners on, and then it gets out of the way and
 * points at the menu.
 *
 * The photograph is one of the restaurant's own, pulled from the same list the
 * home page uses, so this page has nothing standing in for something real.
 */

const VALUES = [
  {
    icon: "flame" as const,
    title: "Grilled to order",
    body: "Nothing sits under a lamp waiting for you. Your plate goes on the fire when you order it, which is why it takes a little time and why it arrives the way it should.",
  },
  {
    icon: "check-circle" as const,
    title: "Bought fresh, every morning",
    body: "The chicken, the goat and the pork are bought the same day they are cooked. What does not sell does not come back tomorrow.",
  },
  {
    icon: "users" as const,
    title: "The same price for everybody",
    body: "What is on the menu is what you pay, whether you order from your phone or walk up to the counter. Anything sold by weight is settled in front of you at the scale.",
  },
];

export function StoryPage() {
  const { address, hours } = useVenue();
  const { data } = useResource(() => api.site.highlights(), []);
  const photo = (data?.topItems ?? []).find((item) => item.image_url)?.image_url ?? null;

  return (
    <div className="page section">
      <div className="section-head">
        <hr className="heat-rule" />
        <h1 className="display display--xl">Our story</h1>
        <p className="lead">A grill on the corner at Clerks Quarters, and the reason people keep walking back to it.</p>
      </div>

      <div className="stack stack--loose">
        <Reveal className="story__photo">
          <Photo src={photo} alt="Meat on the grill at Cam Chop Meat" eager />
        </Reveal>

        <Reveal className="story__prose" index={1}>
          <p>
            Cam Chop Meat started the way most good things in Buea start: one grill, a bag of charcoal, and somebody
            who refused to serve food they would not eat themselves.
          </p>
          <p>
            It is still the same fire. Chicken, goat and pork, seasoned in the morning and cooked in front of you in
            the evening, with plantain and the pepper on the side. On a Friday the tables fill from the road side
            inwards, and on a match day you will not get one without asking first, which is most of the reason this
            site exists.
          </p>
          <p>
            We are on the corner at Clerks Quarters, opposite the Survey School. Students, workers finishing a shift,
            families on a Sunday. Everybody gets the same meat off the same grill.
          </p>
        </Reveal>

        <Reveal className="story__figures" index={2}>
          <div className="story__figure">
            <span className="story__num">3</span>
            <span className="fine muted">Cuts on the fire: chicken, goat, pork</span>
          </div>
          <div className="story__figure">
            <span className="story__num">7</span>
            <span className="fine muted">Days a week, {hours.toLowerCase()}</span>
          </div>
          <div className="story__figure">
            <span className="story__num mono">2,500</span>
            <span className="fine muted">FCFA, where the plates start</span>
          </div>
        </Reveal>

        <Reveal index={3}>
          <h2 className="display display--lg" style={{ marginBottom: "var(--s-4)" }}>
            What we will not cut
          </h2>
          <div className="story__values">
            {VALUES.map((value) => (
              <article key={value.title} className="story__value">
                <Icon name={value.icon} size={20} />
                <div>
                  <h3>{value.title}</h3>
                  <p className="fine muted">{value.body}</p>
                </div>
              </article>
            ))}
          </div>
        </Reveal>

        <Reveal className="join-strip" index={4}>
          <div className="stack stack--tight">
            <h2 className="display display--lg">Come and eat</h2>
            <p className="muted">{address}. Order ahead and skip the queue, or hold a table for the evening.</p>
          </div>
          <div className="row row--wrap">
            <LinkButton to="/menu" tone="primary" icon="list">
              See the menu
            </LinkButton>
            <LinkButton to="/find" tone="ghost" icon="pin">
              Find us
            </LinkButton>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
