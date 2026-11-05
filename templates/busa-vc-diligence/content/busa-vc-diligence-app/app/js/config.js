export const appConfig = {
  "appName": "Busa VC Diligence",
  "appId": "busa-vc-diligence",
  "appSlug": "busa-vc-diligence-app",
  "deployment": "cloud",
  "schemaVersion": 1,
  "readOnly": true,
  "spaceId": "",
  "folder": {
    "key": "busa-vc-diligence",
    "slug": "busa-vc-diligence",
    "name": "Busa VC Diligence"
  },
  "airApp": {
    "slug": "busa-vc-diligence-app",
    "name": "Busa VC Diligence",
    "resourceKey": "busa-vc-diligence-app"
  },
  "bases": [
    {
      "key": "targets",
      "slug": "busa-vc-diligence-targets",
      "name": "Targets",
      "readLimit": 50,
      "localizedName": {
        "en": "Targets"
      },
      "fields": [
        {
          "slug": "name",
          "name": "Company",
          "localizedName": {
            "en": "Company"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "stage",
          "name": "Stage",
          "localizedName": {
            "en": "Stage"
          },
          "type": "select",
          "required": true
        },
        {
          "slug": "sector",
          "name": "Sector",
          "localizedName": {
            "en": "Sector"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "headquarters",
          "name": "Headquarters",
          "localizedName": {
            "en": "Headquarters"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "website",
          "name": "Website",
          "localizedName": {
            "en": "Website"
          },
          "type": "url",
          "required": false
        },
        {
          "slug": "lead",
          "name": "Deal lead",
          "localizedName": {
            "en": "Deal lead"
          },
          "type": "member",
          "required": false
        },
        {
          "slug": "source",
          "name": "Source",
          "localizedName": {
            "en": "Source"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "round",
          "name": "Round",
          "localizedName": {
            "en": "Round"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "proposed-amount",
          "name": "Proposed amount (USD)",
          "localizedName": {
            "en": "Proposed amount (USD)"
          },
          "type": "number",
          "required": false
        },
        {
          "slug": "ic-date",
          "name": "IC date",
          "localizedName": {
            "en": "IC date"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "thesis",
          "name": "Investment thesis",
          "localizedName": {
            "en": "Investment thesis"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "description",
          "name": "What it does",
          "localizedName": {
            "en": "What it does"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "data-basis",
          "name": "Data basis",
          "localizedName": {
            "en": "Data basis"
          },
          "type": "select",
          "required": false
        }
      ]
    },
    {
      "key": "diligence-requests",
      "slug": "busa-vc-diligence-diligence-requests",
      "name": "Diligence Requests",
      "readLimit": 50,
      "localizedName": {
        "en": "Diligence Requests"
      },
      "fields": [
        {
          "slug": "title",
          "name": "Request",
          "localizedName": {
            "en": "Request"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "target",
          "name": "Target",
          "localizedName": {
            "en": "Target"
          },
          "type": "relation",
          "required": true
        },
        {
          "slug": "workstream",
          "name": "Workstream",
          "localizedName": {
            "en": "Workstream"
          },
          "type": "select",
          "required": true
        },
        {
          "slug": "criticality",
          "name": "Criticality",
          "localizedName": {
            "en": "Criticality"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "status",
          "name": "Status",
          "localizedName": {
            "en": "Status"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "requested-from",
          "name": "Requested from",
          "localizedName": {
            "en": "Requested from"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "due-date",
          "name": "Due date",
          "localizedName": {
            "en": "Due date"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "received-date",
          "name": "Received date",
          "localizedName": {
            "en": "Received date"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "notes",
          "name": "Notes",
          "localizedName": {
            "en": "Notes"
          },
          "type": "longtext",
          "required": false
        }
      ]
    },
    {
      "key": "evidence",
      "slug": "busa-vc-diligence-evidence",
      "name": "Evidence Register",
      "readLimit": 50,
      "localizedName": {
        "en": "Evidence Register"
      },
      "fields": [
        {
          "slug": "title",
          "name": "Evidence",
          "localizedName": {
            "en": "Evidence"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "target",
          "name": "Target",
          "localizedName": {
            "en": "Target"
          },
          "type": "relation",
          "required": true
        },
        {
          "slug": "request",
          "name": "Answers request",
          "localizedName": {
            "en": "Answers request"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "type",
          "name": "Type",
          "localizedName": {
            "en": "Type"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "source",
          "name": "Source",
          "localizedName": {
            "en": "Source"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "source-url",
          "name": "Source link",
          "localizedName": {
            "en": "Source link"
          },
          "type": "url",
          "required": false
        },
        {
          "slug": "document-date",
          "name": "Document date",
          "localizedName": {
            "en": "Document date"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "as-of",
          "name": "Data as of",
          "localizedName": {
            "en": "Data as of"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "verification",
          "name": "Verification",
          "localizedName": {
            "en": "Verification"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "summary",
          "name": "What it shows",
          "localizedName": {
            "en": "What it shows"
          },
          "type": "longtext",
          "required": false
        }
      ]
    },
    {
      "key": "findings",
      "slug": "busa-vc-diligence-findings",
      "name": "Findings & Red Flags",
      "readLimit": 50,
      "localizedName": {
        "en": "Findings & Red Flags"
      },
      "fields": [
        {
          "slug": "title",
          "name": "Finding",
          "localizedName": {
            "en": "Finding"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "target",
          "name": "Target",
          "localizedName": {
            "en": "Target"
          },
          "type": "relation",
          "required": true
        },
        {
          "slug": "evidence",
          "name": "Evidence",
          "localizedName": {
            "en": "Evidence"
          },
          "type": "relation",
          "required": true
        },
        {
          "slug": "workstream",
          "name": "Workstream",
          "localizedName": {
            "en": "Workstream"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "severity",
          "name": "Severity",
          "localizedName": {
            "en": "Severity"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "status",
          "name": "Status",
          "localizedName": {
            "en": "Status"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "claim",
          "name": "Claim being tested",
          "localizedName": {
            "en": "Claim being tested"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "what-we-know",
          "name": "What the evidence shows",
          "localizedName": {
            "en": "What the evidence shows"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "impact",
          "name": "Impact on valuation / terms / decision",
          "localizedName": {
            "en": "Impact on valuation / terms / decision"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "owner",
          "name": "Owner",
          "localizedName": {
            "en": "Owner"
          },
          "type": "member",
          "required": false
        },
        {
          "slug": "resolve-by",
          "name": "Resolve by",
          "localizedName": {
            "en": "Resolve by"
          },
          "type": "date",
          "required": false
        }
      ]
    },
    {
      "key": "interviews",
      "slug": "busa-vc-diligence-interviews",
      "name": "Interviews & References",
      "readLimit": 50,
      "localizedName": {
        "en": "Interviews & References"
      },
      "fields": [
        {
          "slug": "title",
          "name": "Interview",
          "localizedName": {
            "en": "Interview"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "target",
          "name": "Target",
          "localizedName": {
            "en": "Target"
          },
          "type": "relation",
          "required": true
        },
        {
          "slug": "type",
          "name": "Type",
          "localizedName": {
            "en": "Type"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "interviewee",
          "name": "Interviewee / role",
          "localizedName": {
            "en": "Interviewee / role"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "date",
          "name": "Date",
          "localizedName": {
            "en": "Date"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "interviewer",
          "name": "Interview lead",
          "localizedName": {
            "en": "Interview lead"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "key-claims",
          "name": "Key claims made",
          "localizedName": {
            "en": "Key claims made"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "consistency",
          "name": "Consistency with evidence",
          "localizedName": {
            "en": "Consistency with evidence"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "credibility",
          "name": "Credibility",
          "localizedName": {
            "en": "Credibility"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "follow-ups",
          "name": "Follow-ups",
          "localizedName": {
            "en": "Follow-ups"
          },
          "type": "longtext",
          "required": false
        }
      ]
    }
  ],
  "schema": {
    "folder": {
      "key": "busa-vc-diligence",
      "slug": "busa-vc-diligence",
      "name": "Busa VC Diligence"
    },
    "bases": [
      {
        "key": "targets",
        "slug": "busa-vc-diligence-targets",
        "name": "Targets",
        "readLimit": 50,
        "localizedName": {
          "en": "Targets"
        },
        "fields": [
          {
            "slug": "name",
            "name": "Company",
            "localizedName": {
              "en": "Company"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "stage",
            "name": "Stage",
            "localizedName": {
              "en": "Stage"
            },
            "type": "select",
            "required": true
          },
          {
            "slug": "sector",
            "name": "Sector",
            "localizedName": {
              "en": "Sector"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "headquarters",
            "name": "Headquarters",
            "localizedName": {
              "en": "Headquarters"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "website",
            "name": "Website",
            "localizedName": {
              "en": "Website"
            },
            "type": "url",
            "required": false
          },
          {
            "slug": "lead",
            "name": "Deal lead",
            "localizedName": {
              "en": "Deal lead"
            },
            "type": "member",
            "required": false
          },
          {
            "slug": "source",
            "name": "Source",
            "localizedName": {
              "en": "Source"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "round",
            "name": "Round",
            "localizedName": {
              "en": "Round"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "proposed-amount",
            "name": "Proposed amount (USD)",
            "localizedName": {
              "en": "Proposed amount (USD)"
            },
            "type": "number",
            "required": false
          },
          {
            "slug": "ic-date",
            "name": "IC date",
            "localizedName": {
              "en": "IC date"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "thesis",
            "name": "Investment thesis",
            "localizedName": {
              "en": "Investment thesis"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "description",
            "name": "What it does",
            "localizedName": {
              "en": "What it does"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "data-basis",
            "name": "Data basis",
            "localizedName": {
              "en": "Data basis"
            },
            "type": "select",
            "required": false
          }
        ]
      },
      {
        "key": "diligence-requests",
        "slug": "busa-vc-diligence-diligence-requests",
        "name": "Diligence Requests",
        "readLimit": 50,
        "localizedName": {
          "en": "Diligence Requests"
        },
        "fields": [
          {
            "slug": "title",
            "name": "Request",
            "localizedName": {
              "en": "Request"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "target",
            "name": "Target",
            "localizedName": {
              "en": "Target"
            },
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "busa-vc-diligence-targets"
            }
          },
          {
            "slug": "workstream",
            "name": "Workstream",
            "localizedName": {
              "en": "Workstream"
            },
            "type": "select",
            "required": true
          },
          {
            "slug": "criticality",
            "name": "Criticality",
            "localizedName": {
              "en": "Criticality"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "status",
            "name": "Status",
            "localizedName": {
              "en": "Status"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "requested-from",
            "name": "Requested from",
            "localizedName": {
              "en": "Requested from"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "due-date",
            "name": "Due date",
            "localizedName": {
              "en": "Due date"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "received-date",
            "name": "Received date",
            "localizedName": {
              "en": "Received date"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "notes",
            "name": "Notes",
            "localizedName": {
              "en": "Notes"
            },
            "type": "longtext",
            "required": false
          }
        ]
      },
      {
        "key": "evidence",
        "slug": "busa-vc-diligence-evidence",
        "name": "Evidence Register",
        "readLimit": 50,
        "localizedName": {
          "en": "Evidence Register"
        },
        "fields": [
          {
            "slug": "title",
            "name": "Evidence",
            "localizedName": {
              "en": "Evidence"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "target",
            "name": "Target",
            "localizedName": {
              "en": "Target"
            },
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "busa-vc-diligence-targets"
            }
          },
          {
            "slug": "request",
            "name": "Answers request",
            "localizedName": {
              "en": "Answers request"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-vc-diligence-diligence-requests"
            }
          },
          {
            "slug": "type",
            "name": "Type",
            "localizedName": {
              "en": "Type"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "source",
            "name": "Source",
            "localizedName": {
              "en": "Source"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "source-url",
            "name": "Source link",
            "localizedName": {
              "en": "Source link"
            },
            "type": "url",
            "required": false
          },
          {
            "slug": "document-date",
            "name": "Document date",
            "localizedName": {
              "en": "Document date"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "as-of",
            "name": "Data as of",
            "localizedName": {
              "en": "Data as of"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "verification",
            "name": "Verification",
            "localizedName": {
              "en": "Verification"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "summary",
            "name": "What it shows",
            "localizedName": {
              "en": "What it shows"
            },
            "type": "longtext",
            "required": false
          }
        ]
      },
      {
        "key": "findings",
        "slug": "busa-vc-diligence-findings",
        "name": "Findings & Red Flags",
        "readLimit": 50,
        "localizedName": {
          "en": "Findings & Red Flags"
        },
        "fields": [
          {
            "slug": "title",
            "name": "Finding",
            "localizedName": {
              "en": "Finding"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "target",
            "name": "Target",
            "localizedName": {
              "en": "Target"
            },
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "busa-vc-diligence-targets"
            }
          },
          {
            "slug": "evidence",
            "name": "Evidence",
            "localizedName": {
              "en": "Evidence"
            },
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "busa-vc-diligence-evidence"
            }
          },
          {
            "slug": "workstream",
            "name": "Workstream",
            "localizedName": {
              "en": "Workstream"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "severity",
            "name": "Severity",
            "localizedName": {
              "en": "Severity"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "status",
            "name": "Status",
            "localizedName": {
              "en": "Status"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "claim",
            "name": "Claim being tested",
            "localizedName": {
              "en": "Claim being tested"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "what-we-know",
            "name": "What the evidence shows",
            "localizedName": {
              "en": "What the evidence shows"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "impact",
            "name": "Impact on valuation / terms / decision",
            "localizedName": {
              "en": "Impact on valuation / terms / decision"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "owner",
            "name": "Owner",
            "localizedName": {
              "en": "Owner"
            },
            "type": "member",
            "required": false
          },
          {
            "slug": "resolve-by",
            "name": "Resolve by",
            "localizedName": {
              "en": "Resolve by"
            },
            "type": "date",
            "required": false
          }
        ]
      },
      {
        "key": "interviews",
        "slug": "busa-vc-diligence-interviews",
        "name": "Interviews & References",
        "readLimit": 50,
        "localizedName": {
          "en": "Interviews & References"
        },
        "fields": [
          {
            "slug": "title",
            "name": "Interview",
            "localizedName": {
              "en": "Interview"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "target",
            "name": "Target",
            "localizedName": {
              "en": "Target"
            },
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "busa-vc-diligence-targets"
            }
          },
          {
            "slug": "type",
            "name": "Type",
            "localizedName": {
              "en": "Type"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "interviewee",
            "name": "Interviewee / role",
            "localizedName": {
              "en": "Interviewee / role"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "date",
            "name": "Date",
            "localizedName": {
              "en": "Date"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "interviewer",
            "name": "Interview lead",
            "localizedName": {
              "en": "Interview lead"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "key-claims",
            "name": "Key claims made",
            "localizedName": {
              "en": "Key claims made"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "consistency",
            "name": "Consistency with evidence",
            "localizedName": {
              "en": "Consistency with evidence"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "credibility",
            "name": "Credibility",
            "localizedName": {
              "en": "Credibility"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "follow-ups",
            "name": "Follow-ups",
            "localizedName": {
              "en": "Follow-ups"
            },
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
  "demoRecords": [
    {
      "id": "demo-target-perplexity",
      "baseKey": "targets",
      "fields": {
        "name": "Perplexity AI",
        "stage": "diligence",
        "sector": "AI search / consumer AI",
        "headquarters": "San Francisco, CA",
        "website": "https://www.perplexity.ai",
        "source": "inbound",
        "round": "Growth round (reported)",
        "data-basis": "real-company",
        "thesis": "AI-native answer engine with reportedly rapid revenue growth. The thesis stands or falls on verifying revenue quality, paid retention and model costs — none of which are public.",
        "description": "Private AI search company. Demo target built from public reporting as of November 2026 — not investment advice. Every figure here is Reported or Unverified until primary evidence lands."
      }
    },
    {
      "id": "demo-request-model-costs",
      "baseKey": "diligence-requests",
      "fields": {
        "title": "Model and inference cost breakdown per query",
        "target": [
          "demo-target-perplexity"
        ],
        "workstream": "financials",
        "criticality": "critical",
        "status": "blocked",
        "requested-from": "Company finance team",
        "due-date": "__OVERDUE__",
        "notes": "Blocked: company considers unit costs competitively sensitive. Margin discussion must be flagged as resting on unverified inputs."
      }
    },
    {
      "id": "demo-evidence-founder-statement",
      "baseKey": "evidence",
      "fields": {
        "title": "Founder statement: ~$500M annualised revenue (Mar 2026)",
        "target": [
          "demo-target-perplexity"
        ],
        "type": "company-statement",
        "source": "Founder's public post on X",
        "document-date": "2026-03-15",
        "as-of": "2026-03-31",
        "verification": "unverified",
        "summary": "A company claim, logged as a claim. Unaudited, and 'annualised' is undefined in the statement — never quote it as a financial result."
      }
    },
    {
      "id": "demo-finding-arr",
      "baseKey": "findings",
      "fields": {
        "title": "Revenue figures are unaudited and the ARR definition is unclear",
        "target": [
          "demo-target-perplexity"
        ],
        "evidence": [
          "demo-evidence-founder-statement"
        ],
        "workstream": "financials",
        "severity": "high",
        "status": "open",
        "resolve-by": "__DUE_SOON__",
        "claim": "ARR of ~$200M was reported for Sep 2025, and the founder later stated ~$500M 'annualised' revenue (Mar 2026).",
        "what-we-know": "Open verification question: both figures are reported or company-stated; no audited or management accounts received yet, and the $500M definition is undefined in the sources held.",
        "impact": "The valuation discussion is anchored on these numbers. Any term sheet should condition on receipt of management accounts."
      }
    },
    {
      "id": "demo-interview-expert",
      "baseKey": "interviews",
      "fields": {
        "title": "Expert call — AI search market structure",
        "target": [
          "demo-target-perplexity"
        ],
        "type": "expert",
        "interviewee": "Former search-industry executive (expert network call)",
        "date": "__RECENT__",
        "interviewer": "Deal team",
        "key-claims": "Claims logged as claims: distribution partnerships decide who keeps query share; enterprise seats are expanding faster than consumer subscriptions. None of this is verified by the call itself.",
        "consistency": "untested",
        "credibility": "medium",
        "follow-ups": "Test the distribution claim against the customer-concentration summary; seek a publisher-side expert."
      }
    }
  ]
};
