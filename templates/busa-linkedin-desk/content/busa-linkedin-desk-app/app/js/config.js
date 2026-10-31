export const appConfig = {
  "appName": "Busa LinkedIn Desk",
  "appId": "busa-linkedin-desk",
  "appSlug": "busa-linkedin-desk-app",
  "deployment": "cloud",
  "schemaVersion": 1,
  "readOnly": true,
  "spaceId": "",
  "folder": {
    "key": "busa-linkedin-desk",
    "slug": "busa-linkedin-desk",
    "name": "Busa LinkedIn Desk"
  },
  "airApp": {
    "slug": "busa-linkedin-desk-app",
    "name": "Busa LinkedIn Desk",
    "resourceKey": "busa-linkedin-desk-app"
  },
  "bases": [
    {
      "key": "companies",
      "slug": "busa-linkedin-desk-companies",
      "name": "公司",
      "readLimit": 50,
      "fields": [
        {
          "slug": "name",
          "name": "名称",
          "type": "text",
          "required": true
        },
        {
          "slug": "linkedin-url",
          "name": "LinkedIn 公司页",
          "type": "url",
          "required": false
        },
        {
          "slug": "industry",
          "name": "行业",
          "type": "text",
          "required": false
        },
        {
          "slug": "website",
          "name": "网站",
          "type": "url",
          "required": false
        },
        {
          "slug": "notes",
          "name": "备注",
          "type": "longtext",
          "required": false
        }
      ]
    },
    {
      "key": "contacts",
      "slug": "busa-linkedin-desk-contacts",
      "name": "联系人",
      "readLimit": 50,
      "fields": [
        {
          "slug": "name",
          "name": "姓名",
          "type": "text",
          "required": true
        },
        {
          "slug": "role",
          "name": "职务",
          "type": "text",
          "required": false
        },
        {
          "slug": "company",
          "name": "公司",
          "type": "relation",
          "required": false
        },
        {
          "slug": "linkedin-url",
          "name": "LinkedIn 主页",
          "type": "url",
          "required": true
        },
        {
          "slug": "verification",
          "name": "身份核验",
          "type": "select",
          "required": false
        },
        {
          "slug": "tier",
          "name": "意向等级",
          "type": "select",
          "required": false
        },
        {
          "slug": "owner",
          "name": "负责人",
          "type": "member",
          "required": false
        },
        {
          "slug": "source",
          "name": "来源",
          "type": "select",
          "required": false
        }
      ]
    },
    {
      "key": "messages",
      "slug": "busa-linkedin-desk-messages",
      "name": "消息表",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "标题",
          "type": "text",
          "required": true
        },
        {
          "slug": "thread-id",
          "name": "线程 ID",
          "type": "text",
          "required": true
        },
        {
          "slug": "message-id",
          "name": "消息 ID",
          "type": "text",
          "required": true
        },
        {
          "slug": "contact",
          "name": "联系人",
          "type": "relation",
          "required": false
        },
        {
          "slug": "direction",
          "name": "方向",
          "type": "select",
          "required": false
        },
        {
          "slug": "channel",
          "name": "渠道",
          "type": "select",
          "required": false
        },
        {
          "slug": "sent-at",
          "name": "时间",
          "type": "date",
          "required": false
        },
        {
          "slug": "body",
          "name": "原文",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "intent",
          "name": "意图",
          "type": "select",
          "required": false
        },
        {
          "slug": "urgency",
          "name": "紧急度",
          "type": "select",
          "required": false
        },
        {
          "slug": "status",
          "name": "处理状态",
          "type": "select",
          "required": false
        },
        {
          "slug": "reply",
          "name": "关联回复",
          "type": "relation",
          "required": false
        }
      ]
    },
    {
      "key": "replies",
      "slug": "busa-linkedin-desk-replies",
      "name": "回复表",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "标题",
          "type": "text",
          "required": true
        },
        {
          "slug": "message",
          "name": "针对消息",
          "type": "relation",
          "required": false
        },
        {
          "slug": "contact",
          "name": "联系人",
          "type": "relation",
          "required": false
        },
        {
          "slug": "draft",
          "name": "草稿正文",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "version",
          "name": "版本",
          "type": "number",
          "required": false
        },
        {
          "slug": "approval-status",
          "name": "审批状态",
          "type": "select",
          "required": false
        },
        {
          "slug": "approver",
          "name": "审批人",
          "type": "member",
          "required": false
        },
        {
          "slug": "approval-notes",
          "name": "审批意见",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "sent-body",
          "name": "发送正文",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "sent-at",
          "name": "发送时间",
          "type": "date",
          "required": false
        },
        {
          "slug": "sent-message-id",
          "name": "发送消息 ID",
          "type": "text",
          "required": false
        },
        {
          "slug": "outcome",
          "name": "后续结果",
          "type": "select",
          "required": false
        }
      ]
    },
    {
      "key": "actions",
      "slug": "busa-linkedin-desk-actions",
      "name": "处理表",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "标题",
          "type": "text",
          "required": true
        },
        {
          "slug": "type",
          "name": "类型",
          "type": "select",
          "required": false
        },
        {
          "slug": "source-message",
          "name": "来源消息",
          "type": "relation",
          "required": false
        },
        {
          "slug": "source-reply",
          "name": "来源回复",
          "type": "relation",
          "required": false
        },
        {
          "slug": "owner",
          "name": "负责人",
          "type": "member",
          "required": false
        },
        {
          "slug": "due-date",
          "name": "到期日",
          "type": "date",
          "required": false
        },
        {
          "slug": "status",
          "name": "状态",
          "type": "select",
          "required": false
        },
        {
          "slug": "result",
          "name": "完成结果",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "evidence-url",
          "name": "证据链接",
          "type": "url",
          "required": false
        }
      ]
    },
    {
      "key": "experience",
      "slug": "busa-linkedin-desk-experience",
      "name": "经验表",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "标题",
          "type": "text",
          "required": true
        },
        {
          "slug": "type",
          "name": "类型",
          "type": "select",
          "required": false
        },
        {
          "slug": "source-reply",
          "name": "来源回复",
          "type": "relation",
          "required": false
        },
        {
          "slug": "source-action",
          "name": "来源处理",
          "type": "relation",
          "required": false
        },
        {
          "slug": "approval-quote",
          "name": "审批原话",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "scope",
          "name": "适用范围",
          "type": "text",
          "required": false
        },
        {
          "slug": "limits",
          "name": "反例与边界",
          "type": "longtext",
          "required": false
        },
        {
          "slug": "status",
          "name": "状态",
          "type": "select",
          "required": false
        },
        {
          "slug": "promoted-to",
          "name": "晋升去向",
          "type": "url",
          "required": false
        },
        {
          "slug": "last-verified",
          "name": "最近验证",
          "type": "date",
          "required": false
        }
      ]
    }
  ],
  "schema": {
    "folder": {
      "key": "busa-linkedin-desk",
      "slug": "busa-linkedin-desk",
      "name": "Busa LinkedIn Desk"
    },
    "bases": [
      {
        "key": "companies",
        "slug": "busa-linkedin-desk-companies",
        "name": "公司",
        "readLimit": 50,
        "fields": [
          {
            "slug": "name",
            "name": "名称",
            "type": "text",
            "required": true
          },
          {
            "slug": "linkedin-url",
            "name": "LinkedIn 公司页",
            "type": "url",
            "required": false
          },
          {
            "slug": "industry",
            "name": "行业",
            "type": "text",
            "required": false
          },
          {
            "slug": "website",
            "name": "网站",
            "type": "url",
            "required": false
          },
          {
            "slug": "notes",
            "name": "备注",
            "type": "longtext",
            "required": false
          }
        ]
      },
      {
        "key": "contacts",
        "slug": "busa-linkedin-desk-contacts",
        "name": "联系人",
        "readLimit": 50,
        "fields": [
          {
            "slug": "name",
            "name": "姓名",
            "type": "text",
            "required": true
          },
          {
            "slug": "role",
            "name": "职务",
            "type": "text",
            "required": false
          },
          {
            "slug": "company",
            "name": "公司",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-companies"
            }
          },
          {
            "slug": "linkedin-url",
            "name": "LinkedIn 主页",
            "type": "url",
            "required": true
          },
          {
            "slug": "verification",
            "name": "身份核验",
            "type": "select",
            "required": false
          },
          {
            "slug": "tier",
            "name": "意向等级",
            "type": "select",
            "required": false
          },
          {
            "slug": "owner",
            "name": "负责人",
            "type": "member",
            "required": false
          },
          {
            "slug": "source",
            "name": "来源",
            "type": "select",
            "required": false
          }
        ]
      },
      {
        "key": "messages",
        "slug": "busa-linkedin-desk-messages",
        "name": "消息表",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "标题",
            "type": "text",
            "required": true
          },
          {
            "slug": "thread-id",
            "name": "线程 ID",
            "type": "text",
            "required": true
          },
          {
            "slug": "message-id",
            "name": "消息 ID",
            "type": "text",
            "required": true
          },
          {
            "slug": "contact",
            "name": "联系人",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-contacts"
            }
          },
          {
            "slug": "direction",
            "name": "方向",
            "type": "select",
            "required": false
          },
          {
            "slug": "channel",
            "name": "渠道",
            "type": "select",
            "required": false
          },
          {
            "slug": "sent-at",
            "name": "时间",
            "type": "date",
            "required": false
          },
          {
            "slug": "body",
            "name": "原文",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "intent",
            "name": "意图",
            "type": "select",
            "required": false
          },
          {
            "slug": "urgency",
            "name": "紧急度",
            "type": "select",
            "required": false
          },
          {
            "slug": "status",
            "name": "处理状态",
            "type": "select",
            "required": false
          },
          {
            "slug": "reply",
            "name": "关联回复",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-replies"
            }
          }
        ]
      },
      {
        "key": "replies",
        "slug": "busa-linkedin-desk-replies",
        "name": "回复表",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "标题",
            "type": "text",
            "required": true
          },
          {
            "slug": "message",
            "name": "针对消息",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-messages"
            }
          },
          {
            "slug": "contact",
            "name": "联系人",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-contacts"
            }
          },
          {
            "slug": "draft",
            "name": "草稿正文",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "version",
            "name": "版本",
            "type": "number",
            "required": false
          },
          {
            "slug": "approval-status",
            "name": "审批状态",
            "type": "select",
            "required": false
          },
          {
            "slug": "approver",
            "name": "审批人",
            "type": "member",
            "required": false
          },
          {
            "slug": "approval-notes",
            "name": "审批意见",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "sent-body",
            "name": "发送正文",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "sent-at",
            "name": "发送时间",
            "type": "date",
            "required": false
          },
          {
            "slug": "sent-message-id",
            "name": "发送消息 ID",
            "type": "text",
            "required": false
          },
          {
            "slug": "outcome",
            "name": "后续结果",
            "type": "select",
            "required": false
          }
        ]
      },
      {
        "key": "actions",
        "slug": "busa-linkedin-desk-actions",
        "name": "处理表",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "标题",
            "type": "text",
            "required": true
          },
          {
            "slug": "type",
            "name": "类型",
            "type": "select",
            "required": false
          },
          {
            "slug": "source-message",
            "name": "来源消息",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-messages"
            }
          },
          {
            "slug": "source-reply",
            "name": "来源回复",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-replies"
            }
          },
          {
            "slug": "owner",
            "name": "负责人",
            "type": "member",
            "required": false
          },
          {
            "slug": "due-date",
            "name": "到期日",
            "type": "date",
            "required": false
          },
          {
            "slug": "status",
            "name": "状态",
            "type": "select",
            "required": false
          },
          {
            "slug": "result",
            "name": "完成结果",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "evidence-url",
            "name": "证据链接",
            "type": "url",
            "required": false
          }
        ]
      },
      {
        "key": "experience",
        "slug": "busa-linkedin-desk-experience",
        "name": "经验表",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "标题",
            "type": "text",
            "required": true
          },
          {
            "slug": "type",
            "name": "类型",
            "type": "select",
            "required": false
          },
          {
            "slug": "source-reply",
            "name": "来源回复",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-replies"
            }
          },
          {
            "slug": "source-action",
            "name": "来源处理",
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-actions"
            }
          },
          {
            "slug": "approval-quote",
            "name": "审批原话",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "scope",
            "name": "适用范围",
            "type": "text",
            "required": false
          },
          {
            "slug": "limits",
            "name": "反例与边界",
            "type": "longtext",
            "required": false
          },
          {
            "slug": "status",
            "name": "状态",
            "type": "select",
            "required": false
          },
          {
            "slug": "promoted-to",
            "name": "晋升去向",
            "type": "url",
            "required": false
          },
          {
            "slug": "last-verified",
            "name": "最近验证",
            "type": "date",
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
      "id": "demo-company-north-peak",
      "baseKey": "companies",
      "fields": {
        "title": "North Peak Robotics",
        "linkedin-url": "https://www.linkedin.com/company/north-peak-robotics"
      }
    },
    {
      "id": "demo-contact-alex-rivera",
      "baseKey": "contacts",
      "fields": {
        "title": "Alex Rivera",
        "name": "Alex Rivera",
        "linkedin-url": "https://www.linkedin.com/in/alex-rivera-demo",
        "company": [
          "demo-company-north-peak"
        ]
      }
    },
    {
      "id": "demo-message-alex-1",
      "baseKey": "messages",
      "fields": {
        "title": "Re: your post on spreadsheet CRM",
        "thread-id": "thread-demo-alex",
        "message-id": "msg-demo-alex-1",
        "contact": [
          "demo-contact-alex-rivera"
        ],
        "direction": "in",
        "channel": "linkedin",
        "sent-at": "__TODAY_0912__",
        "body": "Saw your post — we are literally tracking follow-ups in a spreadsheet and things keep slipping. How does BusaCRM handle that?",
        "intent": "interested",
        "urgency": "high",
        "status": "triaged"
      }
    },
    {
      "id": "demo-reply-alex-1",
      "baseKey": "replies",
      "fields": {
        "title": "Reply to Alex Rivera — spreadsheet pain",
        "message": [
          "demo-message-alex-1"
        ],
        "contact": [
          "demo-contact-alex-rivera"
        ],
        "draft": "Hi Alex — the spreadsheet pain is exactly what BusaCRM removes: every follow-up becomes a record with an owner and a due date, so nothing lives in someone's head. Happy to show you a two-week trial workspace set up the way your team already works?",
        "version": 1,
        "approval-status": "pending"
      }
    },
    {
      "id": "demo-experience-1",
      "baseKey": "experience",
      "fields": {
        "title": "Name the prospect's own words back in the first line",
        "statement": "Open with the prospect's own phrasing of their pain before naming the product; it earned a same-day reply twice.",
        "type": "script",
        "source-reply": [
          "demo-reply-alex-1"
        ],
        "approval-quote": "开头用他自己的原话，这点很好",
        "status": "candidate"
      }
    }
  ]
};
