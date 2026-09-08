# Portrait Retouch Policy

## Naturalness Gate

Approve a candidate only when all are true:

- the person remains immediately recognizable;
- pores and fine skin texture remain visible at 100% zoom;
- eyes, brows, hair, jewelry, and clothing stay sharp;
- skin tone does not become lighter or change ethnicity-linked appearance;
- no halo appears around the face, jaw, or hairline;
- the background does not visibly smear near the face mask;
- highlights and shadows retain detail;
- the output dimensions and intended color space are preserved.

Reduce strength before trying a different preset. Do not stack repeated lossy
exports.

## Structural Edits

Face slimming, eye enlargement, nose reshaping, body reshaping, age regression,
and identity transfer are not default beauty edits. Name the requested change,
confirm it with the user, produce a separate candidate, and label it as a
structural edit. Never apply those changes to documentary, identification,
medical, legal, hiring, or evidence images.

## Sensitive Portraits

- For minors, stay local unless a parent or guardian explicitly approves an
  external service. Avoid sexualized styling or age transformation.
- For ID, visa, passport, insurance, medical, and legal images, limit work to
  exposure, white balance, crop, and format requirements. Do not alter features.
- Strip location metadata unless the user explicitly needs it retained.
- Do not store raw portraits in Base fields. Use Drive/File assets with minimal
  human-readable provenance.

## External Models

Use an external image-editing model only after telling the user that pixels leave
the machine and receiving explicit approval. Request identity preservation,
texture preservation, no geometry change, and no new accessories or background
content. Keep the original and label the provider/model in candidate provenance.
