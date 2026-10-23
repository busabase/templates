# PPTX Generation Workflow

Use the trusted skill-root script for a real PPTX draft. It reads the deck
and its slide cards from Busabase and requires the deck to already have a
genuine `approve` decision recorded through the review queue:

```bash
node scripts/generate_pptx.mjs --deck=deck-seed-pitch
node scripts/execute_decisions.mjs --apply
```

Run these commands from the installed template root after the dependency
setup in [Installation and first deck](installation.md). The built-in
generator produces a review draft, not a finished client deliverable: its
visual-brief areas contain text rather than generated illustrations. A
separately available `pptx` skill can improve the approved draft, but is not
required to install this template or run its built-in generator:

1. Create or update projects, decks, and slide cards through the AirApp (or
   an ingest process you control) writing into Busabase.
2. Review slide cards and decks in the App UI's `#/review` queue.
3. Use approved slide cards as the structured plan.
4. Generate PPTX with `scripts/generate_pptx.mjs` (real `pptxgenjs`
   generation logic) or a richer `pptx` skill pass.
5. Render to images/PDF and inspect for text overflow, low contrast, crop issues, and style drift.
6. Record QA checks (the `qa-checks` Base) and export paths (the `exports`
   Base) back into Busabase.

Never skip slide-card review for large batches. The page card is the audit surface that keeps bulk output manageable.
