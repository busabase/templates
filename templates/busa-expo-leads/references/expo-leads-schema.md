# Busa Expo Leads Schema

Use this schema when reading or writing Busa Expo Leads's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/busa-expo-leads-app/app/js/expo-leads-model.js`,
`content/busa-expo-leads-app/app/js/providers/busabase-provider.js`). The
canonical field declaration lives in
`content/busa-expo-leads-app/app/js/config.js`; `content/<base>/base.json` is
generated from it by `scripts/sync-content.mjs` and must never be hand-edited
directly — edit `config.js`, then run `node scripts/sync-content.mjs`.

## Batches (`busa-expo-leads-batches`)

One row per trade show attended.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `name` | `name` | text | e.g. "Global Sources Hong Kong Electronics Show" |
| `location` | `location` | text | |
| `start-date` | `start_date` | text | ISO date `YYYY-MM-DD` |
| `end-date` | `end_date` | text | ISO date `YYYY-MM-DD` |
| `notes` | `notes` | longtext | |

## Leads (`busa-expo-leads-leads`)

The core table. There is no stored SLA/status field — the SLA bucket is
always computed client-side from `met-at` against the Settings thresholds
(see `expo-leads-model.js`'s `slaStateFor`).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `name` | `name` | text | required |
| `company` | `company` | text | |
| `country` | `country` | text | |
| `language` | `language` | select | `en\|es\|ar\|zh\|other` |
| `batch` | `batch` | relation → `batches` | |
| `card-photo` | `card_photo` | attachment | max 1 file |
| `product-interest` | `product_interest` | text | |
| `contact-channel` | `contact_channel` | select | `whatsapp\|email\|wechat` |
| `contact-handle` | `contact_handle` | text | phone/handle/email matching the channel |
| `met-at` | `met_at` | text | ISO datetime |
| `stage` | `stage` | select | `new\|contacted\|replied\|qualified\|lost`, default `new` |

## Follow-ups (`busa-expo-leads-followups`)

The review/approval queue — the gated-write surface. Every decision is a
ChangeRequest, never a direct canonical mutation from the browser.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `lead` | `lead` | relation → `leads` | |
| `language` | `language` | text | copied from the lead at draft time; may be more specific than the lead's `language` select (e.g. `it`) |
| `draft-text` | `draft_text` | longtext | the drafted message, in the lead's language |
| `channel` | `channel` | select | `whatsapp\|email\|wechat` |
| `status` | `status` | select | `needs_review\|approved\|sent`, default `needs_review` |
| `decision-action` | `decision_action` | select | `approve\|request_changes\|block`, optional |
| `decision-comment` | `decision_comment` | longtext | optional |
| `decided-at` | `decided_at` | text | optional, ISO datetime |
| `execution-status` | `execution_status` | text | optional, e.g. `executed` once actually sent outside the app |
| `execution-detail` | `execution_detail` | longtext | optional |
| `executed-at` | `executed_at` | text | optional, ISO datetime |
| `created-at` | `created_at` | text | |
| `updated-at` | `updated_at` | text | |

## Settings (`busa-expo-leads-settings`)

One row, `record-id: "config"`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `sla-24h-hours` | `sla_24h_hours` | number | default `24` |
| `sla-72h-hours` | `sla_72h_hours` | number | default `72` |
| `reply-templates` | `reply_templates` | longtext | JSON-encoded map of language → default template string |
| `whatsapp-account-env` | `whatsapp_account_env` | text | env var NAME only, never a secret value |
| `email-account-env` | `email_account_env` | text | env var NAME only, never a secret value |

## SLA Bucketing

`slaStateFor(metAtIso, thresholds, nowIso)` returns `"green"` (met less than
`sla-24h-hours` ago), `"amber"` (met between `sla-24h-hours` and
`sla-72h-hours` ago), or `"red"` (met more than `sla-72h-hours` ago, or
`met-at` is missing/unparseable). `bucketLeads` excludes any lead whose
latest follow-up is already `sent`, or whose `stage` is `qualified` or
`lost`, from all three buckets — it no longer needs a countdown.
