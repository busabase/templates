# Busa VC Diligence

A due-diligence desk for venture investment teams, as an installable
Busabase template: a target pipeline, a diligence request list grouped by
workstream, an evidence register that keeps every claim labelled
**Verified**, **Unverified** or **Contradicted**, findings and red flags
that must link to evidence, interviews and references logged as claims,
and a read-only Diligence Cockpit.

The desk's rule is *no evidence, no conclusion*: reported and
company-stated figures stay labelled as such all the way into the IC memo,
whose skeleton (Thesis / Market / Team / Verified facts / Red flags /
Unverified / Terms / Recommendation-left-blank) ships in the Playbook doc.

Demo data: the hero target is a real private company (Perplexity AI)
described only from public reporting as of November 2026, with its
findings framed as open verification questions; two supporting targets are
fictional and labelled fictional. Demo data is for demonstration only —
not investment advice, and not a live recommendation on any named
company. Delete it before pointing the desk at a live deal.

Layout: `SKILL.md` is the manual an agent reads before touching this
app's data; `busabase.json` is the catalog manifest; `content/` declares
the five Bases, the Playbook doc and the AirApp; `blueprint.json` is the
schema-version-1 blueprint the package was authored from;
`scripts/check-diligence-consistency.mjs` guards the mirrors between
`base.json`, the AirApp config and the read model.
