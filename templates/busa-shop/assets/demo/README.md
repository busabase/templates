# Fictional demo data

Everything in this folder is invented for the Busa Shop template and the
course lesson "open a store". Tumbleberry Toys / Tumbleberry Toy Works, its
products, prices, test labs, certificate numbers and dates do not exist.
Do not use them as facts about any real product.

- `toy-catalog.csv`: the factory's product list, 12 toys. Import it, with
  the certificates and photos, into Busa Product Hub with
  `scripts/import-catalog.mjs` (see SKILL.md, "Open the shop").
- `toy-certificates.csv`: 39 safety certificates for those toys, each under
  its own type (EN 71, ASTM F963, CPSIA / CPC, UKCA, CE, FCC, UN38.3; the toy
  types need Busa Product Hub 0.3.0 or later).
- `images/`: original SVG illustrations drawn for this template (no photos,
  no third-party artwork). Two toys deliberately have none.

Left in on purpose, so the daily shop check has something to find: one toy
has no price (Rainbow Xylophone), one is still a draft (Magnetic Building
Tiles), two have no photo (Mini Chef Kitchen Set, Rainbow Diamond Kite), one
is out of stock (Dino Explorer Figures), two certificates have expired, three
expire within 90 days of 2026-11-05, and two listed toys lack a certificate
the shop requires (CPSIA / CPC, ASTM F963).
