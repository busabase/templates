export const appConfig = {
  "appId": "busa-office-admin",
  "appSlug": "busa-office-admin",
  "appName": "Administration Desk",
  "title": {
    "en": "Administration Desk",
    "zh-CN": "行政管理工作台"
  },
  "description": "Certificates, contracts, source documents and verification tasks in one administration desk.",
  "localizedDescription": {
    "en": "Certificates, contracts, source documents and verification tasks in one administration desk.",
    "zh-CN": "统一管理证照、合同、原件来源和待核验事项。"
  },
  "deployment": "cloud",
  "binding": "runtime",
  "readOnly": true,
  "schemaVersion": 1,
  "locale": "en",
  "brand": {
    "accent": "#176b5b"
  },
  "asOf": "2026-09-29",
  "folder": {
    "name": "Administration Desk / 行政管理工作台",
    "slug": "busa-office-admin",
    "description": "Certificates, contracts, source documents and verification tasks in one administration desk. / 统一管理证照、合同、原件来源和待核验事项。"
  },
  "airApp": {
    "name": "Administration Desk / 行政管理工作台",
    "slug": "busa-office-admin-app",
    "resourceKey": "busa-office-admin-app"
  },
  "bases": [
    {
      "key": "certificates",
      "name": "Certificates",
      "localizedName": {
        "en": "Certificates",
        "zh-CN": "证照台账"
      },
      "slug": "busa-office-admin-certificates",
      "description": "Track company certificates and verified expiry dates.",
      "localizedDescription": {
        "en": "Track company certificates and verified expiry dates.",
        "zh-CN": "跟踪公司证照与已核实的有效期。"
      },
      "readLimit": 50,
      "primary": "title",
      "secondary": [
        "entity",
        "owner",
        "expires"
      ],
      "status": "status",
      "attention": [
        "expiring",
        "unverified",
        "conflict"
      ],
      "date": "expires",
      "agentPrompts": [
        {
          "key": "scenario-1",
          "label": {
            "en": "Which certificates need renewal?",
            "zh-CN": "哪些证照需要续期？"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nWhich certificates need renewal?. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n哪些证照需要续期？。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        },
        {
          "key": "scenario-2",
          "label": {
            "en": "Draft a certificate verification checklist",
            "zh-CN": "拟定证照核验清单"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nDraft a certificate verification checklist. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n拟定证照核验清单。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        }
      ],
      "fields": [
        {
          "slug": "title",
          "name": "Certificate",
          "localizedName": {
            "en": "Certificate",
            "zh-CN": "证照名称"
          },
          "type": "text",
          "required": true,
          "position": 0,
          "options": {}
        },
        {
          "slug": "entity",
          "name": "Legal entity",
          "localizedName": {
            "en": "Legal entity",
            "zh-CN": "公司主体"
          },
          "type": "text",
          "required": false,
          "position": 1,
          "options": {}
        },
        {
          "slug": "owner",
          "name": "Owner",
          "localizedName": {
            "en": "Owner",
            "zh-CN": "负责人"
          },
          "type": "text",
          "required": false,
          "position": 2,
          "options": {}
        },
        {
          "slug": "issued",
          "name": "Issued on",
          "localizedName": {
            "en": "Issued on",
            "zh-CN": "签发日期"
          },
          "type": "date",
          "required": false,
          "position": 3,
          "options": {}
        },
        {
          "slug": "expires",
          "name": "Expires on",
          "localizedName": {
            "en": "Expires on",
            "zh-CN": "到期日期"
          },
          "type": "date",
          "required": false,
          "position": 4,
          "options": {}
        },
        {
          "slug": "status",
          "name": "Verification status",
          "localizedName": {
            "en": "Verification status",
            "zh-CN": "核验状态"
          },
          "type": "select",
          "required": false,
          "position": 5,
          "options": {
            "choices": [
              {
                "id": "verified",
                "name": "Verified",
                "localizedName": {
                  "en": "Verified",
                  "zh-CN": "已核验"
                }
              },
              {
                "id": "expiring",
                "name": "Renewal due",
                "localizedName": {
                  "en": "Renewal due",
                  "zh-CN": "待续期"
                }
              },
              {
                "id": "unverified",
                "name": "Unverified",
                "localizedName": {
                  "en": "Unverified",
                  "zh-CN": "未核验"
                }
              },
              {
                "id": "conflict",
                "name": "Evidence conflict",
                "localizedName": {
                  "en": "Evidence conflict",
                  "zh-CN": "证据冲突"
                }
              }
            ]
          }
        },
        {
          "slug": "source-ref",
          "name": "Source reference",
          "localizedName": {
            "en": "Source reference",
            "zh-CN": "原件业务编号"
          },
          "type": "text",
          "required": false,
          "position": 6,
          "options": {}
        },
        {
          "slug": "notes",
          "name": "Evidence notes",
          "localizedName": {
            "en": "Evidence notes",
            "zh-CN": "核验说明"
          },
          "type": "longtext",
          "required": false,
          "position": 7,
          "options": {}
        }
      ],
      "views": [
        {
          "slug": "all",
          "name": "Certificates / 证照台账",
          "description": "Track company certificates and verified expiry dates. / 跟踪公司证照与已核实的有效期。",
          "type": "table",
          "config": {
            "filters": [],
            "sorts": [
              {
                "fieldSlug": "expires",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "entity",
              "owner",
              "expires",
              "status"
            ]
          }
        },
        {
          "slug": "review",
          "name": "Priority queue / 优先处理",
          "description": "Focus on the expiring state / 聚焦 待续期状态",
          "type": "table",
          "config": {
            "filters": [
              {
                "fieldSlug": "status",
                "operator": "equals",
                "value": "expiring"
              }
            ],
            "sorts": [
              {
                "fieldSlug": "expires",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "entity",
              "owner",
              "expires",
              "status"
            ]
          }
        }
      ]
    },
    {
      "key": "contracts",
      "name": "Administrative contracts",
      "localizedName": {
        "en": "Administrative contracts",
        "zh-CN": "行政合同"
      },
      "slug": "busa-office-admin-contracts",
      "description": "Track office supplier agreements, signatures and renewal responsibilities.",
      "localizedDescription": {
        "en": "Track office supplier agreements, signatures and renewal responsibilities.",
        "zh-CN": "跟踪办公供应商合同、签署与续期责任。"
      },
      "readLimit": 50,
      "primary": "title",
      "secondary": [
        "counterparty",
        "owner",
        "expires"
      ],
      "status": "status",
      "attention": [
        "renewal",
        "review"
      ],
      "date": "expires",
      "agentPrompts": [
        {
          "key": "scenario-1",
          "label": {
            "en": "Prepare the next contract renewal agenda",
            "zh-CN": "整理下一轮合同续期议程"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nPrepare the next contract renewal agenda. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n整理下一轮合同续期议程。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        },
        {
          "key": "scenario-2",
          "label": {
            "en": "List contracts still waiting for signature",
            "zh-CN": "列出仍待签署的合同"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nList contracts still waiting for signature. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n列出仍待签署的合同。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        }
      ],
      "fields": [
        {
          "slug": "title",
          "name": "Agreement",
          "localizedName": {
            "en": "Agreement",
            "zh-CN": "合同名称"
          },
          "type": "text",
          "required": true,
          "position": 0,
          "options": {}
        },
        {
          "slug": "counterparty",
          "name": "Counterparty",
          "localizedName": {
            "en": "Counterparty",
            "zh-CN": "对方主体"
          },
          "type": "text",
          "required": false,
          "position": 1,
          "options": {}
        },
        {
          "slug": "entity",
          "name": "Legal entity",
          "localizedName": {
            "en": "Legal entity",
            "zh-CN": "公司主体"
          },
          "type": "text",
          "required": false,
          "position": 2,
          "options": {}
        },
        {
          "slug": "owner",
          "name": "Owner",
          "localizedName": {
            "en": "Owner",
            "zh-CN": "负责人"
          },
          "type": "text",
          "required": false,
          "position": 3,
          "options": {}
        },
        {
          "slug": "expires",
          "name": "Ends on",
          "localizedName": {
            "en": "Ends on",
            "zh-CN": "合同到期"
          },
          "type": "date",
          "required": false,
          "position": 4,
          "options": {}
        },
        {
          "slug": "status",
          "name": "Contract status",
          "localizedName": {
            "en": "Contract status",
            "zh-CN": "合同状态"
          },
          "type": "select",
          "required": false,
          "position": 5,
          "options": {
            "choices": [
              {
                "id": "signed",
                "name": "Signed",
                "localizedName": {
                  "en": "Signed",
                  "zh-CN": "已签署"
                }
              },
              {
                "id": "renewal",
                "name": "Renewal due",
                "localizedName": {
                  "en": "Renewal due",
                  "zh-CN": "待续约"
                }
              },
              {
                "id": "review",
                "name": "Signature pending",
                "localizedName": {
                  "en": "Signature pending",
                  "zh-CN": "待签署"
                }
              },
              {
                "id": "archived",
                "name": "Archived",
                "localizedName": {
                  "en": "Archived",
                  "zh-CN": "已归档"
                }
              }
            ]
          }
        },
        {
          "slug": "source-ref",
          "name": "Source reference",
          "localizedName": {
            "en": "Source reference",
            "zh-CN": "原件业务编号"
          },
          "type": "text",
          "required": false,
          "position": 6,
          "options": {}
        },
        {
          "slug": "notes",
          "name": "Review notes",
          "localizedName": {
            "en": "Review notes",
            "zh-CN": "审阅说明"
          },
          "type": "longtext",
          "required": false,
          "position": 7,
          "options": {}
        }
      ],
      "views": [
        {
          "slug": "all",
          "name": "Administrative contracts / 行政合同",
          "description": "Track office supplier agreements, signatures and renewal responsibilities. / 跟踪办公供应商合同、签署与续期责任。",
          "type": "table",
          "config": {
            "filters": [],
            "sorts": [
              {
                "fieldSlug": "expires",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "counterparty",
              "owner",
              "expires",
              "status"
            ]
          }
        },
        {
          "slug": "review",
          "name": "Priority queue / 优先处理",
          "description": "Focus on the renewal state / 聚焦 待续约状态",
          "type": "table",
          "config": {
            "filters": [
              {
                "fieldSlug": "status",
                "operator": "equals",
                "value": "renewal"
              }
            ],
            "sorts": [
              {
                "fieldSlug": "expires",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "counterparty",
              "owner",
              "expires",
              "status"
            ]
          }
        }
      ]
    },
    {
      "key": "sources",
      "name": "Source archive",
      "localizedName": {
        "en": "Source archive",
        "zh-CN": "原件来源台账"
      },
      "slug": "busa-office-admin-sources",
      "description": "Record original-document provenance without exposing private document content.",
      "localizedDescription": {
        "en": "Record original-document provenance without exposing private document content.",
        "zh-CN": "记录原件来源，避免在公开模板泄露文件内容。"
      },
      "readLimit": 50,
      "primary": "title",
      "secondary": [
        "source-ref",
        "custodian",
        "received"
      ],
      "status": "status",
      "attention": [
        "copy-only",
        "conflict"
      ],
      "date": "received",
      "agentPrompts": [
        {
          "key": "scenario-1",
          "label": {
            "en": "Which sources still need an original?",
            "zh-CN": "哪些来源仍需补原件？"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nWhich sources still need an original?. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n哪些来源仍需补原件？。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        },
        {
          "key": "scenario-2",
          "label": {
            "en": "Trace the conflicting occupancy evidence",
            "zh-CN": "追溯场地证明的冲突证据"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nTrace the conflicting occupancy evidence. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n追溯场地证明的冲突证据。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        }
      ],
      "fields": [
        {
          "slug": "title",
          "name": "Document",
          "localizedName": {
            "en": "Document",
            "zh-CN": "原件名称"
          },
          "type": "text",
          "required": true,
          "position": 0,
          "options": {}
        },
        {
          "slug": "source-ref",
          "name": "Business reference",
          "localizedName": {
            "en": "Business reference",
            "zh-CN": "业务编号"
          },
          "type": "text",
          "required": false,
          "position": 1,
          "options": {}
        },
        {
          "slug": "custodian",
          "name": "Custodian",
          "localizedName": {
            "en": "Custodian",
            "zh-CN": "保管人"
          },
          "type": "text",
          "required": false,
          "position": 2,
          "options": {}
        },
        {
          "slug": "received",
          "name": "Received on",
          "localizedName": {
            "en": "Received on",
            "zh-CN": "收件日期"
          },
          "type": "date",
          "required": false,
          "position": 3,
          "options": {}
        },
        {
          "slug": "location",
          "name": "Archive location",
          "localizedName": {
            "en": "Archive location",
            "zh-CN": "归档位置"
          },
          "type": "text",
          "required": false,
          "position": 4,
          "options": {}
        },
        {
          "slug": "status",
          "name": "Evidence status",
          "localizedName": {
            "en": "Evidence status",
            "zh-CN": "证据状态"
          },
          "type": "select",
          "required": false,
          "position": 5,
          "options": {
            "choices": [
              {
                "id": "original",
                "name": "Original checked",
                "localizedName": {
                  "en": "Original checked",
                  "zh-CN": "已核对原件"
                }
              },
              {
                "id": "copy-only",
                "name": "Copy only",
                "localizedName": {
                  "en": "Copy only",
                  "zh-CN": "仅复印件"
                }
              },
              {
                "id": "conflict",
                "name": "Versions conflict",
                "localizedName": {
                  "en": "Versions conflict",
                  "zh-CN": "版本冲突"
                }
              }
            ]
          }
        },
        {
          "slug": "notes",
          "name": "Provenance notes",
          "localizedName": {
            "en": "Provenance notes",
            "zh-CN": "来源说明"
          },
          "type": "longtext",
          "required": false,
          "position": 6,
          "options": {}
        }
      ],
      "views": [
        {
          "slug": "all",
          "name": "Source archive / 原件来源台账",
          "description": "Record original-document provenance without exposing private document content. / 记录原件来源，避免在公开模板泄露文件内容。",
          "type": "table",
          "config": {
            "filters": [],
            "sorts": [
              {
                "fieldSlug": "received",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "source-ref",
              "custodian",
              "received",
              "status"
            ]
          }
        },
        {
          "slug": "review",
          "name": "Priority queue / 优先处理",
          "description": "Focus on the copy-only state / 聚焦 仅复印件状态",
          "type": "table",
          "config": {
            "filters": [
              {
                "fieldSlug": "status",
                "operator": "equals",
                "value": "copy-only"
              }
            ],
            "sorts": [
              {
                "fieldSlug": "received",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "source-ref",
              "custodian",
              "received",
              "status"
            ]
          }
        }
      ]
    },
    {
      "key": "checks",
      "name": "Verification tasks",
      "localizedName": {
        "en": "Verification tasks",
        "zh-CN": "核验待办"
      },
      "slug": "busa-office-admin-checks",
      "description": "Assign evidence checks and renewal follow-up with accountable owners.",
      "localizedDescription": {
        "en": "Assign evidence checks and renewal follow-up with accountable owners.",
        "zh-CN": "落实证据核验与续期跟进责任。"
      },
      "readLimit": 50,
      "primary": "title",
      "secondary": [
        "source-ref",
        "owner",
        "due"
      ],
      "status": "status",
      "attention": [
        "open",
        "blocked"
      ],
      "date": "due",
      "agentPrompts": [
        {
          "key": "scenario-1",
          "label": {
            "en": "Prepare this week's verification priorities",
            "zh-CN": "整理本周核验优先级"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nPrepare this week's verification priorities. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n整理本周核验优先级。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        },
        {
          "key": "scenario-2",
          "label": {
            "en": "Draft an owner follow-up for blocked checks",
            "zh-CN": "为受阻核验拟定负责人跟进安排"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nDraft an owner follow-up for blocked checks. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n为受阻核验拟定负责人跟进安排。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        }
      ],
      "fields": [
        {
          "slug": "title",
          "name": "Task",
          "localizedName": {
            "en": "Task",
            "zh-CN": "待办事项"
          },
          "type": "text",
          "required": true,
          "position": 0,
          "options": {}
        },
        {
          "slug": "source-ref",
          "name": "Evidence reference",
          "localizedName": {
            "en": "Evidence reference",
            "zh-CN": "证据业务编号"
          },
          "type": "text",
          "required": false,
          "position": 1,
          "options": {}
        },
        {
          "slug": "owner",
          "name": "Owner",
          "localizedName": {
            "en": "Owner",
            "zh-CN": "负责人"
          },
          "type": "text",
          "required": false,
          "position": 2,
          "options": {}
        },
        {
          "slug": "due",
          "name": "Due on",
          "localizedName": {
            "en": "Due on",
            "zh-CN": "截止日期"
          },
          "type": "date",
          "required": false,
          "position": 3,
          "options": {}
        },
        {
          "slug": "status",
          "name": "Task status",
          "localizedName": {
            "en": "Task status",
            "zh-CN": "待办状态"
          },
          "type": "select",
          "required": false,
          "position": 4,
          "options": {
            "choices": [
              {
                "id": "open",
                "name": "Open",
                "localizedName": {
                  "en": "Open",
                  "zh-CN": "待处理"
                }
              },
              {
                "id": "blocked",
                "name": "Blocked",
                "localizedName": {
                  "en": "Blocked",
                  "zh-CN": "受阻"
                }
              },
              {
                "id": "completed",
                "name": "Completed",
                "localizedName": {
                  "en": "Completed",
                  "zh-CN": "已完成"
                }
              }
            ]
          }
        },
        {
          "slug": "notes",
          "name": "Next step",
          "localizedName": {
            "en": "Next step",
            "zh-CN": "下一步"
          },
          "type": "longtext",
          "required": false,
          "position": 5,
          "options": {}
        }
      ],
      "views": [
        {
          "slug": "all",
          "name": "Verification tasks / 核验待办",
          "description": "Assign evidence checks and renewal follow-up with accountable owners. / 落实证据核验与续期跟进责任。",
          "type": "table",
          "config": {
            "filters": [],
            "sorts": [
              {
                "fieldSlug": "due",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "source-ref",
              "owner",
              "due",
              "status"
            ]
          }
        },
        {
          "slug": "review",
          "name": "Priority queue / 优先处理",
          "description": "Focus on the open state / 聚焦 待处理状态",
          "type": "table",
          "config": {
            "filters": [
              {
                "fieldSlug": "status",
                "operator": "equals",
                "value": "open"
              }
            ],
            "sorts": [
              {
                "fieldSlug": "due",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "source-ref",
              "owner",
              "due",
              "status"
            ]
          }
        }
      ]
    }
  ],
  "schema": {
    "bases": [
      {
        "key": "certificates",
        "name": "Certificates",
        "localizedName": {
          "en": "Certificates",
          "zh-CN": "证照台账"
        },
        "slug": "busa-office-admin-certificates",
        "description": "Track company certificates and verified expiry dates.",
        "localizedDescription": {
          "en": "Track company certificates and verified expiry dates.",
          "zh-CN": "跟踪公司证照与已核实的有效期。"
        },
        "readLimit": 50,
        "primary": "title",
        "secondary": [
          "entity",
          "owner",
          "expires"
        ],
        "status": "status",
        "attention": [
          "expiring",
          "unverified",
          "conflict"
        ],
        "date": "expires",
        "agentPrompts": [
          {
            "key": "scenario-1",
            "label": {
              "en": "Which certificates need renewal?",
              "zh-CN": "哪些证照需要续期？"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nWhich certificates need renewal?. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n哪些证照需要续期？。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          },
          {
            "key": "scenario-2",
            "label": {
              "en": "Draft a certificate verification checklist",
              "zh-CN": "拟定证照核验清单"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nDraft a certificate verification checklist. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n拟定证照核验清单。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          }
        ],
        "fields": [
          {
            "slug": "title",
            "name": "Certificate",
            "localizedName": {
              "en": "Certificate",
              "zh-CN": "证照名称"
            },
            "type": "text",
            "required": true,
            "position": 0,
            "options": {}
          },
          {
            "slug": "entity",
            "name": "Legal entity",
            "localizedName": {
              "en": "Legal entity",
              "zh-CN": "公司主体"
            },
            "type": "text",
            "required": false,
            "position": 1,
            "options": {}
          },
          {
            "slug": "owner",
            "name": "Owner",
            "localizedName": {
              "en": "Owner",
              "zh-CN": "负责人"
            },
            "type": "text",
            "required": false,
            "position": 2,
            "options": {}
          },
          {
            "slug": "issued",
            "name": "Issued on",
            "localizedName": {
              "en": "Issued on",
              "zh-CN": "签发日期"
            },
            "type": "date",
            "required": false,
            "position": 3,
            "options": {}
          },
          {
            "slug": "expires",
            "name": "Expires on",
            "localizedName": {
              "en": "Expires on",
              "zh-CN": "到期日期"
            },
            "type": "date",
            "required": false,
            "position": 4,
            "options": {}
          },
          {
            "slug": "status",
            "name": "Verification status",
            "localizedName": {
              "en": "Verification status",
              "zh-CN": "核验状态"
            },
            "type": "select",
            "required": false,
            "position": 5,
            "options": {
              "choices": [
                {
                  "id": "verified",
                  "name": "Verified",
                  "localizedName": {
                    "en": "Verified",
                    "zh-CN": "已核验"
                  }
                },
                {
                  "id": "expiring",
                  "name": "Renewal due",
                  "localizedName": {
                    "en": "Renewal due",
                    "zh-CN": "待续期"
                  }
                },
                {
                  "id": "unverified",
                  "name": "Unverified",
                  "localizedName": {
                    "en": "Unverified",
                    "zh-CN": "未核验"
                  }
                },
                {
                  "id": "conflict",
                  "name": "Evidence conflict",
                  "localizedName": {
                    "en": "Evidence conflict",
                    "zh-CN": "证据冲突"
                  }
                }
              ]
            }
          },
          {
            "slug": "source-ref",
            "name": "Source reference",
            "localizedName": {
              "en": "Source reference",
              "zh-CN": "原件业务编号"
            },
            "type": "text",
            "required": false,
            "position": 6,
            "options": {}
          },
          {
            "slug": "notes",
            "name": "Evidence notes",
            "localizedName": {
              "en": "Evidence notes",
              "zh-CN": "核验说明"
            },
            "type": "longtext",
            "required": false,
            "position": 7,
            "options": {}
          }
        ],
        "views": [
          {
            "slug": "all",
            "name": "Certificates / 证照台账",
            "description": "Track company certificates and verified expiry dates. / 跟踪公司证照与已核实的有效期。",
            "type": "table",
            "config": {
              "filters": [],
              "sorts": [
                {
                  "fieldSlug": "expires",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "entity",
                "owner",
                "expires",
                "status"
              ]
            }
          },
          {
            "slug": "review",
            "name": "Priority queue / 优先处理",
            "description": "Focus on the expiring state / 聚焦 待续期状态",
            "type": "table",
            "config": {
              "filters": [
                {
                  "fieldSlug": "status",
                  "operator": "equals",
                  "value": "expiring"
                }
              ],
              "sorts": [
                {
                  "fieldSlug": "expires",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "entity",
                "owner",
                "expires",
                "status"
              ]
            }
          }
        ]
      },
      {
        "key": "contracts",
        "name": "Administrative contracts",
        "localizedName": {
          "en": "Administrative contracts",
          "zh-CN": "行政合同"
        },
        "slug": "busa-office-admin-contracts",
        "description": "Track office supplier agreements, signatures and renewal responsibilities.",
        "localizedDescription": {
          "en": "Track office supplier agreements, signatures and renewal responsibilities.",
          "zh-CN": "跟踪办公供应商合同、签署与续期责任。"
        },
        "readLimit": 50,
        "primary": "title",
        "secondary": [
          "counterparty",
          "owner",
          "expires"
        ],
        "status": "status",
        "attention": [
          "renewal",
          "review"
        ],
        "date": "expires",
        "agentPrompts": [
          {
            "key": "scenario-1",
            "label": {
              "en": "Prepare the next contract renewal agenda",
              "zh-CN": "整理下一轮合同续期议程"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nPrepare the next contract renewal agenda. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n整理下一轮合同续期议程。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          },
          {
            "key": "scenario-2",
            "label": {
              "en": "List contracts still waiting for signature",
              "zh-CN": "列出仍待签署的合同"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nList contracts still waiting for signature. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n列出仍待签署的合同。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          }
        ],
        "fields": [
          {
            "slug": "title",
            "name": "Agreement",
            "localizedName": {
              "en": "Agreement",
              "zh-CN": "合同名称"
            },
            "type": "text",
            "required": true,
            "position": 0,
            "options": {}
          },
          {
            "slug": "counterparty",
            "name": "Counterparty",
            "localizedName": {
              "en": "Counterparty",
              "zh-CN": "对方主体"
            },
            "type": "text",
            "required": false,
            "position": 1,
            "options": {}
          },
          {
            "slug": "entity",
            "name": "Legal entity",
            "localizedName": {
              "en": "Legal entity",
              "zh-CN": "公司主体"
            },
            "type": "text",
            "required": false,
            "position": 2,
            "options": {}
          },
          {
            "slug": "owner",
            "name": "Owner",
            "localizedName": {
              "en": "Owner",
              "zh-CN": "负责人"
            },
            "type": "text",
            "required": false,
            "position": 3,
            "options": {}
          },
          {
            "slug": "expires",
            "name": "Ends on",
            "localizedName": {
              "en": "Ends on",
              "zh-CN": "合同到期"
            },
            "type": "date",
            "required": false,
            "position": 4,
            "options": {}
          },
          {
            "slug": "status",
            "name": "Contract status",
            "localizedName": {
              "en": "Contract status",
              "zh-CN": "合同状态"
            },
            "type": "select",
            "required": false,
            "position": 5,
            "options": {
              "choices": [
                {
                  "id": "signed",
                  "name": "Signed",
                  "localizedName": {
                    "en": "Signed",
                    "zh-CN": "已签署"
                  }
                },
                {
                  "id": "renewal",
                  "name": "Renewal due",
                  "localizedName": {
                    "en": "Renewal due",
                    "zh-CN": "待续约"
                  }
                },
                {
                  "id": "review",
                  "name": "Signature pending",
                  "localizedName": {
                    "en": "Signature pending",
                    "zh-CN": "待签署"
                  }
                },
                {
                  "id": "archived",
                  "name": "Archived",
                  "localizedName": {
                    "en": "Archived",
                    "zh-CN": "已归档"
                  }
                }
              ]
            }
          },
          {
            "slug": "source-ref",
            "name": "Source reference",
            "localizedName": {
              "en": "Source reference",
              "zh-CN": "原件业务编号"
            },
            "type": "text",
            "required": false,
            "position": 6,
            "options": {}
          },
          {
            "slug": "notes",
            "name": "Review notes",
            "localizedName": {
              "en": "Review notes",
              "zh-CN": "审阅说明"
            },
            "type": "longtext",
            "required": false,
            "position": 7,
            "options": {}
          }
        ],
        "views": [
          {
            "slug": "all",
            "name": "Administrative contracts / 行政合同",
            "description": "Track office supplier agreements, signatures and renewal responsibilities. / 跟踪办公供应商合同、签署与续期责任。",
            "type": "table",
            "config": {
              "filters": [],
              "sorts": [
                {
                  "fieldSlug": "expires",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "counterparty",
                "owner",
                "expires",
                "status"
              ]
            }
          },
          {
            "slug": "review",
            "name": "Priority queue / 优先处理",
            "description": "Focus on the renewal state / 聚焦 待续约状态",
            "type": "table",
            "config": {
              "filters": [
                {
                  "fieldSlug": "status",
                  "operator": "equals",
                  "value": "renewal"
                }
              ],
              "sorts": [
                {
                  "fieldSlug": "expires",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "counterparty",
                "owner",
                "expires",
                "status"
              ]
            }
          }
        ]
      },
      {
        "key": "sources",
        "name": "Source archive",
        "localizedName": {
          "en": "Source archive",
          "zh-CN": "原件来源台账"
        },
        "slug": "busa-office-admin-sources",
        "description": "Record original-document provenance without exposing private document content.",
        "localizedDescription": {
          "en": "Record original-document provenance without exposing private document content.",
          "zh-CN": "记录原件来源，避免在公开模板泄露文件内容。"
        },
        "readLimit": 50,
        "primary": "title",
        "secondary": [
          "source-ref",
          "custodian",
          "received"
        ],
        "status": "status",
        "attention": [
          "copy-only",
          "conflict"
        ],
        "date": "received",
        "agentPrompts": [
          {
            "key": "scenario-1",
            "label": {
              "en": "Which sources still need an original?",
              "zh-CN": "哪些来源仍需补原件？"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nWhich sources still need an original?. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n哪些来源仍需补原件？。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          },
          {
            "key": "scenario-2",
            "label": {
              "en": "Trace the conflicting occupancy evidence",
              "zh-CN": "追溯场地证明的冲突证据"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nTrace the conflicting occupancy evidence. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n追溯场地证明的冲突证据。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          }
        ],
        "fields": [
          {
            "slug": "title",
            "name": "Document",
            "localizedName": {
              "en": "Document",
              "zh-CN": "原件名称"
            },
            "type": "text",
            "required": true,
            "position": 0,
            "options": {}
          },
          {
            "slug": "source-ref",
            "name": "Business reference",
            "localizedName": {
              "en": "Business reference",
              "zh-CN": "业务编号"
            },
            "type": "text",
            "required": false,
            "position": 1,
            "options": {}
          },
          {
            "slug": "custodian",
            "name": "Custodian",
            "localizedName": {
              "en": "Custodian",
              "zh-CN": "保管人"
            },
            "type": "text",
            "required": false,
            "position": 2,
            "options": {}
          },
          {
            "slug": "received",
            "name": "Received on",
            "localizedName": {
              "en": "Received on",
              "zh-CN": "收件日期"
            },
            "type": "date",
            "required": false,
            "position": 3,
            "options": {}
          },
          {
            "slug": "location",
            "name": "Archive location",
            "localizedName": {
              "en": "Archive location",
              "zh-CN": "归档位置"
            },
            "type": "text",
            "required": false,
            "position": 4,
            "options": {}
          },
          {
            "slug": "status",
            "name": "Evidence status",
            "localizedName": {
              "en": "Evidence status",
              "zh-CN": "证据状态"
            },
            "type": "select",
            "required": false,
            "position": 5,
            "options": {
              "choices": [
                {
                  "id": "original",
                  "name": "Original checked",
                  "localizedName": {
                    "en": "Original checked",
                    "zh-CN": "已核对原件"
                  }
                },
                {
                  "id": "copy-only",
                  "name": "Copy only",
                  "localizedName": {
                    "en": "Copy only",
                    "zh-CN": "仅复印件"
                  }
                },
                {
                  "id": "conflict",
                  "name": "Versions conflict",
                  "localizedName": {
                    "en": "Versions conflict",
                    "zh-CN": "版本冲突"
                  }
                }
              ]
            }
          },
          {
            "slug": "notes",
            "name": "Provenance notes",
            "localizedName": {
              "en": "Provenance notes",
              "zh-CN": "来源说明"
            },
            "type": "longtext",
            "required": false,
            "position": 6,
            "options": {}
          }
        ],
        "views": [
          {
            "slug": "all",
            "name": "Source archive / 原件来源台账",
            "description": "Record original-document provenance without exposing private document content. / 记录原件来源，避免在公开模板泄露文件内容。",
            "type": "table",
            "config": {
              "filters": [],
              "sorts": [
                {
                  "fieldSlug": "received",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "source-ref",
                "custodian",
                "received",
                "status"
              ]
            }
          },
          {
            "slug": "review",
            "name": "Priority queue / 优先处理",
            "description": "Focus on the copy-only state / 聚焦 仅复印件状态",
            "type": "table",
            "config": {
              "filters": [
                {
                  "fieldSlug": "status",
                  "operator": "equals",
                  "value": "copy-only"
                }
              ],
              "sorts": [
                {
                  "fieldSlug": "received",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "source-ref",
                "custodian",
                "received",
                "status"
              ]
            }
          }
        ]
      },
      {
        "key": "checks",
        "name": "Verification tasks",
        "localizedName": {
          "en": "Verification tasks",
          "zh-CN": "核验待办"
        },
        "slug": "busa-office-admin-checks",
        "description": "Assign evidence checks and renewal follow-up with accountable owners.",
        "localizedDescription": {
          "en": "Assign evidence checks and renewal follow-up with accountable owners.",
          "zh-CN": "落实证据核验与续期跟进责任。"
        },
        "readLimit": 50,
        "primary": "title",
        "secondary": [
          "source-ref",
          "owner",
          "due"
        ],
        "status": "status",
        "attention": [
          "open",
          "blocked"
        ],
        "date": "due",
        "agentPrompts": [
          {
            "key": "scenario-1",
            "label": {
              "en": "Prepare this week's verification priorities",
              "zh-CN": "整理本周核验优先级"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nPrepare this week's verification priorities. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n整理本周核验优先级。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          },
          {
            "key": "scenario-2",
            "label": {
              "en": "Draft an owner follow-up for blocked checks",
              "zh-CN": "为受阻核验拟定负责人跟进安排"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-admin skill in this folder and follow its workflow.\n\n{target}\n\nDraft an owner follow-up for blocked checks. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-admin Skill，遵循其流程。\n\n{target}\n\n为受阻核验拟定负责人跟进安排。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          }
        ],
        "fields": [
          {
            "slug": "title",
            "name": "Task",
            "localizedName": {
              "en": "Task",
              "zh-CN": "待办事项"
            },
            "type": "text",
            "required": true,
            "position": 0,
            "options": {}
          },
          {
            "slug": "source-ref",
            "name": "Evidence reference",
            "localizedName": {
              "en": "Evidence reference",
              "zh-CN": "证据业务编号"
            },
            "type": "text",
            "required": false,
            "position": 1,
            "options": {}
          },
          {
            "slug": "owner",
            "name": "Owner",
            "localizedName": {
              "en": "Owner",
              "zh-CN": "负责人"
            },
            "type": "text",
            "required": false,
            "position": 2,
            "options": {}
          },
          {
            "slug": "due",
            "name": "Due on",
            "localizedName": {
              "en": "Due on",
              "zh-CN": "截止日期"
            },
            "type": "date",
            "required": false,
            "position": 3,
            "options": {}
          },
          {
            "slug": "status",
            "name": "Task status",
            "localizedName": {
              "en": "Task status",
              "zh-CN": "待办状态"
            },
            "type": "select",
            "required": false,
            "position": 4,
            "options": {
              "choices": [
                {
                  "id": "open",
                  "name": "Open",
                  "localizedName": {
                    "en": "Open",
                    "zh-CN": "待处理"
                  }
                },
                {
                  "id": "blocked",
                  "name": "Blocked",
                  "localizedName": {
                    "en": "Blocked",
                    "zh-CN": "受阻"
                  }
                },
                {
                  "id": "completed",
                  "name": "Completed",
                  "localizedName": {
                    "en": "Completed",
                    "zh-CN": "已完成"
                  }
                }
              ]
            }
          },
          {
            "slug": "notes",
            "name": "Next step",
            "localizedName": {
              "en": "Next step",
              "zh-CN": "下一步"
            },
            "type": "longtext",
            "required": false,
            "position": 5,
            "options": {}
          }
        ],
        "views": [
          {
            "slug": "all",
            "name": "Verification tasks / 核验待办",
            "description": "Assign evidence checks and renewal follow-up with accountable owners. / 落实证据核验与续期跟进责任。",
            "type": "table",
            "config": {
              "filters": [],
              "sorts": [
                {
                  "fieldSlug": "due",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "source-ref",
                "owner",
                "due",
                "status"
              ]
            }
          },
          {
            "slug": "review",
            "name": "Priority queue / 优先处理",
            "description": "Focus on the open state / 聚焦 待处理状态",
            "type": "table",
            "config": {
              "filters": [
                {
                  "fieldSlug": "status",
                  "operator": "equals",
                  "value": "open"
                }
              ],
              "sorts": [
                {
                  "fieldSlug": "due",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "source-ref",
                "owner",
                "due",
                "status"
              ]
            }
          }
        ]
      }
    ]
  },
  "permissions": {
    "readProcedures": [
      "nodes.list",
      "nodes.get",
      "bases.get",
      "records.list",
      "records.count"
    ],
    "setupProcedures": [],
    "change_request_procedures": []
  },
  "onboarding": {
    "version": 0,
    "fields": [],
    "rationale": "No integration or setup required; installed Bases are the workflow. / 无需集成或额外设置；业务流程使用安装后的台账。"
  },
  "ui": {
    "summary": {
      "en": "Renewals and evidence checks",
      "zh-CN": "续期与证据核验"
    },
    "primary_base": "certificates"
  },
  "boundary": {
    "en": "Never replace conflicting dates with a guess. Preserve both sources and ask the owner to verify the original. Do not represent an unsigned contract or unverified certificate as approved. Draft record changes through ChangeRequests; no legal or regulatory conclusions, government submissions, or external sending.",
    "zh-CN": "日期证据冲突时保留双方原始说法，要求负责人核对原件，不猜测有效期。未签合同和未核实证照不得标为已批准。记录修改通过变更申请；不代作法律或监管结论，不向政府或外部发送资料。"
  },
  "demoRecords": [
    {
      "id": "recdemo000000000000",
      "baseKey": "certificates",
      "fields": {
        "title": "Business registration / 营业登记",
        "entity": "Harbor Studio / 海港工作室",
        "owner": "Maya Lin / 林雅",
        "issued": "2024-04-15",
        "expires": "2029-04-14",
        "status": "verified",
        "source-ref": "SRC-101",
        "notes": "Registration scan checked against the issued original. / 已核对登记原件。"
      }
    },
    {
      "id": "recdemo000000000001",
      "baseKey": "certificates",
      "fields": {
        "title": "Office fire inspection / 消防检查",
        "entity": "Harbor Studio / 海港工作室",
        "owner": "Owen Chen / 陈欧文",
        "issued": "2025-10-20",
        "expires": "2026-10-19",
        "status": "expiring",
        "source-ref": "SRC-102",
        "notes": "Book a renewal inspection; no appointment confirmed. / 需预约续检，尚未确认。"
      }
    },
    {
      "id": "recdemo000000000002",
      "baseKey": "certificates",
      "fields": {
        "title": "Service permit / 服务许可",
        "entity": "Northwind Services / 北风服务",
        "owner": "Maya Lin / 林雅",
        "issued": "2025-06-01",
        "expires": "2027-05-31",
        "status": "unverified",
        "source-ref": "SRC-103",
        "notes": "Only a copy is available; verify the original and issuing authority. / 目前仅有复印件，需核对原件与签发机构。"
      }
    },
    {
      "id": "recdemo000000000003",
      "baseKey": "certificates",
      "fields": {
        "title": "Premises occupancy / 场地使用证明",
        "entity": "Northwind Services / 北风服务",
        "owner": "Owen Chen / 陈欧文",
        "issued": "2024-11-01",
        "expires": "2026-10-31",
        "status": "conflict",
        "source-ref": "SRC-104",
        "notes": "Archive summary says 2026-10-31; original cover says 2027-10-31. Neither date is confirmed. / 汇总为 2026-10-31，封面为 2027-10-31，两者均待确认。"
      }
    },
    {
      "id": "recdemo000001000000",
      "baseKey": "contracts",
      "fields": {
        "title": "Workspace lease / 办公租赁",
        "counterparty": "Riverwalk Properties / 河畔物业",
        "entity": "Harbor Studio / 海港工作室",
        "owner": "Maya Lin / 林雅",
        "expires": "2026-11-30",
        "status": "renewal",
        "source-ref": "SRC-201",
        "notes": "Confirm renewal terms before 31 October. / 10 月底前确认续约条款。"
      }
    },
    {
      "id": "recdemo000001000001",
      "baseKey": "contracts",
      "fields": {
        "title": "Cleaning services / 保洁服务",
        "counterparty": "Bright Facilities / 明洁服务",
        "entity": "Harbor Studio / 海港工作室",
        "owner": "Owen Chen / 陈欧文",
        "expires": "2027-03-31",
        "status": "signed",
        "source-ref": "SRC-202",
        "notes": "Signed copy received; monthly service review. / 已收签字件，按月检查服务。"
      }
    },
    {
      "id": "recdemo000001000002",
      "baseKey": "contracts",
      "fields": {
        "title": "Equipment maintenance / 设备维护",
        "counterparty": "Evergreen Repair / 常青维护",
        "entity": "Northwind Services / 北风服务",
        "owner": "Owen Chen / 陈欧文",
        "expires": "2027-09-30",
        "status": "review",
        "source-ref": "SRC-203",
        "notes": "Commercial review complete; supplier signature missing. / 商务审阅完成，对方尚未签署。"
      }
    },
    {
      "id": "recdemo000001000003",
      "baseKey": "contracts",
      "fields": {
        "title": "Previous workspace lease / 原办公室租赁",
        "counterparty": "Meadow Spaces / 草地空间",
        "entity": "Northwind Services / 北风服务",
        "owner": "Maya Lin / 林雅",
        "expires": "2026-06-30",
        "status": "archived",
        "source-ref": "SRC-204",
        "notes": "Expired lease retained for traceability. / 已到期，仅作追溯归档。"
      }
    },
    {
      "id": "recdemo000002000000",
      "baseKey": "sources",
      "fields": {
        "title": "Registration issued copy / 登记签发件",
        "source-ref": "SRC-101",
        "custodian": "Maya Lin / 林雅",
        "received": "2026-09-20",
        "location": "Cabinet A / A 柜",
        "status": "original",
        "notes": "Synthetic example: no attachment or real document included. / 虚构示例，不含附件或真实文件。"
      }
    },
    {
      "id": "recdemo000002000001",
      "baseKey": "sources",
      "fields": {
        "title": "Fire inspection report / 消防检查报告",
        "source-ref": "SRC-102",
        "custodian": "Owen Chen / 陈欧文",
        "received": "2026-09-21",
        "location": "Cabinet B / B 柜",
        "status": "original",
        "notes": "Issued report checked; renewal work not yet started. / 已核对签发件，尚未启动续检。"
      }
    },
    {
      "id": "recdemo000002000002",
      "baseKey": "sources",
      "fields": {
        "title": "Service permit photocopy / 服务许可复印件",
        "source-ref": "SRC-103",
        "custodian": "Maya Lin / 林雅",
        "received": "2026-09-22",
        "location": "Incoming tray / 待处理托盘",
        "status": "copy-only",
        "notes": "Request original before confirming validity. / 确认有效性前需取得原件。"
      }
    },
    {
      "id": "recdemo000002000003",
      "baseKey": "sources",
      "fields": {
        "title": "Occupancy cover and summary / 场地证明封面与汇总",
        "source-ref": "SRC-104",
        "custodian": "Owen Chen / 陈欧文",
        "received": "2026-09-23",
        "location": "Verification folder / 核验文件夹",
        "status": "conflict",
        "notes": "Two contradictory dates retained: 2026-10-31 and 2027-10-31. / 保留两个冲突日期：2026-10-31 与 2027-10-31。"
      }
    },
    {
      "id": "recdemo000003000000",
      "baseKey": "checks",
      "fields": {
        "title": "Resolve occupancy expiry / 核对场地证明有效期",
        "source-ref": "SRC-104",
        "owner": "Owen Chen / 陈欧文",
        "due": "2026-10-02",
        "status": "blocked",
        "notes": "Ask custodian for the complete issued document; keep both dates. / 向保管人索取完整签发件，并保留双方日期。"
      }
    },
    {
      "id": "recdemo000003000001",
      "baseKey": "checks",
      "fields": {
        "title": "Obtain service permit original / 补服务许可原件",
        "source-ref": "SRC-103",
        "owner": "Maya Lin / 林雅",
        "due": "2026-10-05",
        "status": "open",
        "notes": "Request original from the document custodian. / 向保管人索取原件。"
      }
    },
    {
      "id": "recdemo000003000002",
      "baseKey": "checks",
      "fields": {
        "title": "Schedule fire inspection renewal / 预约消防续检",
        "source-ref": "SRC-102",
        "owner": "Owen Chen / 陈欧文",
        "due": "2026-10-08",
        "status": "open",
        "notes": "Confirm appointment and keep acknowledgement. / 确认预约并留存回执。"
      }
    },
    {
      "id": "recdemo000003000003",
      "baseKey": "checks",
      "fields": {
        "title": "Check business registration / 核对营业登记",
        "source-ref": "SRC-101",
        "owner": "Maya Lin / 林雅",
        "due": "2026-09-25",
        "status": "completed",
        "notes": "Original and archive dates agree. / 原件与归档日期一致。"
      }
    }
  ]
};
