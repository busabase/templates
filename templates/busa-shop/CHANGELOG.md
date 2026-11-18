# Busa Shop changelog

## 0.11.0 — 2026-11-18

### Request and intent

Make the storefront easier to browse and compare, with a consistent shopping
experience on desktop and mobile. Keep the template reusable for different
product categories and preserve the existing order and account workflows.

### Changes

- A responsive storefront with a featured product, clearer product cards,
  shipping destinations, buying guidance and a structured policy footer.
- Search, brand filters, price/name sorting, result counts and reset/empty
  states over the loaded catalog. Filters survive reload and browser history
  through URL parameters; no additional table reads are introduced.
- Product pages show actual variant and specification summaries before the
  full description. China-edition guidance requires an explicit edition fact.
- Consistent checkout and account layouts, addition feedback, an empty-basket
  browse link, readable prices and accessible control labels and touch targets.
- Complete English, German, French and Spanish translations for the new UI.
- Optional per-instance Folder binding for websites in a workspace containing
  more than one shop. The default still refuses ambiguous resource matches.
- Refreshed gallery, account/order screenshots and generated cover.
- Version 0.11.0 for the template and Worker; schema version remains 5.

### Compatibility and validation

No table or field migration, payment provider, user-account or SDK change.
The isolated Worker image-cache behavior from 0.10.2 is preserved. Existing
installed websites require the usual source update, rebuilt bundle and a new
preview/publication to adopt this layout; table edits alone do not update it.

Validation covers the project build and static checks, the existing order,
account, image-cache and template tests, and added generic-product, edition,
locale, escaping and per-instance resource-selection regressions. Browser
acceptance evidence is recorded in the accompanying pull request.
