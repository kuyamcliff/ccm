import { api } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { Img } from "~/ui/Img";
import { LinkButton } from "~/ui/Button";
import { Reveal } from "~/ui/Reveal";
import { useCopy } from "~/state/locale";
import { useVenue } from "~/state/venue";

/**
 * Who this is.
 *
 * The one page on the site with no form on it and nothing to buy. It exists
 * because somebody arriving from a TikTok video has never heard of the place and
 * "should I trust these people with 2,500 FCFA of Mobile Money" is a fair
 * question that a menu does not answer.
 *
 * The photograph is the best dish's own, so the page improves the moment the
 * owner uploads better food photography, and there are no stock pictures in this
 * codebase to fall back on.
 */
export function StoryPage() {
  const { locale, c } = useCopy();
  const { address, hours } = useVenue();
  const { data } = useQuery(K.highlights, () => api.site.highlights(), { persist: true });

  const photo = data?.topItems.find((item) => item.image_url)?.image_url ?? null;

  const paragraphs =
    locale === "fr"
      ? [
          "Cam Chop Meat a commencé avec un grill, un sac de charbon et une file de gens qui revenaient chaque soir. C'est toujours à peu près ça.",
          "Nous grillons du poulet, du porc et de la chèvre à la commande. Rien n'attend sous une lampe. Si vous commandez à vingt heures, la viande passe sur le feu à vingt heures, et c'est pour cela qu'il faut lui laisser un peu de temps.",
          "La viande est achetée le matin, jamais congelée. Le piment est le nôtre. Les accompagnements sont ceux que les gens de Buea commandent réellement: plantain, bâton de manioc, riz.",
          "Vous nous trouverez au coin, avec la fumée. Venez manger.",
        ]
      : [
          "Cam Chop Meat started with one grill, a bag of charcoal, and a line of people who kept coming back every evening. It is still more or less that.",
          "We grill chicken, pork and goat to order. Nothing sits under a lamp waiting for you. If you order at eight, the meat goes on the fire at eight, and that is why we ask you to give it a little time.",
          "The meat is bought in the morning and never frozen. The pepper is our own. The sides are the ones people in Buea actually order: plantain, water fufu, rice.",
          "You will find us on the corner, with the smoke. Come and eat.",
        ];

  return (
    <article className="page section stack story">
      <header className="stack stack--tight">
        <hr className="heat-rule" />
        <h1 className="display display--xl">{c.story.title}</h1>
        <p className="lead">{c.brand.tagline}</p>
      </header>

      <Reveal>
        <Img src={photo} alt="" ratio={16 / 9} priority />
      </Reveal>

      <Reveal className="prose">
        {paragraphs.map((text, index) => (
          <p key={index}>{text}</p>
        ))}
      </Reveal>

      <Reveal className="rows story__facts">
        <div className="row">
          <span className="label">{c.find.address}</span>
          <span className="grow right">{address}</span>
        </div>
        <div className="row">
          <span className="label">{c.find.hours}</span>
          <span className="grow right">{hours}</span>
        </div>
      </Reveal>

      <div className="bar bar--wrap">
        <LinkButton to="/menu" tone="primary" size="sm" icon="list">
          {c.home.seeMenu}
        </LinkButton>
        <LinkButton to="/find" tone="ghost" size="sm" icon="pin">
          {c.find.title}
        </LinkButton>
      </div>
    </article>
  );
}
