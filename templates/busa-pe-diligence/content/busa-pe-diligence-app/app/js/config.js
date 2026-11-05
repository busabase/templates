export const appConfig = {
  "appName": "Busa PE Diligence",
  "appId": "busa-pe-diligence",
  "appSlug": "busa-pe-diligence-app",
  "deployment": "cloud",
  "schemaVersion": 1,
  "readOnly": true,
  "spaceId": "",
  "folder": {
    "key": "busa-pe-diligence",
    "slug": "busa-pe-diligence",
    "name": "Busa PE Diligence",
    "description": "PE due-diligence desk: targets, request lists, an evidence register, red flags and interviews — every conclusion tied to evidence."
  },
  "airApp": {
    "slug": "busa-pe-diligence-app",
    "name": "Busa PE Diligence",
    "resourceKey": "busa-pe-diligence-app"
  },
  "bases": [
    {
      "key": "targets",
      "slug": "busa-pe-diligence-targets",
      "name": "Targets",
      "description": "Target companies under evaluation — one row per company, from first sourcing to the investment committee's decision. The pipeline this desk exists to move.",
      "readLimit": 50,
      "fields": [
        {
          "slug": "name",
          "name": "Company",
          "type": "text",
          "required": true
        },
        {
          "slug": "ticker",
          "name": "Ticker / listing",
          "type": "text",
          "required": false
        },
        {
          "slug": "sector",
          "name": "Sector",
          "type": "text",
          "required": false
        },
        {
          "slug": "geography",
          "name": "Geography",
          "type": "text",
          "required": false
        },
        {
          "slug": "stage",
          "name": "Stage",
          "type": "select",
          "required": true
        },
        {
          "slug": "deal-type",
          "name": "Deal type",
          "type": "select",
          "required": false
        },
        {
          "slug": "ownership-stake-percent",
          "name": "Target ownership stake (%)",
          "type": "number",
          "required": false
        },
        {
          "slug": "enterprise-value-usd-m",
          "name": "Indicative enterprise value (USD m)",
          "type": "number",
          "required": false
        },
        {
          "slug": "financial-snapshot",
          "name": "Financial snapshot",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "deal-source",
          "name": "Deal source",
          "type": "text",
          "required": false
        },
        {
          "slug": "deal-lead",
          "name": "Deal lead",
          "type": "text",
          "required": false
        },
        {
          "slug": "target-ic-date",
          "name": "Target IC date",
          "type": "date",
          "required": false
        },
        {
          "slug": "next-action",
          "name": "Next action",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "about",
          "name": "About / demo note",
          "type": "longtext",
          "required": false
        }
      ]
    },
    {
      "key": "diligence-requests",
      "slug": "busa-pe-diligence-diligence-requests",
      "name": "Diligence Requests",
      "description": "The diligence request list — every document, analysis and check the team has asked for, grouped by workstream, with what is still missing and who is chasing it. This is the desk's main battlefield.",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "Request",
          "type": "text",
          "required": true
        },
        {
          "slug": "target",
          "name": "Target",
          "type": "relation",
          "required": false
        },
        {
          "slug": "workstream",
          "name": "Workstream",
          "type": "select",
          "required": true
        },
        {
          "slug": "criticality",
          "name": "Criticality",
          "type": "select",
          "required": false
        },
        {
          "slug": "status",
          "name": "Status",
          "type": "select",
          "required": true
        },
        {
          "slug": "requested-from",
          "name": "Requested from",
          "type": "text",
          "required": false
        },
        {
          "slug": "advisor-owner",
          "name": "External advisor",
          "type": "text",
          "required": false
        },
        {
          "slug": "internal-owner",
          "name": "Internal owner",
          "type": "text",
          "required": false
        },
        {
          "slug": "due-date",
          "name": "Due date",
          "type": "date",
          "required": false
        },
        {
          "slug": "received-date",
          "name": "Received date",
          "type": "date",
          "required": false
        },
        {
          "slug": "notes",
          "name": "Notes",
          "type": "longtext",
          "required": false
        }
      ]
    },
    {
      "key": "evidence",
      "slug": "busa-pe-diligence-evidence",
      "name": "Evidence Register",
      "description": "One row per piece of evidence — what it is, where it came from, and whether anyone has verified it. The register is the desk's memory of what is actually known, as opposed to what has merely been said.",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "Evidence",
          "type": "text",
          "required": true
        },
        {
          "slug": "target",
          "name": "Target",
          "type": "relation",
          "required": false
        },
        {
          "slug": "request",
          "name": "For request",
          "type": "relation",
          "required": false
        },
        {
          "slug": "evidence-type",
          "name": "Type",
          "type": "select",
          "required": false
        },
        {
          "slug": "source",
          "name": "Source",
          "type": "text",
          "required": true
        },
        {
          "slug": "source-date",
          "name": "Source date",
          "type": "date",
          "required": false
        },
        {
          "slug": "as-of-date",
          "name": "Facts as of",
          "type": "date",
          "required": false
        },
        {
          "slug": "verification",
          "name": "Verification",
          "type": "select",
          "required": true
        },
        {
          "slug": "summary",
          "name": "What it establishes",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "source-link",
          "name": "Source link",
          "type": "url",
          "required": false
        }
      ]
    },
    {
      "key": "findings",
      "slug": "busa-pe-diligence-findings",
      "name": "Findings & Red Flags",
      "description": "What diligence has found — each finding states the claim that was tested, what the evidence actually shows, and what it should do to valuation or terms. No finding exists without the evidence behind it.",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "Finding",
          "type": "text",
          "required": true
        },
        {
          "slug": "target",
          "name": "Target",
          "type": "relation",
          "required": false
        },
        {
          "slug": "evidence",
          "name": "Evidence",
          "type": "relation",
          "required": true
        },
        {
          "slug": "severity",
          "name": "Severity",
          "type": "select",
          "required": true
        },
        {
          "slug": "category",
          "name": "Category",
          "type": "select",
          "required": false
        },
        {
          "slug": "status",
          "name": "Status",
          "type": "select",
          "required": true
        },
        {
          "slug": "claim",
          "name": "The claim being tested",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "what-evidence-shows",
          "name": "What the evidence shows",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "impact",
          "name": "Impact on valuation / terms",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "owner",
          "name": "Owner",
          "type": "text",
          "required": false
        },
        {
          "slug": "resolve-by",
          "name": "Resolve by",
          "type": "date",
          "required": false
        }
      ]
    },
    {
      "key": "interviews",
      "slug": "busa-pe-diligence-interviews",
      "name": "Interviews & Site Visits",
      "description": "Management calls, expert calls, customer references and site visits — what was claimed, by whom, and whether the evidence agrees. Everything said here is a claim until Evidence says otherwise.",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "Interview / visit",
          "type": "text",
          "required": true
        },
        {
          "slug": "target",
          "name": "Target",
          "type": "relation",
          "required": false
        },
        {
          "slug": "interview-type",
          "name": "Type",
          "type": "select",
          "required": false
        },
        {
          "slug": "date",
          "name": "Date",
          "type": "date",
          "required": false
        },
        {
          "slug": "participants",
          "name": "Participants / source",
          "type": "text",
          "required": false
        },
        {
          "slug": "key-claims",
          "name": "Key claims made",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "consistency",
          "name": "Consistency with evidence",
          "type": "select",
          "required": false
        },
        {
          "slug": "credibility",
          "name": "Source credibility",
          "type": "select",
          "required": false
        },
        {
          "slug": "follow-ups",
          "name": "Follow-ups",
          "type": "longtext",
          "required": false
        }
      ]
    }
  ],
  "schema": {
    "folder": {
      "key": "busa-pe-diligence",
      "slug": "busa-pe-diligence",
      "name": "Busa PE Diligence"
    },
    "bases": [
      {
        "key": "targets",
        "slug": "busa-pe-diligence-targets",
        "name": "Targets",
        "description": "Target companies under evaluation — one row per company, from first sourcing to the investment committee's decision. The pipeline this desk exists to move.",
        "readLimit": 50,
        "fields": [
          {
            "slug": "name",
            "name": "Company",
            "type": "text",
            "required": true
          },
          {
            "slug": "ticker",
            "name": "Ticker / listing",
            "type": "text",
            "required": false
          },
          {
            "slug": "sector",
            "name": "Sector",
            "type": "text",
            "required": false
          },
          {
            "slug": "geography",
            "name": "Geography",
            "type": "text",
            "required": false
          },
          {
            "slug": "stage",
            "name": "Stage",
            "type": "select",
            "required": true
          },
          {
            "slug": "deal-type",
            "name": "Deal type",
            "type": "select",
            "required": false
          },
          {
            "slug": "ownership-stake-percent",
            "name": "Target ownership stake (%)",
            "type": "number",
            "required": false
          },
          {
            "slug": "enterprise-value-usd-m",
            "name": "Indicative enterprise value (USD m)",
            "type": "number",
            "required": false
          },
          {
            "slug": "financial-snapshot",
            "name": "Financial snapshot",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "deal-source",
            "name": "Deal source",
            "type": "text",
            "required": false
          },
          {
            "slug": "deal-lead",
            "name": "Deal lead",
            "type": "text",
            "required": false
          },
          {
            "slug": "target-ic-date",
            "name": "Target IC date",
            "type": "date",
            "required": false
          },
          {
            "slug": "next-action",
            "name": "Next action",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "about",
            "name": "About / demo note",
            "type": "longtext",
            "required": false
          }
        ]
      },
      {
        "key": "diligence-requests",
        "slug": "busa-pe-diligence-diligence-requests",
        "name": "Diligence Requests",
        "description": "The diligence request list — every document, analysis and check the team has asked for, grouped by workstream, with what is still missing and who is chasing it. This is the desk's main battlefield.",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "Request",
            "type": "text",
            "required": true
          },
          {
            "slug": "target",
            "name": "Target",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-pe-diligence-targets",
              "multiple": false
            }
          },
          {
            "slug": "workstream",
            "name": "Workstream",
            "type": "select",
            "required": true
          },
          {
            "slug": "criticality",
            "name": "Criticality",
            "type": "select",
            "required": false
          },
          {
            "slug": "status",
            "name": "Status",
            "type": "select",
            "required": true
          },
          {
            "slug": "requested-from",
            "name": "Requested from",
            "type": "text",
            "required": false
          },
          {
            "slug": "advisor-owner",
            "name": "External advisor",
            "type": "text",
            "required": false
          },
          {
            "slug": "internal-owner",
            "name": "Internal owner",
            "type": "text",
            "required": false
          },
          {
            "slug": "due-date",
            "name": "Due date",
            "type": "date",
            "required": false
          },
          {
            "slug": "received-date",
            "name": "Received date",
            "type": "date",
            "required": false
          },
          {
            "slug": "notes",
            "name": "Notes",
            "type": "longtext",
            "required": false
          }
        ]
      },
      {
        "key": "evidence",
        "slug": "busa-pe-diligence-evidence",
        "name": "Evidence Register",
        "description": "One row per piece of evidence — what it is, where it came from, and whether anyone has verified it. The register is the desk's memory of what is actually known, as opposed to what has merely been said.",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "Evidence",
            "type": "text",
            "required": true
          },
          {
            "slug": "target",
            "name": "Target",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-pe-diligence-targets",
              "multiple": false
            }
          },
          {
            "slug": "request",
            "name": "For request",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-pe-diligence-diligence-requests",
              "multiple": false
            }
          },
          {
            "slug": "evidence-type",
            "name": "Type",
            "type": "select",
            "required": false
          },
          {
            "slug": "source",
            "name": "Source",
            "type": "text",
            "required": true
          },
          {
            "slug": "source-date",
            "name": "Source date",
            "type": "date",
            "required": false
          },
          {
            "slug": "as-of-date",
            "name": "Facts as of",
            "type": "date",
            "required": false
          },
          {
            "slug": "verification",
            "name": "Verification",
            "type": "select",
            "required": true
          },
          {
            "slug": "summary",
            "name": "What it establishes",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "source-link",
            "name": "Source link",
            "type": "url",
            "required": false
          }
        ]
      },
      {
        "key": "findings",
        "slug": "busa-pe-diligence-findings",
        "name": "Findings & Red Flags",
        "description": "What diligence has found — each finding states the claim that was tested, what the evidence actually shows, and what it should do to valuation or terms. No finding exists without the evidence behind it.",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "Finding",
            "type": "text",
            "required": true
          },
          {
            "slug": "target",
            "name": "Target",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-pe-diligence-targets",
              "multiple": false
            }
          },
          {
            "slug": "evidence",
            "name": "Evidence",
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "busa-pe-diligence-evidence",
              "multiple": true
            }
          },
          {
            "slug": "severity",
            "name": "Severity",
            "type": "select",
            "required": true
          },
          {
            "slug": "category",
            "name": "Category",
            "type": "select",
            "required": false
          },
          {
            "slug": "status",
            "name": "Status",
            "type": "select",
            "required": true
          },
          {
            "slug": "claim",
            "name": "The claim being tested",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "what-evidence-shows",
            "name": "What the evidence shows",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "impact",
            "name": "Impact on valuation / terms",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "owner",
            "name": "Owner",
            "type": "text",
            "required": false
          },
          {
            "slug": "resolve-by",
            "name": "Resolve by",
            "type": "date",
            "required": false
          }
        ]
      },
      {
        "key": "interviews",
        "slug": "busa-pe-diligence-interviews",
        "name": "Interviews & Site Visits",
        "description": "Management calls, expert calls, customer references and site visits — what was claimed, by whom, and whether the evidence agrees. Everything said here is a claim until Evidence says otherwise.",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "Interview / visit",
            "type": "text",
            "required": true
          },
          {
            "slug": "target",
            "name": "Target",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-pe-diligence-targets",
              "multiple": false
            }
          },
          {
            "slug": "interview-type",
            "name": "Type",
            "type": "select",
            "required": false
          },
          {
            "slug": "date",
            "name": "Date",
            "type": "date",
            "required": false
          },
          {
            "slug": "participants",
            "name": "Participants / source",
            "type": "text",
            "required": false
          },
          {
            "slug": "key-claims",
            "name": "Key claims made",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "consistency",
            "name": "Consistency with evidence",
            "type": "select",
            "required": false
          },
          {
            "slug": "credibility",
            "name": "Source credibility",
            "type": "select",
            "required": false
          },
          {
            "slug": "follow-ups",
            "name": "Follow-ups",
            "type": "longtext",
            "required": false
          }
        ]
      }
    ]
  },
  "permissions": {
    "read_procedures": [
      "nodes.list",
      "nodes.get",
      "records.list",
      "records.get",
      "records.count"
    ],
    "change_request_procedures": [],
    "readProcedures": [
      "nodes.list",
      "nodes.get",
      "records.list",
      "records.get",
      "records.count"
    ],
    "setupProcedures": [],
    "writeProcedures": []
  },
  "onboarding": {
    "version": 1,
    "required_fields": [],
    "completion_resource": "targets",
    "rationale": "Read-only cockpit over the desk's Bases; no operator-specific configuration is required."
  },
  "demoRecords": [
    {
      "id": "target-nvidia",
      "baseKey": "targets",
      "fields": {
        "name": "NVIDIA Corporation",
        "ticker": "NASDAQ: NVDA",
        "sector": "Semiconductors / AI infrastructure",
        "geography": "United States (Santa Clara, CA)",
        "stage": "diligence",
        "deal-type": "minority-growth",
        "ownership-stake-percent": 2,
        "enterprise-value-usd-m": 5000000,
        "financial-snapshot": "FY2026 (year ended Jan 25, 2026): revenue $215.9B (+65.5% YoY); net income $120.1B; gross margin 71.1% (FY2025: 75.0%); Data Center revenue $193.7B, about 90% of total; Gaming about 7%. Market capitalisation about $5.0T (Nov 3, 2026). Source: Form 10-K FY2026 — see Evidence.",
        "deal-source": "Public-market screening (demo example)",
        "deal-lead": "Deal team (demo)",
        "target-ic-date": "2026-12-15",
        "next-action": "Close out the supply-chain expert call notes and the customer checks, then draft the IC memo from verified facts only.",
        "about": "Demo target built from public sources (Form 10-K FY2026) for template demonstration only. This is not a live deal, not investment advice, and not a recommendation on NVIDIA. Figures as of 2026-11."
      }
    },
    {
      "id": "target-harbormed",
      "baseKey": "targets",
      "fields": {
        "name": "HarborMed Supplies Ltd (fictional example)",
        "ticker": "Private (fictional)",
        "sector": "Healthcare distribution",
        "geography": "United Kingdom",
        "stage": "screening",
        "deal-type": "majority-buyout",
        "ownership-stake-percent": 70,
        "enterprise-value-usd-m": 240,
        "financial-snapshot": "Fictional example target: seller teaser claims revenue of GBP 86m and 14% EBITDA margin — claims, not facts, until audited statements arrive.",
        "deal-source": "Intermediary teaser (fictional example)",
        "deal-lead": "Deal team (demo)",
        "target-ic-date": "2027-01-30",
        "next-action": "Obtain audited financial statements for the last three years and scope the quality-of-earnings work.",
        "about": "Fictional example company, included so the Screening stage of the pipeline is not empty. Any resemblance to a real company is unintended; figures are invented for demonstration."
      }
    },
    {
      "id": "target-brightcart",
      "baseKey": "targets",
      "fields": {
        "name": "BrightCart Retail Group (fictional example)",
        "ticker": "Private (fictional)",
        "sector": "Retail",
        "geography": "United States",
        "stage": "passed",
        "deal-type": "majority-buyout",
        "ownership-stake-percent": 80,
        "enterprise-value-usd-m": 410,
        "financial-snapshot": "Fictional example target. Passed at diligence: see the deal-breaker finding.",
        "deal-source": "Proprietary sourcing (fictional example)",
        "deal-lead": "Deal team (demo)",
        "next-action": "None — deal passed. Keep the record: the pass reason is the lesson.",
        "about": "Fictional example company, included so the Passed stage and a deal-breaker finding are visible in the demo. Figures are invented for demonstration."
      }
    },
    {
      "id": "req-nvda-10k",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Form 10-K FY2026 — full filing review",
        "target": [
          "target-nvidia"
        ],
        "workstream": "financial-qoe",
        "criticality": "critical",
        "status": "reviewed",
        "requested-from": "SEC EDGAR (public filing)",
        "internal-owner": "Deal team (demo)",
        "due-date": "2026-11-20",
        "received-date": "2026-11-06",
        "notes": "Primary source for every headline figure in the target's financial snapshot."
      }
    },
    {
      "id": "req-nvda-10q",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Latest Form 10-Q and earnings-call transcript",
        "target": [
          "target-nvidia"
        ],
        "workstream": "financial-qoe",
        "criticality": "standard",
        "status": "reviewed",
        "requested-from": "SEC EDGAR (public filing)",
        "internal-owner": "Deal team (demo)",
        "due-date": "2026-11-20",
        "received-date": "2026-11-08",
        "notes": "Reviewed for changes in segment mix and risk factors since the annual filing."
      }
    },
    {
      "id": "req-nvda-customers",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Customer concentration check — the 22% and 14% direct customers",
        "target": [
          "target-nvidia"
        ],
        "workstream": "commercial",
        "criticality": "critical",
        "status": "received",
        "requested-from": "Form 10-K disclosure; customer calls to follow",
        "internal-owner": "Deal team (demo)",
        "due-date": "2026-12-01",
        "received-date": "2026-11-10",
        "notes": "Concentration is disclosed in the 10-K; durability of that demand is what the customer checks must test."
      }
    },
    {
      "id": "req-nvda-export",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Export-control exposure memo — China and the H20 licence regime",
        "target": [
          "target-nvidia"
        ],
        "workstream": "legal-compliance",
        "criticality": "critical",
        "status": "received",
        "requested-from": "Form 10-K risk factors; external counsel to confirm",
        "advisor-owner": "External counsel (demo)",
        "internal-owner": "Deal team (demo)",
        "due-date": "2026-12-03",
        "received-date": "2026-11-12",
        "notes": "Counsel confirmation outstanding; the filing itself is already in Evidence."
      }
    },
    {
      "id": "req-nvda-expert",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Supply-chain expert call — foundry capacity and allocation",
        "target": [
          "target-nvidia"
        ],
        "workstream": "operations",
        "criticality": "critical",
        "status": "requested",
        "requested-from": "Expert network",
        "advisor-owner": "Expert network (demo)",
        "internal-owner": "Deal team (demo)",
        "due-date": "__3_DAYS_AGO__",
        "notes": "Notes will land in Interviews as claims, and stay claims until corroborated."
      }
    },
    {
      "id": "req-nvda-custchecks",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Customer reference checks — durability of hyperscaler demand",
        "target": [
          "target-nvidia"
        ],
        "workstream": "commercial",
        "criticality": "critical",
        "status": "requested",
        "requested-from": "Customer references via expert network",
        "advisor-owner": "Expert network (demo)",
        "internal-owner": "Deal team (demo)",
        "due-date": "__IN_6_DAYS__",
        "notes": "The commercial test behind the customer-concentration finding."
      }
    },
    {
      "id": "req-nvda-tax",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Tax review — geographic revenue mix (US $149.6B; China incl. Hong Kong $19.7B)",
        "target": [
          "target-nvidia"
        ],
        "workstream": "tax",
        "criticality": "standard",
        "status": "requested",
        "requested-from": "Form 10-K geographic disclosure; tax advisor review",
        "advisor-owner": "Tax advisor (demo)",
        "internal-owner": "Deal team (demo)",
        "due-date": "2026-12-10",
        "notes": "Geography is by customer headquarters location under the filing's current methodology."
      }
    },
    {
      "id": "req-harbor-audited",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Audited financial statements, last three years (fictional example)",
        "target": [
          "target-harbormed"
        ],
        "workstream": "financial-qoe",
        "criticality": "critical",
        "status": "requested",
        "requested-from": "Seller data room (fictional example)",
        "internal-owner": "Deal team (demo)",
        "due-date": "2026-12-18",
        "notes": "Nothing in the teaser counts as a fact until these arrive."
      }
    },
    {
      "id": "req-harbor-qoe-scope",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Quality-of-earnings scoping call (fictional example)",
        "target": [
          "target-harbormed"
        ],
        "workstream": "financial-qoe",
        "criticality": "critical",
        "status": "blocked",
        "requested-from": "Seller / intermediary (fictional example)",
        "advisor-owner": "QoE advisor (demo)",
        "internal-owner": "Deal team (demo)",
        "due-date": "2026-12-11",
        "notes": "Blocked on data-room access (fictional example)."
      }
    },
    {
      "id": "req-bright-qoe",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "QoE revenue-recognition review (fictional example)",
        "target": [
          "target-brightcart"
        ],
        "workstream": "financial-qoe",
        "criticality": "critical",
        "status": "reviewed",
        "requested-from": "Advisor QoE work (fictional example)",
        "advisor-owner": "QoE advisor (demo)",
        "internal-owner": "Deal team (demo)",
        "due-date": "2026-10-30",
        "received-date": "2026-10-28",
        "notes": "The review produced the deal-breaker finding on this target (fictional example)."
      }
    },
    {
      "id": "ev-nvda-10k",
      "baseKey": "evidence",
      "fields": {
        "title": "Form 10-K FY2026 (fiscal year ended Jan 25, 2026)",
        "target": [
          "target-nvidia"
        ],
        "request": [
          "req-nvda-10k"
        ],
        "evidence-type": "filing",
        "source": "SEC Form 10-K, filed Feb 25, 2026",
        "source-date": "2026-02-25",
        "as-of-date": "2026-11-05",
        "verification": "verified",
        "summary": "Primary source. FY2026 revenue $215.9B (+65.5% YoY); net income $120.1B; gross margin 71.1%, down from 75.0%; Data Center revenue $193.7B, about 90% of total, Gaming about 7%; two direct customers at 22% and 14% of revenue; revenue by customer headquarters: US $149.6B, China incl. Hong Kong $19.7B; a $4.5B charge in Q1 FY2026 tied to H20 export-licence requirements for China."
      }
    },
    {
      "id": "ev-nvda-10q",
      "baseKey": "evidence",
      "fields": {
        "title": "Latest Form 10-Q and quarterly results release",
        "target": [
          "target-nvidia"
        ],
        "request": [
          "req-nvda-10q"
        ],
        "evidence-type": "filing",
        "source": "SEC Form 10-Q (most recent quarter on file)",
        "source-date": "2026-08-26",
        "as-of-date": "2026-11-05",
        "verification": "verified",
        "summary": "Quarterly update reviewed against the annual filing for changes in segment mix, customer concentration language and risk factors; the annual figures in the snapshot remain the 10-K's."
      }
    },
    {
      "id": "ev-nvda-call",
      "baseKey": "evidence",
      "fields": {
        "title": "Q4 FY2026 earnings-call transcript",
        "target": [
          "target-nvidia"
        ],
        "request": [
          "req-nvda-10q"
        ],
        "evidence-type": "transcript",
        "source": "Public earnings call, February 2026",
        "source-date": "2026-02-25",
        "as-of-date": "2026-11-05",
        "verification": "verified",
        "summary": "Management's own commentary, kept as a transcript so claims made on the call can be checked line by line against the filing. The transcript verifies what was said — not that what was said is true."
      }
    },
    {
      "id": "ev-nvda-mktcap",
      "baseKey": "evidence",
      "fields": {
        "title": "Market capitalisation, about $5.0T (Nov 3, 2026)",
        "target": [
          "target-nvidia"
        ],
        "evidence-type": "public-source",
        "source": "Third-party market data, Nov 3, 2026",
        "source-date": "2026-11-03",
        "as-of-date": "2026-11-05",
        "verification": "unverified",
        "summary": "A moving market figure from a third-party data page. Re-base on the IC-date close before any valuation work; do not carry this number into the IC memo as a fact."
      }
    },
    {
      "id": "ev-harbor-teaser",
      "baseKey": "evidence",
      "fields": {
        "title": "Seller teaser — HarborMed (fictional example)",
        "target": [
          "target-harbormed"
        ],
        "evidence-type": "data-room",
        "source": "Seller-provided teaser (fictional example)",
        "source-date": "2026-11-02",
        "as-of-date": "2026-11-05",
        "verification": "unverified",
        "summary": "Fictional example. A seller's teaser is a set of claims by construction; every figure in it stays Unverified until audited statements arrive."
      }
    },
    {
      "id": "ev-bright-qoe",
      "baseKey": "evidence",
      "fields": {
        "title": "Quality of earnings report — BrightCart (fictional example)",
        "target": [
          "target-brightcart"
        ],
        "request": [
          "req-bright-qoe"
        ],
        "evidence-type": "advisor-report",
        "source": "External QoE advisor (fictional example)",
        "source-date": "2026-10-28",
        "as-of-date": "2026-11-05",
        "verification": "verified",
        "summary": "Fictional example: advisor QoE report identifying revenue-recognition adjustments in the seller's reported EBITDA."
      }
    },
    {
      "id": "find-nvda-concentration",
      "baseKey": "findings",
      "fields": {
        "title": "Customer concentration: two direct customers are 22% and 14% of revenue",
        "target": [
          "target-nvidia"
        ],
        "evidence": [
          "ev-nvda-10k"
        ],
        "severity": "high",
        "category": "customer-concentration",
        "status": "open",
        "claim": "Demand is broad-based and no single customer matters to the investment case.",
        "what-evidence-shows": "Form 10-K FY2026 discloses two direct customers representing 22% and 14% of total revenue.",
        "impact": "Underwrite the downside case on losing one anchor customer, and complete the customer reference checks before IC.",
        "owner": "Deal team (demo)",
        "resolve-by": "2026-12-05"
      }
    },
    {
      "id": "find-nvda-china",
      "baseKey": "findings",
      "fields": {
        "title": "China exposure and export controls: H20 charge and zero-China guidance",
        "target": [
          "target-nvidia"
        ],
        "evidence": [
          "ev-nvda-10k"
        ],
        "severity": "high",
        "category": "legal",
        "status": "open",
        "claim": "China remains an available growth market for data-center compute.",
        "what-evidence-shows": "The 10-K records a $4.5B charge in Q1 FY2026 tied to H20 export-licence requirements, China (incl. Hong Kong) was $19.7B of FY2026 revenue by customer headquarters, and forward guidance assumes no China Data Center compute revenue.",
        "impact": "Value the China data-center line at zero in the base case; treat any licence recovery as upside, never as underwriting.",
        "owner": "Deal team (demo)",
        "resolve-by": "2026-12-03"
      }
    },
    {
      "id": "find-nvda-margin",
      "baseKey": "findings",
      "fields": {
        "title": "Gross-margin compression on the Blackwell transition",
        "target": [
          "target-nvidia"
        ],
        "evidence": [
          "ev-nvda-10k"
        ],
        "severity": "medium",
        "category": "financial-qoe",
        "status": "open",
        "claim": "Margins recover to prior levels as the new platform ramps.",
        "what-evidence-shows": "Gross margin was 71.1% in FY2026, down from 75.0% in FY2025 (Form 10-K).",
        "impact": "Underwrite the lower margin until two consecutive quarters of recovery are in evidence.",
        "owner": "Deal team (demo)",
        "resolve-by": "2026-12-12"
      }
    },
    {
      "id": "find-harbor-unaudited",
      "baseKey": "findings",
      "fields": {
        "title": "No audited financials yet — seller figures are claims (fictional example)",
        "target": [
          "target-harbormed"
        ],
        "evidence": [
          "ev-harbor-teaser"
        ],
        "severity": "high",
        "category": "financial-qoe",
        "status": "open",
        "claim": "Revenue of GBP 86m at a 14% EBITDA margin, per the seller teaser.",
        "what-evidence-shows": "Nothing yet — the only source is the seller's own teaser, marked Unverified in Evidence.",
        "impact": "No valuation work and no IC date until audited statements land (fictional example).",
        "owner": "Deal team (demo)",
        "resolve-by": "2026-12-18"
      }
    },
    {
      "id": "find-bright-qoe",
      "baseKey": "findings",
      "fields": {
        "title": "QoE: revenue-recognition adjustments the seller would not bridge (fictional example)",
        "target": [
          "target-brightcart"
        ],
        "evidence": [
          "ev-bright-qoe"
        ],
        "severity": "critical",
        "category": "financial-qoe",
        "status": "deal-breaker",
        "claim": "Reported EBITDA as presented in the seller's materials.",
        "what-evidence-shows": "The advisor QoE report (fictional example) adjusts reported EBITDA for revenue recognised ahead of delivery; the seller declined to bridge the difference in price or warranties.",
        "impact": "Deal passed. The finding stays on the record so the pass is auditable (fictional example).",
        "owner": "Deal team (demo)",
        "resolve-by": "2026-10-30"
      }
    },
    {
      "id": "int-nvda-earnings",
      "baseKey": "interviews",
      "fields": {
        "title": "Public earnings call — Q4 FY2026",
        "target": [
          "target-nvidia"
        ],
        "interview-type": "earnings-call",
        "date": "2026-02-25",
        "participants": "NVIDIA management (public call)",
        "key-claims": "Management commentary on demand durability and the Blackwell platform ramp, as recorded in the transcript in Evidence.",
        "consistency": "consistent",
        "credibility": "high",
        "follow-ups": "Re-check the same claims against the next Form 10-Q before IC."
      }
    },
    {
      "id": "int-nvda-expert",
      "baseKey": "interviews",
      "fields": {
        "title": "Expert call — supply-chain specialist",
        "target": [
          "target-nvidia"
        ],
        "interview-type": "expert",
        "date": "__2_DAYS_AGO__",
        "participants": "Independent supply-chain expert (demo)",
        "key-claims": "Claims about foundry capacity allocation and lead times. Claims, not evidence — nothing here upgrades any figure.",
        "consistency": "untested",
        "credibility": "medium",
        "follow-ups": "Corroborate with a second expert and the customer checks before IC."
      }
    },
    {
      "id": "int-harbor-mgmt",
      "baseKey": "interviews",
      "fields": {
        "title": "Management call — HarborMed founders (fictional example)",
        "target": [
          "target-harbormed"
        ],
        "interview-type": "management",
        "date": "2026-11-09",
        "participants": "Founder team (fictional example)",
        "key-claims": "Growth and margin claims matching the teaser — which is exactly why they stay untested until audited statements arrive.",
        "consistency": "untested",
        "credibility": "medium",
        "follow-ups": "Test every number against the audited financials when received."
      }
    }
  ]
};
