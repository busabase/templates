export const appConfig = {
  "appId": "b2b-crm",
  "schemaVersion": 2,
  "appName": "B2B CRM",
  "appSlug": "b2b-crm",
  "description": "A lightweight B2B CRM with account relationships, follow-ups, and a review-first sales pipeline.",
  "locale": "en",
  "deployment": "cloud",
  "spaceId": "",
  "readOnly": false,
  "brand": {
    "mode": "inferred",
    "accent": "#0F766E",
    "logo_path": ""
  },
  "schema": {
    "folder": {
      "name": "B2B CRM",
      "slug": "b2b-crm",
      "nodeId": ""
    },
    "bases": [
      {
        "key": "companies",
        "name": "Companies",
        "slug": "b2b-crm-companies",
        "nodeId": "",
        "baseId": "",
        "readLimit": 50,
        "description": "Organizations tracked by the sales team.",
        "fields": [
          {
            "slug": "company-name",
            "name": "Company Name",
            "type": "text",
            "required": true
          },
          {
            "slug": "website",
            "name": "Website",
            "type": "url",
            "required": false
          },
          {
            "slug": "industry",
            "name": "Industry",
            "type": "select",
            "required": false,
            "options": {
              "choices": [
                {
                  "id": "software-technology",
                  "name": "Software & Technology"
                },
                {
                  "id": "financial-services",
                  "name": "Financial Services"
                },
                {
                  "id": "professional-services",
                  "name": "Professional Services"
                },
                {
                  "id": "manufacturing",
                  "name": "Manufacturing"
                },
                {
                  "id": "healthcare",
                  "name": "Healthcare"
                },
                {
                  "id": "retail-ecommerce",
                  "name": "Retail & E-commerce"
                },
                {
                  "id": "other",
                  "name": "Other"
                }
              ]
            }
          },
          {
            "slug": "relationship-type",
            "name": "Relationship Type",
            "type": "select",
            "required": true,
            "options": {
              "choices": [
                {
                  "id": "prospect",
                  "name": "Prospect"
                },
                {
                  "id": "customer",
                  "name": "Customer"
                },
                {
                  "id": "partner",
                  "name": "Partner"
                },
                {
                  "id": "former-customer",
                  "name": "Former Customer"
                }
              ]
            }
          },
          {
            "slug": "company-size",
            "name": "Company Size",
            "type": "select",
            "required": false,
            "options": {
              "choices": [
                {
                  "id": "1-10",
                  "name": "1-10"
                },
                {
                  "id": "11-50",
                  "name": "11-50"
                },
                {
                  "id": "51-200",
                  "name": "51-200"
                },
                {
                  "id": "201-500",
                  "name": "201-500"
                },
                {
                  "id": "501-1000",
                  "name": "501-1,000"
                },
                {
                  "id": "1001-plus",
                  "name": "1,001+"
                }
              ]
            }
          },
          {
            "slug": "headquarters",
            "name": "Headquarters",
            "type": "text",
            "required": false
          },
          {
            "slug": "notes",
            "name": "Notes",
            "type": "longtext",
            "required": false
          }
        ],
        "views": [
          {
            "key": "account-directory",
            "name": "Account Directory",
            "type": "table",
            "config": {
              "visibleFieldSlugs": [
                "company-name",
                "relationship-type",
                "industry",
                "company-size",
                "website",
                "headquarters"
              ],
              "sorts": [
                {
                  "fieldSlug": "company-name",
                  "direction": "asc"
                }
              ]
            },
            "viewId": ""
          }
        ]
      },
      {
        "key": "contacts",
        "name": "Contacts",
        "slug": "b2b-crm-contacts",
        "nodeId": "",
        "baseId": "",
        "readLimit": 50,
        "description": "People connected to tracked companies.",
        "fields": [
          {
            "slug": "full-name",
            "name": "Full Name",
            "type": "text",
            "required": true
          },
          {
            "slug": "company",
            "name": "Company",
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "companies",
              "multiple": false
            }
          },
          {
            "slug": "job-title",
            "name": "Job Title",
            "type": "text",
            "required": false
          },
          {
            "slug": "buying-role",
            "name": "Buying Role",
            "type": "select",
            "required": false,
            "options": {
              "choices": [
                {
                  "id": "decision-maker",
                  "name": "Decision Maker"
                },
                {
                  "id": "champion",
                  "name": "Champion"
                },
                {
                  "id": "influencer",
                  "name": "Influencer"
                },
                {
                  "id": "evaluator",
                  "name": "Evaluator"
                },
                {
                  "id": "end-user",
                  "name": "End User"
                },
                {
                  "id": "other",
                  "name": "Other"
                }
              ]
            }
          },
          {
            "slug": "email",
            "name": "Email",
            "type": "email",
            "required": false
          },
          {
            "slug": "phone",
            "name": "Phone",
            "type": "phone",
            "required": false
          },
          {
            "slug": "linkedin-profile",
            "name": "LinkedIn Profile",
            "type": "url",
            "required": false
          },
          {
            "slug": "contact-status",
            "name": "Contact Status",
            "type": "select",
            "required": true,
            "options": {
              "choices": [
                {
                  "id": "active",
                  "name": "Active"
                },
                {
                  "id": "inactive",
                  "name": "Inactive"
                }
              ]
            }
          },
          {
            "slug": "notes",
            "name": "Notes",
            "type": "longtext",
            "required": false
          }
        ],
        "views": [
          {
            "key": "contact-directory",
            "name": "Contact Directory",
            "type": "table",
            "config": {
              "visibleFieldSlugs": [
                "full-name",
                "company",
                "job-title",
                "buying-role",
                "email",
                "contact-status"
              ],
              "sorts": [
                {
                  "fieldSlug": "full-name",
                  "direction": "asc"
                }
              ]
            },
            "viewId": ""
          }
        ]
      },
      {
        "key": "activities",
        "name": "Activities",
        "slug": "b2b-crm-activities",
        "nodeId": "",
        "baseId": "",
        "readLimit": 30,
        "description": "Calls, emails, meetings, notes, and next follow-up dates.",
        "fields": [
          {
            "slug": "activity-subject",
            "name": "Activity Subject",
            "type": "text",
            "required": true
          },
          {
            "slug": "company",
            "name": "Company",
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "companies",
              "multiple": false
            }
          },
          {
            "slug": "contact",
            "name": "Contact",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "contacts",
              "multiple": false
            }
          },
          {
            "slug": "activity-type",
            "name": "Activity Type",
            "type": "select",
            "required": true,
            "options": {
              "choices": [
                {
                  "id": "call",
                  "name": "Call"
                },
                {
                  "id": "email",
                  "name": "Email"
                },
                {
                  "id": "meeting",
                  "name": "Meeting"
                },
                {
                  "id": "note",
                  "name": "Note"
                }
              ]
            }
          },
          {
            "slug": "activity-date",
            "name": "Activity Date",
            "type": "date",
            "required": true
          },
          {
            "slug": "summary",
            "name": "Summary",
            "type": "longtext",
            "required": true
          },
          {
            "slug": "next-follow-up-date",
            "name": "Next Follow-Up Date",
            "type": "date",
            "required": false
          },
          {
            "slug": "deal",
            "name": "Deal",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "deals",
              "multiple": false
            }
          }
        ],
        "views": [
          {
            "key": "activity-timeline",
            "name": "Activity Timeline",
            "type": "table",
            "config": {
              "visibleFieldSlugs": [
                "activity-subject",
                "activity-type",
                "company",
                "contact",
                "activity-date",
                "next-follow-up-date"
              ],
              "sorts": [
                {
                  "fieldSlug": "activity-date",
                  "direction": "desc"
                }
              ]
            },
            "viewId": ""
          },
          {
            "key": "follow-up-calendar",
            "name": "Follow-Up Calendar",
            "type": "calendar",
            "config": {
              "dateFieldSlug": "next-follow-up-date",
              "filters": [
                {
                  "fieldSlug": "next-follow-up-date",
                  "operator": "not_empty"
                }
              ]
            },
            "viewId": ""
          }
        ]
      },
      {
        "key": "deals",
        "name": "Deals",
        "slug": "b2b-crm-deals",
        "nodeId": "",
        "baseId": "",
        "readLimit": 50,
        "description": "Sales opportunities tracked from qualification through closed outcome.",
        "fields": [
          {
            "slug": "deal-name",
            "name": "Deal Name",
            "type": "text",
            "required": true
          },
          {
            "slug": "company",
            "name": "Company",
            "type": "relation",
            "required": true,
            "options": {
              "targetBaseSlug": "companies",
              "multiple": false
            }
          },
          {
            "slug": "primary-contact",
            "name": "Primary Contact",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "contacts",
              "multiple": false
            }
          },
          {
            "slug": "amount",
            "name": "Amount",
            "type": "number",
            "required": true,
            "options": {
              "number": {
                "format": "plain"
              }
            }
          },
          {
            "slug": "currency",
            "name": "Currency",
            "type": "select",
            "required": true,
            "options": {
              "choices": [
                {
                  "id": "usd",
                  "name": "USD"
                },
                {
                  "id": "eur",
                  "name": "EUR"
                },
                {
                  "id": "gbp",
                  "name": "GBP"
                }
              ]
            }
          },
          {
            "slug": "stage",
            "name": "Stage",
            "type": "select",
            "required": true,
            "options": {
              "choices": [
                {
                  "id": "qualification",
                  "name": "Qualification",
                  "color": "#64748b"
                },
                {
                  "id": "discovery",
                  "name": "Discovery",
                  "color": "#0f766e"
                },
                {
                  "id": "proposal",
                  "name": "Proposal",
                  "color": "#2563eb"
                },
                {
                  "id": "negotiation",
                  "name": "Negotiation",
                  "color": "#7c3aed"
                },
                {
                  "id": "closed-won",
                  "name": "Closed Won",
                  "color": "#15803d"
                },
                {
                  "id": "closed-lost",
                  "name": "Closed Lost",
                  "color": "#b91c1c"
                }
              ]
            }
          },
          {
            "slug": "expected-close-date",
            "name": "Expected Close Date",
            "type": "date",
            "required": false
          },
          {
            "slug": "next-step",
            "name": "Next Step",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "notes",
            "name": "Notes",
            "type": "longtext",
            "required": false
          }
        ],
        "views": [
          {
            "key": "sales-pipeline",
            "name": "Sales Pipeline",
            "type": "kanban",
            "config": {
              "stackByFieldSlug": "stage",
              "visibleFieldSlugs": [
                "deal-name",
                "company",
                "amount",
                "currency",
                "expected-close-date"
              ],
              "sorts": [
                {
                  "fieldSlug": "expected-close-date",
                  "direction": "asc"
                }
              ]
            },
            "viewId": ""
          },
          {
            "key": "deal-register",
            "name": "Deal Register",
            "type": "table",
            "config": {
              "visibleFieldSlugs": [
                "deal-name",
                "company",
                "primary-contact",
                "amount",
                "currency",
                "stage",
                "expected-close-date",
                "next-step"
              ],
              "sorts": [
                {
                  "fieldSlug": "expected-close-date",
                  "direction": "asc"
                }
              ]
            },
            "viewId": ""
          }
        ]
      }
    ],
    "relations": [
      {
        "source_base": "contacts",
        "field_slug": "company",
        "field_name": "Company",
        "target_base": "companies",
        "required": true,
        "multiple": false
      },
      {
        "source_base": "activities",
        "field_slug": "company",
        "field_name": "Company",
        "target_base": "companies",
        "required": true,
        "multiple": false
      },
      {
        "source_base": "activities",
        "field_slug": "contact",
        "field_name": "Contact",
        "target_base": "contacts",
        "required": false,
        "multiple": false
      },
      {
        "source_base": "activities",
        "field_slug": "deal",
        "field_name": "Deal",
        "target_base": "deals",
        "required": false,
        "multiple": false
      },
      {
        "source_base": "deals",
        "field_slug": "company",
        "field_name": "Company",
        "target_base": "companies",
        "required": true,
        "multiple": false
      },
      {
        "source_base": "deals",
        "field_slug": "primary-contact",
        "field_name": "Primary Contact",
        "target_base": "contacts",
        "required": false,
        "multiple": false
      }
    ],
    "docs": [],
    "drives": [],
    "whiteboards": [],
    "forms": [],
    "workflows": [],
    "html": [],
    "vaultRequirements": [],
    "integrations": []
  },
  "ui": {
    "primary_base": "companies",
    "summary": "Find the right account, understand the people involved, and capture the next follow-up.",
    "screens": [
      {
        "id": "overview",
        "name": "Overview",
        "purpose": "Review relationship momentum, pipeline movement, and today's follow-up priorities.",
        "data_sources": [
          "companies",
          "contacts",
          "activities",
          "deals"
        ]
      },
      {
        "id": "directory",
        "name": "Directory",
        "purpose": "Search and review companies and contacts.",
        "data_sources": [
          "companies",
          "contacts",
          "activities"
        ]
      },
      {
        "id": "activities",
        "name": "Activities",
        "purpose": "Review recent interactions and upcoming follow-ups.",
        "data_sources": [
          "activities",
          "companies",
          "contacts"
        ]
      },
      {
        "id": "pipeline",
        "name": "Pipeline",
        "purpose": "Track deals by stage, value, close date, and next step.",
        "data_sources": [
          "deals",
          "companies",
          "contacts",
          "activities"
        ]
      },
      {
        "id": "help-settings",
        "name": "Help & Settings",
        "purpose": "Show sanitized provider status, data budgets, and recovery guidance.",
        "data_sources": []
      }
    ],
    "attention_states": [
      "follow_up_due",
      "follow_up_upcoming",
      "missing_contact_channel"
    ],
    "actions": [
      {
        "id": "log-activity",
        "label": "Log Activity",
        "kind": "change_request",
        "base": "activities",
        "fields": [
          "activity-subject",
          "company",
          "contact",
          "activity-type",
          "activity-date",
          "summary",
          "next-follow-up-date",
          "deal"
        ]
      },
      {
        "id": "add-deal",
        "label": "Add Deal",
        "kind": "change_request",
        "base": "deals",
        "fields": [
          "deal-name",
          "company",
          "primary-contact",
          "amount",
          "currency",
          "stage",
          "expected-close-date",
          "next-step",
          "notes"
        ]
      },
      {
        "id": "request-stage-change",
        "label": "Request Stage Change",
        "kind": "change_request",
        "base": "deals",
        "fields": [
          "stage"
        ]
      }
    ]
  },
  "permissions": {
    "read_procedures": [
      "nodes.list",
      "nodes.get",
      "records.listPaged",
      "records.count",
      "records.search",
      "changeRequests.listPaged"
    ],
    "change_request_procedures": [
      "bases.createChangeRequest",
      "records.changeRequest"
    ]
  }
};
