# B2B CRM

A lightweight Busabase CRM template for companies, contacts, interaction history, follow-ups, and a review-first sales pipeline.

## Included

- Companies, Contacts, Activities, and Deals Bases with typed fields and relations
- Directory, timeline, calendar, deal register, and stage-based pipeline views
- An English AirApp with a daily sales Overview, exact relationship and stage counts, bounded activity metrics, multi-currency pipeline values, locally bundled Lucide icons, a once-per-tab entrance sequence, and review-first sales actions
- A deterministic 30-record `?demo=1` dataset that exercises every Deal stage and a seven-day Activity rhythm
- Forty fictional sample records using `.example` domains
- An Agent Skill manual for safe, ChangeRequest-first CRM operations

## Install

After this template is merged into the official catalog, install it from the Busabase Template Center. To test this branch directly:

```bash
npx busabase-cli install https://github.com/kwp-lab/busabase-templates/tree/b2b-crm-template/templates/b2b-crm --dry-run
```

Review and merge the generated AirApp and Skill ChangeRequests before running the installed app.

## Boundaries

The pipeline stores stated deal amounts in USD, EUR, or GBP without currency conversion or probability-weighted forecasting. It does not send email or invoke external integrations. AirApp writes create ChangeRequests and never approve or merge canonical data.
