/**
 * Translation dictionaries. Organised by page/section namespace so a page
 * only needs to know its own slice. English is the fallback: if a French
 * key is missing at runtime, t() returns the English string rather than
 * a blank or a raw key, so a partial translation pass never breaks the UI.
 */

export type Lang = "en" | "fr";

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
];

type Dict = Record<string, string>;
type Translations = Record<string, { en: Dict; fr: Dict }>;

export const translations: Translations = {
  nav: {
    en: {
      menu: "Menu",
      offers: "Offers",
      gallery: "Gallery",
      about: "About",
      reviews: "Reviews",
      myTables: "My Tables",
      account: "Account",
      admin: "Admin",
      signOut: "Sign out",
      signIn: "Sign in",
      bookTable: "Book a table",
      brandFirst: "Cam Chop",
      brandSecond: "Meat",
      ticker: "buea . clerks quarters . opposite supptic . charcoal grill . open daily 9am till late . dine in or collect",
    },
    fr: {
      menu: "Menu",
      offers: "Offres",
      gallery: "Galerie",
      about: "A propos",
      reviews: "Avis",
      myTables: "Mes tables",
      account: "Compte",
      admin: "Admin",
      signOut: "Deconnexion",
      signIn: "Connexion",
      bookTable: "Reserver une table",
      brandFirst: "Cam Chop",
      brandSecond: "Meat",
      ticker: "buea . clerks quarters . en face de supptic . grillades au charbon . ouvert tous les jours de 9h a tard . sur place ou a emporter",
    },
  },
  footer: {
    en: {
      tagline: "Charcoal grill, real flavour. We hold the table, you bring the appetite.",
      quickLinks: "Quick links",
      contact: "Contact",
      followUs: "Follow us",
      terms: "Terms of use",
      privacy: "Privacy policy",
      rights: "All rights reserved.",
    },
    fr: {
      tagline: "Grillades au charbon, vrai gout. On garde la table, apportez votre appetit.",
      quickLinks: "Liens rapides",
      contact: "Contact",
      followUs: "Suivez-nous",
      terms: "Conditions d'utilisation",
      privacy: "Politique de confidentialite",
      rights: "Tous droits reserves.",
    },
  },
  common: {
    en: {
      loading: "Loading...",
      error: "Something went wrong. Try again.",
      retry: "Retry",
      save: "Save",
      cancel: "Cancel",
      close: "Close",
      confirm: "Confirm",
      delete: "Delete",
      edit: "Edit",
      submit: "Submit",
      back: "Back",
      next: "Next",
      required: "Required",
      optional: "Optional",
      yes: "Yes",
      no: "No",
      viewAll: "View all",
      seeMore: "See more",
      seeLess: "See less",
      copied: "Copied",
      language: "Language",
    },
    fr: {
      loading: "Chargement...",
      error: "Un probleme est survenu. Reessayez.",
      retry: "Reessayer",
      save: "Enregistrer",
      cancel: "Annuler",
      close: "Fermer",
      confirm: "Confirmer",
      delete: "Supprimer",
      edit: "Modifier",
      submit: "Envoyer",
      back: "Retour",
      next: "Suivant",
      required: "Obligatoire",
      optional: "Facultatif",
      yes: "Oui",
      no: "Non",
      viewAll: "Tout voir",
      seeMore: "Voir plus",
      seeLess: "Voir moins",
      copied: "Copie",
      language: "Langue",
    },
  },
};

/** Reads one string, falling back to English, then the key itself. */
export function translate(lang: Lang, namespace: string, key: string): string {
  const ns = translations[namespace];
  if (!ns) return key;
  return ns[lang]?.[key] ?? ns.en[key] ?? key;
}
