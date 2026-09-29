export const appConfig = {
  "appId": "busa-office-hr",
  "appSlug": "busa-office-hr",
  "appName": "People & Payroll Desk",
  "title": {
    "en": "People & Payroll Desk",
    "zh-CN": "人事薪酬工作台"
  },
  "description": "Employee records, labor contracts, salary proposals and monthly payroll reviews.",
  "localizedDescription": {
    "en": "Employee records, labor contracts, salary proposals and monthly payroll reviews.",
    "zh-CN": "管理员工档案、劳动合同、薪酬变动和月度工资复核。"
  },
  "deployment": "cloud",
  "binding": "runtime",
  "readOnly": true,
  "schemaVersion": 1,
  "locale": "en",
  "brand": {
    "accent": "#166b74"
  },
  "asOf": "2026-09-29",
  "folder": {
    "name": "People & Payroll Desk / 人事薪酬工作台",
    "slug": "busa-office-hr",
    "description": "Employee records, labor contracts, salary proposals and monthly payroll reviews. / 管理员工档案、劳动合同、薪酬变动和月度工资复核。"
  },
  "airApp": {
    "name": "People & Payroll Desk / 人事薪酬工作台",
    "slug": "busa-office-hr-app",
    "resourceKey": "busa-office-hr-app"
  },
  "bases": [
    {
      "key": "employees",
      "name": "Employees",
      "localizedName": {
        "en": "Employees",
        "zh-CN": "员工花名册"
      },
      "slug": "busa-office-hr-employees",
      "description": "Maintain the authoritative employee roster and confirmed salary inputs.",
      "localizedDescription": {
        "en": "Maintain the authoritative employee roster and confirmed salary inputs.",
        "zh-CN": "维护员工主台账与已确认工资输入。"
      },
      "readLimit": 50,
      "primary": "title",
      "secondary": [
        "employee-code",
        "department",
        "owner"
      ],
      "status": "status",
      "attention": [
        "incomplete"
      ],
      "date": "joined",
      "agentPrompts": [
        {
          "key": "scenario-1",
          "label": {
            "en": "Check employee records for missing payroll inputs",
            "zh-CN": "检查员工档案缺失的工资输入"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nCheck employee records for missing payroll inputs. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n检查员工档案缺失的工资输入。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        },
        {
          "key": "scenario-2",
          "label": {
            "en": "Prepare an onboarding record for a new colleague",
            "zh-CN": "为新同事拟定入职档案"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nPrepare an onboarding record for a new colleague. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n为新同事拟定入职档案。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        }
      ],
      "fields": [
        {
          "slug": "title",
          "name": "Employee",
          "localizedName": {
            "en": "Employee",
            "zh-CN": "员工姓名"
          },
          "type": "text",
          "required": true,
          "position": 0,
          "options": {}
        },
        {
          "slug": "employee-code",
          "name": "Employee reference",
          "localizedName": {
            "en": "Employee reference",
            "zh-CN": "员工业务编号"
          },
          "type": "text",
          "required": false,
          "position": 1,
          "options": {}
        },
        {
          "slug": "department",
          "name": "Department",
          "localizedName": {
            "en": "Department",
            "zh-CN": "部门"
          },
          "type": "text",
          "required": false,
          "position": 2,
          "options": {}
        },
        {
          "slug": "owner",
          "name": "HR owner",
          "localizedName": {
            "en": "HR owner",
            "zh-CN": "人事负责人"
          },
          "type": "text",
          "required": false,
          "position": 3,
          "options": {}
        },
        {
          "slug": "joined",
          "name": "Joined on",
          "localizedName": {
            "en": "Joined on",
            "zh-CN": "入职日期"
          },
          "type": "date",
          "required": false,
          "position": 4,
          "options": {}
        },
        {
          "slug": "confirmed-salary",
          "name": "Confirmed monthly salary (CNY)",
          "localizedName": {
            "en": "Confirmed monthly salary (CNY)",
            "zh-CN": "已确认月薪（元）"
          },
          "type": "number",
          "required": false,
          "position": 5,
          "options": {}
        },
        {
          "slug": "status",
          "name": "Record status",
          "localizedName": {
            "en": "Record status",
            "zh-CN": "档案状态"
          },
          "type": "select",
          "required": false,
          "position": 6,
          "options": {
            "choices": [
              {
                "id": "active",
                "name": "Active",
                "localizedName": {
                  "en": "Active",
                  "zh-CN": "在职"
                }
              },
              {
                "id": "incomplete",
                "name": "Inputs missing",
                "localizedName": {
                  "en": "Inputs missing",
                  "zh-CN": "资料待补"
                }
              },
              {
                "id": "leave",
                "name": "On leave",
                "localizedName": {
                  "en": "On leave",
                  "zh-CN": "休假中"
                }
              }
            ]
          }
        },
        {
          "slug": "notes",
          "name": "Confirmation notes",
          "localizedName": {
            "en": "Confirmation notes",
            "zh-CN": "确认说明"
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
          "name": "Employees / 员工花名册",
          "description": "Maintain the authoritative employee roster and confirmed salary inputs. / 维护员工主台账与已确认工资输入。",
          "type": "table",
          "config": {
            "filters": [],
            "sorts": [
              {
                "fieldSlug": "joined",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "employee-code",
              "department",
              "owner",
              "status"
            ]
          }
        },
        {
          "slug": "review",
          "name": "Priority queue / 优先处理",
          "description": "Focus on the incomplete state / 聚焦 资料待补状态",
          "type": "table",
          "config": {
            "filters": [
              {
                "fieldSlug": "status",
                "operator": "equals",
                "value": "incomplete"
              }
            ],
            "sorts": [
              {
                "fieldSlug": "joined",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "employee-code",
              "department",
              "owner",
              "status"
            ]
          }
        }
      ]
    },
    {
      "key": "labor-contracts",
      "name": "Labor contracts",
      "localizedName": {
        "en": "Labor contracts",
        "zh-CN": "劳动合同"
      },
      "slug": "busa-office-hr-labor-contracts",
      "description": "Track employee contract dates, originals and renewal responsibility.",
      "localizedDescription": {
        "en": "Track employee contract dates, originals and renewal responsibility.",
        "zh-CN": "跟踪劳动合同日期、原件与续签责任。"
      },
      "readLimit": 50,
      "primary": "title",
      "secondary": [
        "employee-code",
        "owner",
        "expires"
      ],
      "status": "status",
      "attention": [
        "renewal",
        "unsigned"
      ],
      "date": "expires",
      "agentPrompts": [
        {
          "key": "scenario-1",
          "label": {
            "en": "Prepare contract renewals for the next 60 days",
            "zh-CN": "整理未来 60 天的劳动合同续签"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nPrepare contract renewals for the next 60 days. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n整理未来 60 天的劳动合同续签。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        },
        {
          "key": "scenario-2",
          "label": {
            "en": "Find labor contracts lacking signed originals",
            "zh-CN": "找出缺少签署原件的劳动合同"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nFind labor contracts lacking signed originals. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n找出缺少签署原件的劳动合同。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        }
      ],
      "fields": [
        {
          "slug": "title",
          "name": "Contract",
          "localizedName": {
            "en": "Contract",
            "zh-CN": "合同名称"
          },
          "type": "text",
          "required": true,
          "position": 0,
          "options": {}
        },
        {
          "slug": "employee-code",
          "name": "Employee reference",
          "localizedName": {
            "en": "Employee reference",
            "zh-CN": "员工业务编号"
          },
          "type": "text",
          "required": false,
          "position": 1,
          "options": {}
        },
        {
          "slug": "owner",
          "name": "HR owner",
          "localizedName": {
            "en": "HR owner",
            "zh-CN": "人事负责人"
          },
          "type": "text",
          "required": false,
          "position": 2,
          "options": {}
        },
        {
          "slug": "starts",
          "name": "Starts on",
          "localizedName": {
            "en": "Starts on",
            "zh-CN": "生效日期"
          },
          "type": "date",
          "required": false,
          "position": 3,
          "options": {}
        },
        {
          "slug": "expires",
          "name": "Ends on",
          "localizedName": {
            "en": "Ends on",
            "zh-CN": "到期日期"
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
                  "zh-CN": "待续签"
                }
              },
              {
                "id": "unsigned",
                "name": "Signature pending",
                "localizedName": {
                  "en": "Signature pending",
                  "zh-CN": "待签署"
                }
              }
            ]
          }
        },
        {
          "slug": "notes",
          "name": "Original and renewal notes",
          "localizedName": {
            "en": "Original and renewal notes",
            "zh-CN": "原件与续签说明"
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
          "name": "Labor contracts / 劳动合同",
          "description": "Track employee contract dates, originals and renewal responsibility. / 跟踪劳动合同日期、原件与续签责任。",
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
              "employee-code",
              "owner",
              "expires",
              "status"
            ]
          }
        },
        {
          "slug": "review",
          "name": "Priority queue / 优先处理",
          "description": "Focus on the renewal state / 聚焦 待续签状态",
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
              "employee-code",
              "owner",
              "expires",
              "status"
            ]
          }
        }
      ]
    },
    {
      "key": "salary-changes",
      "name": "Salary changes",
      "localizedName": {
        "en": "Salary changes",
        "zh-CN": "薪酬变动"
      },
      "slug": "busa-office-hr-salary-changes",
      "description": "Keep proposed, approved and rejected compensation decisions separate.",
      "localizedDescription": {
        "en": "Keep proposed, approved and rejected compensation decisions separate.",
        "zh-CN": "分别留存拟议、批准与拒绝的薪酬决定。"
      },
      "readLimit": 50,
      "primary": "title",
      "secondary": [
        "employee-code",
        "owner",
        "effective"
      ],
      "status": "status",
      "attention": [
        "proposed",
        "approved"
      ],
      "date": "effective",
      "agentPrompts": [
        {
          "key": "scenario-1",
          "label": {
            "en": "Compare proposed raises with confirmed salaries",
            "zh-CN": "比较拟议调薪与已确认工资"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nCompare proposed raises with confirmed salaries. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n比较拟议调薪与已确认工资。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        },
        {
          "key": "scenario-2",
          "label": {
            "en": "Draft the evidence checklist for approved changes",
            "zh-CN": "拟定已批变动的证据核对清单"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nDraft the evidence checklist for approved changes. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n拟定已批变动的证据核对清单。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        }
      ],
      "fields": [
        {
          "slug": "title",
          "name": "Proposal",
          "localizedName": {
            "en": "Proposal",
            "zh-CN": "薪酬提案"
          },
          "type": "text",
          "required": true,
          "position": 0,
          "options": {}
        },
        {
          "slug": "employee-code",
          "name": "Employee reference",
          "localizedName": {
            "en": "Employee reference",
            "zh-CN": "员工业务编号"
          },
          "type": "text",
          "required": false,
          "position": 1,
          "options": {}
        },
        {
          "slug": "owner",
          "name": "Decision owner",
          "localizedName": {
            "en": "Decision owner",
            "zh-CN": "审批负责人"
          },
          "type": "text",
          "required": false,
          "position": 2,
          "options": {}
        },
        {
          "slug": "effective",
          "name": "Proposed effective date",
          "localizedName": {
            "en": "Proposed effective date",
            "zh-CN": "拟生效日期"
          },
          "type": "date",
          "required": false,
          "position": 3,
          "options": {}
        },
        {
          "slug": "proposed-salary",
          "name": "Proposed monthly salary (CNY)",
          "localizedName": {
            "en": "Proposed monthly salary (CNY)",
            "zh-CN": "拟议月薪（元）"
          },
          "type": "number",
          "required": false,
          "position": 4,
          "options": {}
        },
        {
          "slug": "status",
          "name": "Decision status",
          "localizedName": {
            "en": "Decision status",
            "zh-CN": "决定状态"
          },
          "type": "select",
          "required": false,
          "position": 5,
          "options": {
            "choices": [
              {
                "id": "proposed",
                "name": "Proposed",
                "localizedName": {
                  "en": "Proposed",
                  "zh-CN": "待批准"
                }
              },
              {
                "id": "approved",
                "name": "Approved, not applied",
                "localizedName": {
                  "en": "Approved, not applied",
                  "zh-CN": "已批待核对"
                }
              },
              {
                "id": "applied",
                "name": "Applied",
                "localizedName": {
                  "en": "Applied",
                  "zh-CN": "已应用"
                }
              },
              {
                "id": "rejected",
                "name": "Rejected",
                "localizedName": {
                  "en": "Rejected",
                  "zh-CN": "已拒绝"
                }
              }
            ]
          }
        },
        {
          "slug": "approval-ref",
          "name": "Approval evidence reference",
          "localizedName": {
            "en": "Approval evidence reference",
            "zh-CN": "审批证据编号"
          },
          "type": "text",
          "required": false,
          "position": 6,
          "options": {}
        },
        {
          "slug": "notes",
          "name": "Decision notes",
          "localizedName": {
            "en": "Decision notes",
            "zh-CN": "决定说明"
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
          "name": "Salary changes / 薪酬变动",
          "description": "Keep proposed, approved and rejected compensation decisions separate. / 分别留存拟议、批准与拒绝的薪酬决定。",
          "type": "table",
          "config": {
            "filters": [],
            "sorts": [
              {
                "fieldSlug": "effective",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "employee-code",
              "owner",
              "effective",
              "status"
            ]
          }
        },
        {
          "slug": "review",
          "name": "Priority queue / 优先处理",
          "description": "Focus on the proposed state / 聚焦 待批准状态",
          "type": "table",
          "config": {
            "filters": [
              {
                "fieldSlug": "status",
                "operator": "equals",
                "value": "proposed"
              }
            ],
            "sorts": [
              {
                "fieldSlug": "effective",
                "direction": "asc"
              }
            ],
            "visibleFieldSlugs": [
              "title",
              "employee-code",
              "owner",
              "effective",
              "status"
            ]
          }
        }
      ]
    },
    {
      "key": "payroll",
      "name": "Monthly payroll",
      "localizedName": {
        "en": "Monthly payroll",
        "zh-CN": "月度工资"
      },
      "slug": "busa-office-hr-payroll",
      "description": "Review payroll inputs and separately confirmed amounts before any payment.",
      "localizedDescription": {
        "en": "Review payroll inputs and separately confirmed amounts before any payment.",
        "zh-CN": "付款前逐项复核工资输入与已确认金额。"
      },
      "readLimit": 50,
      "primary": "title",
      "secondary": [
        "employee-code",
        "period",
        "owner"
      ],
      "status": "status",
      "attention": [
        "draft",
        "in-review",
        "approved",
        "missing-input",
        "review"
      ],
      "date": "due",
      "agentPrompts": [
        {
          "key": "scenario-1",
          "label": {
            "en": "Check September payroll for unconfirmed inputs",
            "zh-CN": "检查 9 月工资的未确认输入"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nCheck September payroll for unconfirmed inputs. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n检查 9 月工资的未确认输入。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        },
        {
          "key": "scenario-2",
          "label": {
            "en": "Summarize confirmed payroll separately from drafts",
            "zh-CN": "分别汇总已确认工资与草稿"
          },
          "intent": "read-only",
          "body": {
            "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nSummarize confirmed payroll separately from drafts. Identify evidence gaps and draft proposed changes only when requested.",
            "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n分别汇总已确认工资与草稿。指出证据缺口，只有用户要求时才拟定变更申请。"
          }
        }
      ],
      "fields": [
        {
          "slug": "title",
          "name": "Payroll item",
          "localizedName": {
            "en": "Payroll item",
            "zh-CN": "工资项目"
          },
          "type": "text",
          "required": true,
          "position": 0,
          "options": {}
        },
        {
          "slug": "employee-code",
          "name": "Employee reference",
          "localizedName": {
            "en": "Employee reference",
            "zh-CN": "员工业务编号"
          },
          "type": "text",
          "required": false,
          "position": 1,
          "options": {}
        },
        {
          "slug": "period",
          "name": "Payroll month",
          "localizedName": {
            "en": "Payroll month",
            "zh-CN": "工资月份"
          },
          "type": "text",
          "required": false,
          "position": 2,
          "options": {}
        },
        {
          "slug": "owner",
          "name": "Payroll reviewer",
          "localizedName": {
            "en": "Payroll reviewer",
            "zh-CN": "工资复核人"
          },
          "type": "text",
          "required": false,
          "position": 3,
          "options": {}
        },
        {
          "slug": "due",
          "name": "Review due on",
          "localizedName": {
            "en": "Review due on",
            "zh-CN": "复核截止"
          },
          "type": "date",
          "required": false,
          "position": 4,
          "options": {}
        },
        {
          "slug": "gross-pay",
          "name": "Confirmed gross pay (CNY)",
          "localizedName": {
            "en": "Confirmed gross pay (CNY)",
            "zh-CN": "已确认应发（元）"
          },
          "type": "number",
          "required": false,
          "position": 5,
          "options": {}
        },
        {
          "slug": "deductions",
          "name": "Confirmed deductions (CNY)",
          "localizedName": {
            "en": "Confirmed deductions (CNY)",
            "zh-CN": "已确认扣款（元）"
          },
          "type": "number",
          "required": false,
          "position": 6,
          "options": {}
        },
        {
          "slug": "status",
          "name": "Payroll status",
          "localizedName": {
            "en": "Payroll status",
            "zh-CN": "工资状态"
          },
          "type": "select",
          "required": false,
          "position": 7,
          "options": {
            "choices": [
              {
                "id": "draft",
                "name": "Draft",
                "localizedName": {
                  "en": "Draft",
                  "zh-CN": "草稿"
                }
              },
              {
                "id": "in-review",
                "name": "In review",
                "localizedName": {
                  "en": "In review",
                  "zh-CN": "审批中"
                }
              },
              {
                "id": "approved",
                "name": "Approved, unpaid",
                "localizedName": {
                  "en": "Approved, unpaid",
                  "zh-CN": "已批未付"
                }
              },
              {
                "id": "paid",
                "name": "Paid",
                "localizedName": {
                  "en": "Paid",
                  "zh-CN": "已付款"
                }
              },
              {
                "id": "rejected",
                "name": "Rejected",
                "localizedName": {
                  "en": "Rejected",
                  "zh-CN": "已拒绝"
                }
              },
              {
                "id": "missing-input",
                "name": "Inputs missing",
                "localizedName": {
                  "en": "Inputs missing",
                  "zh-CN": "输入待补"
                }
              },
              {
                "id": "review",
                "name": "Attendance review",
                "localizedName": {
                  "en": "Attendance review",
                  "zh-CN": "出勤待核"
                }
              }
            ]
          }
        },
        {
          "slug": "notes",
          "name": "Review notes",
          "localizedName": {
            "en": "Review notes",
            "zh-CN": "复核说明"
          },
          "type": "longtext",
          "required": false,
          "position": 8,
          "options": {}
        }
      ],
      "views": [
        {
          "slug": "all",
          "name": "Monthly payroll / 月度工资",
          "description": "Review payroll inputs and separately confirmed amounts before any payment. / 付款前逐项复核工资输入与已确认金额。",
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
              "employee-code",
              "period",
              "owner",
              "status"
            ]
          }
        },
        {
          "slug": "review",
          "name": "Priority queue / 优先处理",
          "description": "Focus on the draft state / 聚焦 草稿状态",
          "type": "table",
          "config": {
            "filters": [
              {
                "fieldSlug": "status",
                "operator": "equals",
                "value": "draft"
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
              "employee-code",
              "period",
              "owner",
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
        "key": "employees",
        "name": "Employees",
        "localizedName": {
          "en": "Employees",
          "zh-CN": "员工花名册"
        },
        "slug": "busa-office-hr-employees",
        "description": "Maintain the authoritative employee roster and confirmed salary inputs.",
        "localizedDescription": {
          "en": "Maintain the authoritative employee roster and confirmed salary inputs.",
          "zh-CN": "维护员工主台账与已确认工资输入。"
        },
        "readLimit": 50,
        "primary": "title",
        "secondary": [
          "employee-code",
          "department",
          "owner"
        ],
        "status": "status",
        "attention": [
          "incomplete"
        ],
        "date": "joined",
        "agentPrompts": [
          {
            "key": "scenario-1",
            "label": {
              "en": "Check employee records for missing payroll inputs",
              "zh-CN": "检查员工档案缺失的工资输入"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nCheck employee records for missing payroll inputs. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n检查员工档案缺失的工资输入。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          },
          {
            "key": "scenario-2",
            "label": {
              "en": "Prepare an onboarding record for a new colleague",
              "zh-CN": "为新同事拟定入职档案"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nPrepare an onboarding record for a new colleague. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n为新同事拟定入职档案。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          }
        ],
        "fields": [
          {
            "slug": "title",
            "name": "Employee",
            "localizedName": {
              "en": "Employee",
              "zh-CN": "员工姓名"
            },
            "type": "text",
            "required": true,
            "position": 0,
            "options": {}
          },
          {
            "slug": "employee-code",
            "name": "Employee reference",
            "localizedName": {
              "en": "Employee reference",
              "zh-CN": "员工业务编号"
            },
            "type": "text",
            "required": false,
            "position": 1,
            "options": {}
          },
          {
            "slug": "department",
            "name": "Department",
            "localizedName": {
              "en": "Department",
              "zh-CN": "部门"
            },
            "type": "text",
            "required": false,
            "position": 2,
            "options": {}
          },
          {
            "slug": "owner",
            "name": "HR owner",
            "localizedName": {
              "en": "HR owner",
              "zh-CN": "人事负责人"
            },
            "type": "text",
            "required": false,
            "position": 3,
            "options": {}
          },
          {
            "slug": "joined",
            "name": "Joined on",
            "localizedName": {
              "en": "Joined on",
              "zh-CN": "入职日期"
            },
            "type": "date",
            "required": false,
            "position": 4,
            "options": {}
          },
          {
            "slug": "confirmed-salary",
            "name": "Confirmed monthly salary (CNY)",
            "localizedName": {
              "en": "Confirmed monthly salary (CNY)",
              "zh-CN": "已确认月薪（元）"
            },
            "type": "number",
            "required": false,
            "position": 5,
            "options": {}
          },
          {
            "slug": "status",
            "name": "Record status",
            "localizedName": {
              "en": "Record status",
              "zh-CN": "档案状态"
            },
            "type": "select",
            "required": false,
            "position": 6,
            "options": {
              "choices": [
                {
                  "id": "active",
                  "name": "Active",
                  "localizedName": {
                    "en": "Active",
                    "zh-CN": "在职"
                  }
                },
                {
                  "id": "incomplete",
                  "name": "Inputs missing",
                  "localizedName": {
                    "en": "Inputs missing",
                    "zh-CN": "资料待补"
                  }
                },
                {
                  "id": "leave",
                  "name": "On leave",
                  "localizedName": {
                    "en": "On leave",
                    "zh-CN": "休假中"
                  }
                }
              ]
            }
          },
          {
            "slug": "notes",
            "name": "Confirmation notes",
            "localizedName": {
              "en": "Confirmation notes",
              "zh-CN": "确认说明"
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
            "name": "Employees / 员工花名册",
            "description": "Maintain the authoritative employee roster and confirmed salary inputs. / 维护员工主台账与已确认工资输入。",
            "type": "table",
            "config": {
              "filters": [],
              "sorts": [
                {
                  "fieldSlug": "joined",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "employee-code",
                "department",
                "owner",
                "status"
              ]
            }
          },
          {
            "slug": "review",
            "name": "Priority queue / 优先处理",
            "description": "Focus on the incomplete state / 聚焦 资料待补状态",
            "type": "table",
            "config": {
              "filters": [
                {
                  "fieldSlug": "status",
                  "operator": "equals",
                  "value": "incomplete"
                }
              ],
              "sorts": [
                {
                  "fieldSlug": "joined",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "employee-code",
                "department",
                "owner",
                "status"
              ]
            }
          }
        ]
      },
      {
        "key": "labor-contracts",
        "name": "Labor contracts",
        "localizedName": {
          "en": "Labor contracts",
          "zh-CN": "劳动合同"
        },
        "slug": "busa-office-hr-labor-contracts",
        "description": "Track employee contract dates, originals and renewal responsibility.",
        "localizedDescription": {
          "en": "Track employee contract dates, originals and renewal responsibility.",
          "zh-CN": "跟踪劳动合同日期、原件与续签责任。"
        },
        "readLimit": 50,
        "primary": "title",
        "secondary": [
          "employee-code",
          "owner",
          "expires"
        ],
        "status": "status",
        "attention": [
          "renewal",
          "unsigned"
        ],
        "date": "expires",
        "agentPrompts": [
          {
            "key": "scenario-1",
            "label": {
              "en": "Prepare contract renewals for the next 60 days",
              "zh-CN": "整理未来 60 天的劳动合同续签"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nPrepare contract renewals for the next 60 days. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n整理未来 60 天的劳动合同续签。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          },
          {
            "key": "scenario-2",
            "label": {
              "en": "Find labor contracts lacking signed originals",
              "zh-CN": "找出缺少签署原件的劳动合同"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nFind labor contracts lacking signed originals. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n找出缺少签署原件的劳动合同。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          }
        ],
        "fields": [
          {
            "slug": "title",
            "name": "Contract",
            "localizedName": {
              "en": "Contract",
              "zh-CN": "合同名称"
            },
            "type": "text",
            "required": true,
            "position": 0,
            "options": {}
          },
          {
            "slug": "employee-code",
            "name": "Employee reference",
            "localizedName": {
              "en": "Employee reference",
              "zh-CN": "员工业务编号"
            },
            "type": "text",
            "required": false,
            "position": 1,
            "options": {}
          },
          {
            "slug": "owner",
            "name": "HR owner",
            "localizedName": {
              "en": "HR owner",
              "zh-CN": "人事负责人"
            },
            "type": "text",
            "required": false,
            "position": 2,
            "options": {}
          },
          {
            "slug": "starts",
            "name": "Starts on",
            "localizedName": {
              "en": "Starts on",
              "zh-CN": "生效日期"
            },
            "type": "date",
            "required": false,
            "position": 3,
            "options": {}
          },
          {
            "slug": "expires",
            "name": "Ends on",
            "localizedName": {
              "en": "Ends on",
              "zh-CN": "到期日期"
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
                    "zh-CN": "待续签"
                  }
                },
                {
                  "id": "unsigned",
                  "name": "Signature pending",
                  "localizedName": {
                    "en": "Signature pending",
                    "zh-CN": "待签署"
                  }
                }
              ]
            }
          },
          {
            "slug": "notes",
            "name": "Original and renewal notes",
            "localizedName": {
              "en": "Original and renewal notes",
              "zh-CN": "原件与续签说明"
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
            "name": "Labor contracts / 劳动合同",
            "description": "Track employee contract dates, originals and renewal responsibility. / 跟踪劳动合同日期、原件与续签责任。",
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
                "employee-code",
                "owner",
                "expires",
                "status"
              ]
            }
          },
          {
            "slug": "review",
            "name": "Priority queue / 优先处理",
            "description": "Focus on the renewal state / 聚焦 待续签状态",
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
                "employee-code",
                "owner",
                "expires",
                "status"
              ]
            }
          }
        ]
      },
      {
        "key": "salary-changes",
        "name": "Salary changes",
        "localizedName": {
          "en": "Salary changes",
          "zh-CN": "薪酬变动"
        },
        "slug": "busa-office-hr-salary-changes",
        "description": "Keep proposed, approved and rejected compensation decisions separate.",
        "localizedDescription": {
          "en": "Keep proposed, approved and rejected compensation decisions separate.",
          "zh-CN": "分别留存拟议、批准与拒绝的薪酬决定。"
        },
        "readLimit": 50,
        "primary": "title",
        "secondary": [
          "employee-code",
          "owner",
          "effective"
        ],
        "status": "status",
        "attention": [
          "proposed",
          "approved"
        ],
        "date": "effective",
        "agentPrompts": [
          {
            "key": "scenario-1",
            "label": {
              "en": "Compare proposed raises with confirmed salaries",
              "zh-CN": "比较拟议调薪与已确认工资"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nCompare proposed raises with confirmed salaries. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n比较拟议调薪与已确认工资。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          },
          {
            "key": "scenario-2",
            "label": {
              "en": "Draft the evidence checklist for approved changes",
              "zh-CN": "拟定已批变动的证据核对清单"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nDraft the evidence checklist for approved changes. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n拟定已批变动的证据核对清单。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          }
        ],
        "fields": [
          {
            "slug": "title",
            "name": "Proposal",
            "localizedName": {
              "en": "Proposal",
              "zh-CN": "薪酬提案"
            },
            "type": "text",
            "required": true,
            "position": 0,
            "options": {}
          },
          {
            "slug": "employee-code",
            "name": "Employee reference",
            "localizedName": {
              "en": "Employee reference",
              "zh-CN": "员工业务编号"
            },
            "type": "text",
            "required": false,
            "position": 1,
            "options": {}
          },
          {
            "slug": "owner",
            "name": "Decision owner",
            "localizedName": {
              "en": "Decision owner",
              "zh-CN": "审批负责人"
            },
            "type": "text",
            "required": false,
            "position": 2,
            "options": {}
          },
          {
            "slug": "effective",
            "name": "Proposed effective date",
            "localizedName": {
              "en": "Proposed effective date",
              "zh-CN": "拟生效日期"
            },
            "type": "date",
            "required": false,
            "position": 3,
            "options": {}
          },
          {
            "slug": "proposed-salary",
            "name": "Proposed monthly salary (CNY)",
            "localizedName": {
              "en": "Proposed monthly salary (CNY)",
              "zh-CN": "拟议月薪（元）"
            },
            "type": "number",
            "required": false,
            "position": 4,
            "options": {}
          },
          {
            "slug": "status",
            "name": "Decision status",
            "localizedName": {
              "en": "Decision status",
              "zh-CN": "决定状态"
            },
            "type": "select",
            "required": false,
            "position": 5,
            "options": {
              "choices": [
                {
                  "id": "proposed",
                  "name": "Proposed",
                  "localizedName": {
                    "en": "Proposed",
                    "zh-CN": "待批准"
                  }
                },
                {
                  "id": "approved",
                  "name": "Approved, not applied",
                  "localizedName": {
                    "en": "Approved, not applied",
                    "zh-CN": "已批待核对"
                  }
                },
                {
                  "id": "applied",
                  "name": "Applied",
                  "localizedName": {
                    "en": "Applied",
                    "zh-CN": "已应用"
                  }
                },
                {
                  "id": "rejected",
                  "name": "Rejected",
                  "localizedName": {
                    "en": "Rejected",
                    "zh-CN": "已拒绝"
                  }
                }
              ]
            }
          },
          {
            "slug": "approval-ref",
            "name": "Approval evidence reference",
            "localizedName": {
              "en": "Approval evidence reference",
              "zh-CN": "审批证据编号"
            },
            "type": "text",
            "required": false,
            "position": 6,
            "options": {}
          },
          {
            "slug": "notes",
            "name": "Decision notes",
            "localizedName": {
              "en": "Decision notes",
              "zh-CN": "决定说明"
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
            "name": "Salary changes / 薪酬变动",
            "description": "Keep proposed, approved and rejected compensation decisions separate. / 分别留存拟议、批准与拒绝的薪酬决定。",
            "type": "table",
            "config": {
              "filters": [],
              "sorts": [
                {
                  "fieldSlug": "effective",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "employee-code",
                "owner",
                "effective",
                "status"
              ]
            }
          },
          {
            "slug": "review",
            "name": "Priority queue / 优先处理",
            "description": "Focus on the proposed state / 聚焦 待批准状态",
            "type": "table",
            "config": {
              "filters": [
                {
                  "fieldSlug": "status",
                  "operator": "equals",
                  "value": "proposed"
                }
              ],
              "sorts": [
                {
                  "fieldSlug": "effective",
                  "direction": "asc"
                }
              ],
              "visibleFieldSlugs": [
                "title",
                "employee-code",
                "owner",
                "effective",
                "status"
              ]
            }
          }
        ]
      },
      {
        "key": "payroll",
        "name": "Monthly payroll",
        "localizedName": {
          "en": "Monthly payroll",
          "zh-CN": "月度工资"
        },
        "slug": "busa-office-hr-payroll",
        "description": "Review payroll inputs and separately confirmed amounts before any payment.",
        "localizedDescription": {
          "en": "Review payroll inputs and separately confirmed amounts before any payment.",
          "zh-CN": "付款前逐项复核工资输入与已确认金额。"
        },
        "readLimit": 50,
        "primary": "title",
        "secondary": [
          "employee-code",
          "period",
          "owner"
        ],
        "status": "status",
        "attention": [
          "draft",
          "in-review",
          "approved",
          "missing-input",
          "review"
        ],
        "date": "due",
        "agentPrompts": [
          {
            "key": "scenario-1",
            "label": {
              "en": "Check September payroll for unconfirmed inputs",
              "zh-CN": "检查 9 月工资的未确认输入"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nCheck September payroll for unconfirmed inputs. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n检查 9 月工资的未确认输入。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          },
          {
            "key": "scenario-2",
            "label": {
              "en": "Summarize confirmed payroll separately from drafts",
              "zh-CN": "分别汇总已确认工资与草稿"
            },
            "intent": "read-only",
            "body": {
              "en": "Read the busa-office-hr skill in this folder and follow its workflow.\n\n{target}\n\nSummarize confirmed payroll separately from drafts. Identify evidence gaps and draft proposed changes only when requested.",
              "zh-CN": "先阅读本文件夹的 busa-office-hr Skill，遵循其流程。\n\n{target}\n\n分别汇总已确认工资与草稿。指出证据缺口，只有用户要求时才拟定变更申请。"
            }
          }
        ],
        "fields": [
          {
            "slug": "title",
            "name": "Payroll item",
            "localizedName": {
              "en": "Payroll item",
              "zh-CN": "工资项目"
            },
            "type": "text",
            "required": true,
            "position": 0,
            "options": {}
          },
          {
            "slug": "employee-code",
            "name": "Employee reference",
            "localizedName": {
              "en": "Employee reference",
              "zh-CN": "员工业务编号"
            },
            "type": "text",
            "required": false,
            "position": 1,
            "options": {}
          },
          {
            "slug": "period",
            "name": "Payroll month",
            "localizedName": {
              "en": "Payroll month",
              "zh-CN": "工资月份"
            },
            "type": "text",
            "required": false,
            "position": 2,
            "options": {}
          },
          {
            "slug": "owner",
            "name": "Payroll reviewer",
            "localizedName": {
              "en": "Payroll reviewer",
              "zh-CN": "工资复核人"
            },
            "type": "text",
            "required": false,
            "position": 3,
            "options": {}
          },
          {
            "slug": "due",
            "name": "Review due on",
            "localizedName": {
              "en": "Review due on",
              "zh-CN": "复核截止"
            },
            "type": "date",
            "required": false,
            "position": 4,
            "options": {}
          },
          {
            "slug": "gross-pay",
            "name": "Confirmed gross pay (CNY)",
            "localizedName": {
              "en": "Confirmed gross pay (CNY)",
              "zh-CN": "已确认应发（元）"
            },
            "type": "number",
            "required": false,
            "position": 5,
            "options": {}
          },
          {
            "slug": "deductions",
            "name": "Confirmed deductions (CNY)",
            "localizedName": {
              "en": "Confirmed deductions (CNY)",
              "zh-CN": "已确认扣款（元）"
            },
            "type": "number",
            "required": false,
            "position": 6,
            "options": {}
          },
          {
            "slug": "status",
            "name": "Payroll status",
            "localizedName": {
              "en": "Payroll status",
              "zh-CN": "工资状态"
            },
            "type": "select",
            "required": false,
            "position": 7,
            "options": {
              "choices": [
                {
                  "id": "draft",
                  "name": "Draft",
                  "localizedName": {
                    "en": "Draft",
                    "zh-CN": "草稿"
                  }
                },
                {
                  "id": "in-review",
                  "name": "In review",
                  "localizedName": {
                    "en": "In review",
                    "zh-CN": "审批中"
                  }
                },
                {
                  "id": "approved",
                  "name": "Approved, unpaid",
                  "localizedName": {
                    "en": "Approved, unpaid",
                    "zh-CN": "已批未付"
                  }
                },
                {
                  "id": "paid",
                  "name": "Paid",
                  "localizedName": {
                    "en": "Paid",
                    "zh-CN": "已付款"
                  }
                },
                {
                  "id": "rejected",
                  "name": "Rejected",
                  "localizedName": {
                    "en": "Rejected",
                    "zh-CN": "已拒绝"
                  }
                },
                {
                  "id": "missing-input",
                  "name": "Inputs missing",
                  "localizedName": {
                    "en": "Inputs missing",
                    "zh-CN": "输入待补"
                  }
                },
                {
                  "id": "review",
                  "name": "Attendance review",
                  "localizedName": {
                    "en": "Attendance review",
                    "zh-CN": "出勤待核"
                  }
                }
              ]
            }
          },
          {
            "slug": "notes",
            "name": "Review notes",
            "localizedName": {
              "en": "Review notes",
              "zh-CN": "复核说明"
            },
            "type": "longtext",
            "required": false,
            "position": 8,
            "options": {}
          }
        ],
        "views": [
          {
            "slug": "all",
            "name": "Monthly payroll / 月度工资",
            "description": "Review payroll inputs and separately confirmed amounts before any payment. / 付款前逐项复核工资输入与已确认金额。",
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
                "employee-code",
                "period",
                "owner",
                "status"
              ]
            }
          },
          {
            "slug": "review",
            "name": "Priority queue / 优先处理",
            "description": "Focus on the draft state / 聚焦 草稿状态",
            "type": "table",
            "config": {
              "filters": [
                {
                  "fieldSlug": "status",
                  "operator": "equals",
                  "value": "draft"
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
                "employee-code",
                "period",
                "owner",
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
      "en": "Contracts and payroll review",
      "zh-CN": "合同与工资复核"
    },
    "primary_base": "employees"
  },
  "boundary": {
    "en": "Proposed salaries never replace confirmed salaries. Employee headcount comes only from employee records, never contract or payroll row counts. Calculate a payroll draft only from explicitly confirmed inputs; missing inputs remain missing. Changes use ChangeRequests and require the user's requested approval evidence. Do not submit payments, send payslips or infer tax or legal obligations. Restrict employee information with workspace permissions.",
    "zh-CN": "拟议工资不能覆盖已确认工资。员工人数只能由员工台账确定，不能从合同或工资行数推断。工资草稿只使用明确确认的数据，缺项保持待补充。记录修改通过变更申请并留存用户要求的审批证据。不发起付款、不发送工资条、不推断税务或法律义务；通过工作区权限限制员工信息访问。"
  },
  "demoRecords": [
    {
      "id": "recdemo000000000000",
      "baseKey": "employees",
      "fields": {
        "title": "Alex Lin / 林安",
        "employee-code": "EMP-101",
        "department": "Operations / 运营",
        "owner": "Morgan Wu / 吴敏",
        "joined": "2024-04-08",
        "confirmed-salary": 12000,
        "status": "active",
        "notes": "Confirmed salary; pending proposal is not applied. / 已确认工资，待批提案未应用。"
      }
    },
    {
      "id": "recdemo000000000001",
      "baseKey": "employees",
      "fields": {
        "title": "Riley Chen / 陈瑞",
        "employee-code": "EMP-102",
        "department": "Engineering / 研发",
        "owner": "Morgan Wu / 吴敏",
        "joined": "2025-02-17",
        "confirmed-salary": 18000,
        "status": "active",
        "notes": "Salary confirmation dated 2026-08-15. / 工资确认日期为 2026-08-15。"
      }
    },
    {
      "id": "recdemo000000000002",
      "baseKey": "employees",
      "fields": {
        "title": "Sam Zhou / 周杉",
        "employee-code": "EMP-103",
        "department": "Customer success / 客户成功",
        "owner": "Taylor He / 何泰",
        "joined": "2026-09-21",
        "status": "incomplete",
        "notes": "Confirmed salary has not been provided; do not assume zero. / 未提供已确认工资，不得按零处理。"
      }
    },
    {
      "id": "recdemo000000000003",
      "baseKey": "employees",
      "fields": {
        "title": "Jamie Xu / 徐嘉",
        "employee-code": "EMP-104",
        "department": "Design / 设计",
        "owner": "Taylor He / 何泰",
        "joined": "2023-07-03",
        "confirmed-salary": 15000,
        "status": "leave",
        "notes": "Leave adjustment requires attendance confirmation. / 休假调整需出勤确认。"
      }
    },
    {
      "id": "recdemo000001000000",
      "baseKey": "labor-contracts",
      "fields": {
        "title": "Alex / 林安 · 2024-2026",
        "employee-code": "EMP-101",
        "owner": "Morgan Wu / 吴敏",
        "starts": "2024-04-08",
        "expires": "2026-10-31",
        "status": "renewal",
        "notes": "Signed original archived; renewal meeting needed. / 已归档签署原件，需安排续签沟通。"
      }
    },
    {
      "id": "recdemo000001000001",
      "baseKey": "labor-contracts",
      "fields": {
        "title": "Riley / 陈瑞 · 2025-2028",
        "employee-code": "EMP-102",
        "owner": "Morgan Wu / 吴敏",
        "starts": "2025-02-17",
        "expires": "2028-02-16",
        "status": "signed",
        "notes": "Both parties signed. / 双方已签署。"
      }
    },
    {
      "id": "recdemo000001000002",
      "baseKey": "labor-contracts",
      "fields": {
        "title": "Sam / 周杉 · 2026-2029",
        "employee-code": "EMP-103",
        "owner": "Taylor He / 何泰",
        "starts": "2026-09-21",
        "expires": "2029-09-20",
        "status": "unsigned",
        "notes": "Employee signature not received; do not mark approved. / 未收员工签名，不得标为已批准。"
      }
    },
    {
      "id": "recdemo000001000003",
      "baseKey": "labor-contracts",
      "fields": {
        "title": "Jamie / 徐嘉 · 2023-2026",
        "employee-code": "EMP-104",
        "owner": "Taylor He / 何泰",
        "starts": "2023-07-03",
        "expires": "2026-11-30",
        "status": "renewal",
        "notes": "Plan discussion around leave dates. / 按休假安排续签沟通。"
      }
    },
    {
      "id": "recdemo000002000000",
      "baseKey": "salary-changes",
      "fields": {
        "title": "Alex · role expansion / 林安 · 职责扩展",
        "employee-code": "EMP-101",
        "owner": "Morgan Wu / 吴敏",
        "effective": "2026-10-01",
        "proposed-salary": 13500,
        "status": "proposed",
        "approval-ref": "",
        "notes": "Requested raise; confirmed roster remains 12000. / 提议调薪，花名册确认工资仍为 12000。"
      }
    },
    {
      "id": "recdemo000002000001",
      "baseKey": "salary-changes",
      "fields": {
        "title": "Riley · annual review / 陈瑞 · 年度评审",
        "employee-code": "EMP-102",
        "owner": "Morgan Wu / 吴敏",
        "effective": "2026-11-01",
        "proposed-salary": 19000,
        "status": "approved",
        "approval-ref": "APP-2026-041",
        "notes": "Approved for November; do not include in September payroll. / 已批准于 11 月生效，不计入 9 月工资。"
      }
    },
    {
      "id": "recdemo000002000002",
      "baseKey": "salary-changes",
      "fields": {
        "title": "Jamie · prior review / 徐嘉 · 之前的评审",
        "employee-code": "EMP-104",
        "owner": "Taylor He / 何泰",
        "effective": "2026-08-01",
        "proposed-salary": 15000,
        "status": "applied",
        "approval-ref": "APP-2026-030",
        "notes": "Confirmed roster already reflects this change. / 花名册已反映此变动。"
      }
    },
    {
      "id": "recdemo000002000003",
      "baseKey": "salary-changes",
      "fields": {
        "title": "Alex · earlier request / 林安 · 先前的申请",
        "employee-code": "EMP-101",
        "owner": "Morgan Wu / 吴敏",
        "effective": "2026-07-01",
        "proposed-salary": 14000,
        "status": "rejected",
        "approval-ref": "APP-2026-022",
        "notes": "Rejected proposal retained for decision history. / 已拒绝提案保留作历史追溯。"
      }
    },
    {
      "id": "recdemo000003000000",
      "baseKey": "payroll",
      "fields": {
        "title": "Alex · September / 林安 · 9 月",
        "employee-code": "EMP-101",
        "period": "2026-09",
        "owner": "Morgan Wu / 吴敏",
        "due": "2026-10-08",
        "gross-pay": 12000,
        "deductions": 2100,
        "status": "approved",
        "notes": "Approved inputs only; no payment made. October raise remains a proposal. / 已批工资输入，尚未付款。10 月调薪仍为提案。"
      }
    },
    {
      "id": "recdemo000003000001",
      "baseKey": "payroll",
      "fields": {
        "title": "Riley · September / 陈瑞 · 9 月",
        "employee-code": "EMP-102",
        "period": "2026-09",
        "owner": "Morgan Wu / 吴敏",
        "due": "2026-10-08",
        "gross-pay": 18000,
        "deductions": 3100,
        "status": "paid",
        "notes": "Synthetic payment evidence: PAY-2026-102, 2026-09-29. November approved raise is excluded. / 虚构付款证据 PAY-2026-102，2026-09-29；不含 11 月已批调薪。"
      }
    },
    {
      "id": "recdemo000003000002",
      "baseKey": "payroll",
      "fields": {
        "title": "Sam · September / 周杉 · 9 月",
        "employee-code": "EMP-103",
        "period": "2026-09",
        "owner": "Taylor He / 何泰",
        "due": "2026-10-08",
        "status": "missing-input",
        "notes": "Missing confirmed salary and attendance; no pay amount computed. / 缺确认工资与出勤，不计算金额。"
      }
    },
    {
      "id": "recdemo000003000003",
      "baseKey": "payroll",
      "fields": {
        "title": "Jamie · September / 徐嘉 · 9 月",
        "employee-code": "EMP-104",
        "period": "2026-09",
        "owner": "Taylor He / 何泰",
        "due": "2026-10-08",
        "gross-pay": 15000,
        "status": "review",
        "notes": "Gross input recorded; deduction and leave adjustment not confirmed. / 已录应发输入，扣款与休假调整未确认。"
      }
    }
  ]
};
