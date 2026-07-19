export interface MenuItem {
  name: string;
  desc: string;
  price: string;
}

export interface MenuSection {
  no: string;
  title: string;
  items: MenuItem[];
}

export const MENU: MenuSection[] = [
  {
    no: "01",
    title: "From the grill",
    items: [
      {
        name: "Grilled chicken, half",
        desc: "Charcoal all the way, with onions and pepper sauce.",
        price: "from 2,500 FCFA",
      },
      {
        name: "Grilled chicken, full",
        desc: "A whole bird. For sharing, or not. We will not judge.",
        price: "from 4,500 FCFA",
      },
      {
        name: "Grilled pork",
        desc: "Soft inside, crisp at the edge, straight off the coals.",
        price: "from 2,500 FCFA",
      },
      {
        name: "Grilled goat",
        desc: "Seasoned deep, grilled slow, served hot.",
        price: "from 3,000 FCFA",
      },
    ],
  },
  {
    no: "02",
    title: "On the side",
    items: [
      { name: "Fried ripe plantain", desc: "Sweet, golden, made for pepper sauce.", price: "ask" },
      { name: "Miondo", desc: "The classic partner for grilled anything.", price: "ask" },
      { name: "Extra pepper sauce", desc: "Hot. You were warned.", price: "ask" },
    ],
  },
  {
    no: "03",
    title: "To drink",
    items: [
      {
        name: "Matango",
        desc: "Fresh palm wine, when the calabash arrives. First come, first served.",
        price: "from 1,000 FCFA",
      },
      { name: "Beer", desc: "Cold 33 Export, Castel and friends.", price: "from 1,000 FCFA" },
      { name: "Soft drinks and water", desc: "For the designated riders.", price: "from 500 FCFA" },
    ],
  },
];

export const MARQUEE_ITEMS = [
  "grilled chicken",
  "grilled pork",
  "grilled goat",
  "matango",
  "pepper sauce",
  "miondo",
  "cold beer",
  "fried plantain",
];
