# B2B CRM

A lightweight Busabase CRM template for companies, contacts, interaction history, and follow-ups.

## Included

- Companies, Contacts, and Activities Bases with typed fields and relations
- Account Directory, Contact Directory, Activity Timeline, and Follow-Up Calendar views
- An English AirApp with bounded search, filters, related records, audit identity, and review-first activity logging
- Nine fictional sample records using `.example` domains
- An Agent Skill manual for safe, ChangeRequest-first CRM operations

## Install

After this template is merged into the official catalog, install it from the Busabase Template Center. To test this branch directly:

```bash
npx busabase-cli install https://github.com/kwp-lab/busabase-templates/tree/b2b-crm-template/templates/b2b-crm --dry-run
```

Review and merge the generated AirApp and Skill ChangeRequests before running the installed app.

## Boundaries

This version does not include Deals, a pipeline, revenue forecasts, email sending, or external integrations. AirApp writes create ChangeRequests and never approve or merge canonical data.
