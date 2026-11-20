# Busa Client Reporting Schema

Use this schema when reading or writing Busa Client Reporting's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case
in app code (`content/busa-client-reporting-app/app/js/reporting-model.js`,
`content/busa-client-reporting-app/app/js/providers/busabase-provider.js`).

Relations are written with the target record's id in a live Space, and
with the target row's package-local `key` in `records.ndjson` sample rows.
In `base.json` a relation's `targetBaseSlug` is the target's `content/`
directory name; in the app config (`app/js/config.js`) the same relation
carries the prefixed slug `busa-client-reporting-<key>`, and
`scripts/sync-content.mjs` translates between the two. Declare relations
in the config only — `base.json` is generated.

**Visibility** below is the client-page boundary: *internal* fields never
render on the Client Report page and are stripped by `buildClientReport()`
in `reporting-model.js` (see `INTERNAL_FIELDS` there).

## Clients (`busa-client-reporting-clients`)

| Field slug | App key | Type | Required | Visibility | Notes |
| --- | --- | --- | --- | --- | --- |
| `client-name` | `client_name` | text | yes | client | primary field |
| `primary-contact` | `primary_contact` | text | no | internal desk | who receives the report |
| `contact-email` | `contact_email` | email | no | internal desk | never guessed |
| `industry` | `industry` | select | no | client | `retail-ecommerce \| saas-technology \| professional-services \| healthcare \| finance \| hospitality \| other` |
| `status` | `status` | select | yes | desk | `active \| paused \| former-client` |
| `reporting-cadence` | `reporting_cadence` | select | no | client | `weekly \| biweekly \| monthly \| quarterly` |
| `notes` | `notes` | longtext | no | **internal** | never on the client page |

Views: `active-clients` (status = Active, by name), `all-clients` (by name).

## Projects (`busa-client-reporting-projects`)

| Field slug | App key | Type | Required | Visibility | Notes |
| --- | --- | --- | --- | --- | --- |
| `project-name` | `project_name` | text | yes | client | |
| `client` | `client` | relation → clients | yes | client | |
| `service-type` | `service_type` | select | no | client | `seo \| paid-media \| social-media \| content \| analytics-reporting \| strategy \| web \| other` |
| `status` | `status` | select | yes | client | `not-started \| in-progress \| at-risk \| on-hold \| completed` |
| `owner` | `owner` | text | no | **internal** | the agency-side owner |
| `start-date` | `start_date` | date | no | client | `YYYY-MM-DD` |
| `due-date` | `due_date` | date | no | client | `YYYY-MM-DD` |
| `summary` | `summary` | longtext | no | client | write it as the client will read it |

Views: `active-projects` (In Progress, by due date), `at-risk-projects`
(At Risk, by due date).

## Deliverables (`busa-client-reporting-deliverables`)

| Field slug | App key | Type | Required | Visibility | Notes |
| --- | --- | --- | --- | --- | --- |
| `deliverable` | `deliverable` | text | yes | client | |
| `project` | `project` | relation → projects | yes | client | |
| `client` | `client` | relation → clients | no | client | falls back to the project's client in the app |
| `status` | `status` | select | yes | client | `planned \| in-progress \| in-review \| sent-to-client \| approved \| revision-requested` |
| `due-date` | `due_date` | date | no | client | |
| `delivered-date` | `delivered_date` | date | no | client | set when status reaches Sent to Client |
| `link` | `link` | url | no | client | link to the delivered artifact |
| `notes` | `notes` | longtext | no | **internal** | |

Views: `awaiting-client` (Sent to Client, by due date),
`deliverables-by-due-date`.

"Awaiting client" on the Overview means Sent to Client or Revision
Requested.

## KPI Snapshots — metrics (`busa-client-reporting-metrics`)

| Field slug | App key | Type | Required | Visibility | Notes |
| --- | --- | --- | --- | --- | --- |
| `metric-label` | `metric_label` | text | yes | client | e.g. "Sessions — October" |
| `client` | `client` | relation → clients | yes | client | |
| `project` | `project` | relation → projects | no | client | |
| `metric` | `metric` | select | no | client | `sessions \| conversions \| leads \| revenue \| ad-spend \| roas \| impressions \| clicks \| ctr \| engagement \| other` |
| `period` | `period` | text | yes | client | e.g. `2026-10` |
| `value` | `value` | number | yes | client | |
| `previous-value` | `previous_value` | number | no | client | previous period's value |
| `target` | `target` | number | no | client | the period's target |
| `unit` | `unit` | text | no | client | e.g. `USD`, `%`, `count` |
| `source` | `source` | text | no | client | where the number came from |
| `notes` | `notes` | longtext | no | **internal** | |

View: `latest-period` (by period, newest first).

**Derived, never stored:** change vs previous `(value − previous) / |previous|`,
change vs target `(value − target) / |target|`, and target progress
`value / target` are computed at read time by `metricChange()` in
`reporting-model.js`. A comparison is `null` (shown as "—") when the
previous/target is missing or zero. There is deliberately no percentage
field on this Base.

## Milestones (`busa-client-reporting-milestones`)

| Field slug | App key | Type | Required | Visibility | Notes |
| --- | --- | --- | --- | --- | --- |
| `milestone` | `milestone` | text | yes | client | |
| `project` | `project` | relation → projects | yes | client | |
| `client` | `client` | relation → clients | no | client | falls back to the project's client |
| `due-date` | `due_date` | date | no | client | timeline order |
| `completed-date` | `completed_date` | date | no | client | |
| `status` | `status` | select | yes | client | `upcoming \| in-progress \| done \| missed` |
| `notes` | `notes` | longtext | no | client | client-visible by design — write accordingly |

Views: `milestone-timeline` (by due date), `missed-milestones`.

## Reports (`busa-client-reporting-reports`)

| Field slug | App key | Type | Required | Visibility | Notes |
| --- | --- | --- | --- | --- | --- |
| `report-title` | `report_title` | text | yes | client | |
| `client` | `client` | relation → clients | yes | client | |
| `project` | `project` | relation → projects | no | client | optional lead project |
| `period` | `period` | text | yes | client | e.g. `2026-10` |
| `status` | `status` | select | yes | desk + client | `draft \| in-review \| ready-to-share \| shared` |
| `executive-summary` | `executive_summary` | longtext | no | client | |
| `highlights` | `highlights` | longtext | no | client | one highlight per line |
| `risks-blockers` | `risks_blockers` | longtext | no | **internal** | never on the client page |
| `next-steps` | `next_steps` | longtext | no | client | one step per line |
| `shared-link-note` | `shared_link_note` | text | no | desk | where/when the read-only share link was sent — **not** a URL field; links are created on the node in Busabase |

Views: `ready-to-share`, `reports-by-period` (newest period first).

The client page uses the latest Ready to Share or Shared report for the
chosen period. Draft and In Review reports never render there.
