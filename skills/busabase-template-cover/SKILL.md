---
name: busabase-template-cover
description: Generate or refresh the standardized first cover image for a Busabase template from its manifest and a real app screenshot. Use when adding template gallery covers, normalizing cover layout across templates, or updating screenshots[0] in busabase.json; do not use for changing the AirApp UI itself.
---

# Busabase Template Cover

Create a quiet, single-column catalog cover that puts the template identity first and keeps the actual product screenshot large. The deterministic renderer is the source of truth for layout; do not recreate the composition manually.

## Contract

- Target one or more template directories containing `busabase.json`.
- Run with Python 3 and Pillow built with WebP support. If Pillow is unavailable, install it in the active Python environment before invoking the renderer.
- Read the repository's `AGENTS.md` before changing a checked-out template.
- Use a real running-app screenshot already declared by the template. Repository rules prohibit mock product UI.
- Generate `assets/screenshots/cover.webp` at exactly 1440 by 900 pixels.
- Keep `assets/screenshots/cover.webp` at `template.screenshots[0]` and preserve the order of every other screenshot.
- On regeneration, never use the existing cover as its own source. The renderer selects the first declared non-cover screenshot unless `--source` is given.
- Keep the fixed single-column layout: centered template name at the top, centered manifest description below it, then one centered real screenshot.
- Keep a 120px horizontal safe area and a 72px vertical safe area. The title and description must stay fully inside it; the screenshot's left, right, and top edges must also stay inside it, while only the screenshot bottom may overflow the canvas.
- Keep the title-to-description gap at 28px and the description-to-screenshot gap at 44px; every internal vertical gap must remain strictly smaller than the 72px vertical safe inset.
- Match Busabase's source typography: Fraunces at semibold weight for Latin titles, Noto Serif SC at semibold weight for CJK titles, and Inter regular for descriptions. Use the font files bundled under `assets/fonts/`; system fonts are fallback only.
- Match the light brand palette from Busabase source: cool-cement `#F1F3F3` background, ink `#161818` title, and `#6F7373` description.
- Use one quiet neutral dot matrix as the full-canvas background. The matrix is a background layer and is not constrained by the content safe area or cleared around text. Keep every dot at approximately 3px in diameter on a strict 32px grid, and create depth only with very faint cool-gray tones so the pattern never competes with the words or screenshot.
- Preserve the source screenshot's aspect ratio and do not crop its contents. It may extend beyond the bottom edge of the 1440 by 900 cover and be naturally clipped by the canvas.
- Give the screenshot depth with a very soft two-layer ambient shadow and an 8px clipping radius. Do not use a visible hard outline.
- Do not add brand marks, category labels, tags, version text, status badges, buttons, browser chrome, gradients, keyword emphasis, or decoration beyond the standard dot matrix.
- Do not edit generated repository catalogs by hand. When the repository contains `templates.json`, rebuild or check it with the command required by `AGENTS.md`.

## Generate

Run the bundled renderer with one or more template directories:

```bash
python3 <skill-dir>/scripts/generate_cover.py <template-dir> [<template-dir> ...]
```

Useful overrides:

```bash
python3 <skill-dir>/scripts/generate_cover.py <template-dir> --source assets/screenshots/pipeline.webp
python3 <skill-dir>/scripts/generate_cover.py <template-dir> --title "B2B CRM"
```

`--source` may be relative to the template directory or absolute. `--title` applies only when generating a single template.

## Verify

After generation:

1. Open the resulting cover and confirm the title and description are centered without clipping, the dot matrix covers the full background with one dot size and one grid spacing, tonal changes stay subtle, all protected content respects the 120px horizontal and 72px vertical safe areas, both internal vertical gaps are smaller than the vertical safe inset, the screenshot is centered and uncropped, only its bottom may extend beyond the canvas, and the shadow reads as depth rather than a border.
2. Run the deterministic structural check:

```bash
python3 <skill-dir>/scripts/generate_cover.py --check <template-dir> [<template-dir> ...]
```

3. Run the repository's template index check when applicable.

Report the generated cover path, the source screenshot used, whether the manifest was updated, and any repository validation that could not be run.
