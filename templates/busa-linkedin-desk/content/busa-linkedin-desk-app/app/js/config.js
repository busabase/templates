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
      "name": "Companies",
      "readLimit": 50,
      "fields": [
        {
          "slug": "name",
          "name": "Name",
          "localizedName": {
            "en": "Name",
            "zh-CN": "名称"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "linkedin-url",
          "name": "LinkedIn company page",
          "localizedName": {
            "en": "LinkedIn company page",
            "zh-CN": "LinkedIn 公司页"
          },
          "type": "url",
          "required": false
        },
        {
          "slug": "industry",
          "name": "Industry",
          "localizedName": {
            "en": "Industry",
            "zh-CN": "行业"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "website",
          "name": "Website",
          "localizedName": {
            "en": "Website",
            "zh-CN": "网站"
          },
          "type": "url",
          "required": false
        },
        {
          "slug": "notes",
          "name": "Notes",
          "localizedName": {
            "en": "Notes",
            "zh-CN": "备注"
          },
          "type": "longtext",
          "required": false
        }
      ],
      "localizedName": {
        "en": "Companies",
        "zh-CN": "公司"
      }
    },
    {
      "key": "contacts",
      "slug": "busa-linkedin-desk-contacts",
      "name": "Contacts",
      "readLimit": 50,
      "fields": [
        {
          "slug": "name",
          "name": "Name",
          "localizedName": {
            "en": "Name",
            "zh-CN": "姓名"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "role",
          "name": "Role",
          "localizedName": {
            "en": "Role",
            "zh-CN": "职务"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "company",
          "name": "Company",
          "localizedName": {
            "en": "Company",
            "zh-CN": "公司"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "linkedin-url",
          "name": "LinkedIn profile",
          "localizedName": {
            "en": "LinkedIn profile",
            "zh-CN": "LinkedIn 主页"
          },
          "type": "url",
          "required": true
        },
        {
          "slug": "verification",
          "name": "Verification",
          "localizedName": {
            "en": "Verification",
            "zh-CN": "身份核验"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "tier",
          "name": "Tier",
          "localizedName": {
            "en": "Tier",
            "zh-CN": "意向等级"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "owner",
          "name": "Owner",
          "localizedName": {
            "en": "Owner",
            "zh-CN": "负责人"
          },
          "type": "member",
          "required": false
        },
        {
          "slug": "source",
          "name": "Source",
          "localizedName": {
            "en": "Source",
            "zh-CN": "来源"
          },
          "type": "select",
          "required": false
        }
      ],
      "localizedName": {
        "en": "Contacts",
        "zh-CN": "联系人"
      }
    },
    {
      "key": "messages",
      "slug": "busa-linkedin-desk-messages",
      "name": "Messages",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "Title",
          "localizedName": {
            "en": "Title",
            "zh-CN": "标题"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "thread-id",
          "name": "Thread ID",
          "localizedName": {
            "en": "Thread ID",
            "zh-CN": "线程 ID"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "message-id",
          "name": "Message ID",
          "localizedName": {
            "en": "Message ID",
            "zh-CN": "消息 ID"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "contact",
          "name": "Contact",
          "localizedName": {
            "en": "Contact",
            "zh-CN": "联系人"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "direction",
          "name": "Direction",
          "localizedName": {
            "en": "Direction",
            "zh-CN": "方向"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "channel",
          "name": "Channel",
          "localizedName": {
            "en": "Channel",
            "zh-CN": "渠道"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "sent-at",
          "name": "Time",
          "localizedName": {
            "en": "Time",
            "zh-CN": "时间"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "body",
          "name": "Body",
          "localizedName": {
            "en": "Body",
            "zh-CN": "原文"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "intent",
          "name": "Intent",
          "localizedName": {
            "en": "Intent",
            "zh-CN": "意图"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "urgency",
          "name": "Urgency",
          "localizedName": {
            "en": "Urgency",
            "zh-CN": "紧急度"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "status",
          "name": "Status",
          "localizedName": {
            "en": "Status",
            "zh-CN": "处理状态"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "reply",
          "name": "Linked reply",
          "localizedName": {
            "en": "Linked reply",
            "zh-CN": "关联回复"
          },
          "type": "relation",
          "required": false
        }
      ],
      "localizedName": {
        "en": "Messages",
        "zh-CN": "消息表"
      }
    },
    {
      "key": "replies",
      "slug": "busa-linkedin-desk-replies",
      "name": "Replies",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "Title",
          "localizedName": {
            "en": "Title",
            "zh-CN": "标题"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "message",
          "name": "Source message",
          "localizedName": {
            "en": "Source message",
            "zh-CN": "针对消息"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "contact",
          "name": "Contact",
          "localizedName": {
            "en": "Contact",
            "zh-CN": "联系人"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "draft",
          "name": "Draft",
          "localizedName": {
            "en": "Draft",
            "zh-CN": "草稿正文"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "version",
          "name": "Version",
          "localizedName": {
            "en": "Version",
            "zh-CN": "版本"
          },
          "type": "number",
          "required": false
        },
        {
          "slug": "approval-status",
          "name": "Approval status",
          "localizedName": {
            "en": "Approval status",
            "zh-CN": "审批状态"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "approver",
          "name": "Approver",
          "localizedName": {
            "en": "Approver",
            "zh-CN": "审批人"
          },
          "type": "member",
          "required": false
        },
        {
          "slug": "approval-notes",
          "name": "Approval notes",
          "localizedName": {
            "en": "Approval notes",
            "zh-CN": "审批意见"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "sent-body",
          "name": "Sent body",
          "localizedName": {
            "en": "Sent body",
            "zh-CN": "发送正文"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "sent-at",
          "name": "Sent at",
          "localizedName": {
            "en": "Sent at",
            "zh-CN": "发送时间"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "sent-message-id",
          "name": "Sent message ID",
          "localizedName": {
            "en": "Sent message ID",
            "zh-CN": "发送消息 ID"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "outcome",
          "name": "Outcome",
          "localizedName": {
            "en": "Outcome",
            "zh-CN": "后续结果"
          },
          "type": "select",
          "required": false
        }
      ],
      "localizedName": {
        "en": "Replies",
        "zh-CN": "回复表"
      }
    },
    {
      "key": "actions",
      "slug": "busa-linkedin-desk-actions",
      "name": "Actions",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "Title",
          "localizedName": {
            "en": "Title",
            "zh-CN": "标题"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "type",
          "name": "Type",
          "localizedName": {
            "en": "Type",
            "zh-CN": "类型"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "source-message",
          "name": "Source message",
          "localizedName": {
            "en": "Source message",
            "zh-CN": "来源消息"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "source-reply",
          "name": "Source reply",
          "localizedName": {
            "en": "Source reply",
            "zh-CN": "来源回复"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "owner",
          "name": "Owner",
          "localizedName": {
            "en": "Owner",
            "zh-CN": "负责人"
          },
          "type": "member",
          "required": false
        },
        {
          "slug": "due-date",
          "name": "Due date",
          "localizedName": {
            "en": "Due date",
            "zh-CN": "到期日"
          },
          "type": "date",
          "required": false
        },
        {
          "slug": "status",
          "name": "Status",
          "localizedName": {
            "en": "Status",
            "zh-CN": "状态"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "result",
          "name": "Result",
          "localizedName": {
            "en": "Result",
            "zh-CN": "完成结果"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "evidence-url",
          "name": "Evidence link",
          "localizedName": {
            "en": "Evidence link",
            "zh-CN": "证据链接"
          },
          "type": "url",
          "required": false
        }
      ],
      "localizedName": {
        "en": "Actions",
        "zh-CN": "处理表"
      }
    },
    {
      "key": "experience",
      "slug": "busa-linkedin-desk-experience",
      "name": "Experience",
      "readLimit": 50,
      "fields": [
        {
          "slug": "title",
          "name": "Title",
          "localizedName": {
            "en": "Title",
            "zh-CN": "标题"
          },
          "type": "text",
          "required": true
        },
        {
          "slug": "type",
          "name": "Type",
          "localizedName": {
            "en": "Type",
            "zh-CN": "类型"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "source-reply",
          "name": "Source reply",
          "localizedName": {
            "en": "Source reply",
            "zh-CN": "来源回复"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "source-action",
          "name": "Source action",
          "localizedName": {
            "en": "Source action",
            "zh-CN": "来源处理"
          },
          "type": "relation",
          "required": false
        },
        {
          "slug": "approval-quote",
          "name": "Approval quote",
          "localizedName": {
            "en": "Approval quote",
            "zh-CN": "审批原话"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "scope",
          "name": "Scope",
          "localizedName": {
            "en": "Scope",
            "zh-CN": "适用范围"
          },
          "type": "text",
          "required": false
        },
        {
          "slug": "limits",
          "name": "Limits",
          "localizedName": {
            "en": "Limits",
            "zh-CN": "反例与边界"
          },
          "type": "longtext",
          "required": false
        },
        {
          "slug": "status",
          "name": "Status",
          "localizedName": {
            "en": "Status",
            "zh-CN": "状态"
          },
          "type": "select",
          "required": false
        },
        {
          "slug": "promoted-to",
          "name": "Promoted to",
          "localizedName": {
            "en": "Promoted to",
            "zh-CN": "晋升去向"
          },
          "type": "url",
          "required": false
        },
        {
          "slug": "last-verified",
          "name": "Last verified",
          "localizedName": {
            "en": "Last verified",
            "zh-CN": "最近验证"
          },
          "type": "date",
          "required": false
        }
      ],
      "localizedName": {
        "en": "Experience",
        "zh-CN": "经验表"
      }
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
        "name": "Companies",
        "readLimit": 50,
        "fields": [
          {
            "slug": "name",
            "name": "Name",
            "localizedName": {
              "en": "Name",
              "zh-CN": "名称"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "linkedin-url",
            "name": "LinkedIn company page",
            "localizedName": {
              "en": "LinkedIn company page",
              "zh-CN": "LinkedIn 公司页"
            },
            "type": "url",
            "required": false
          },
          {
            "slug": "industry",
            "name": "Industry",
            "localizedName": {
              "en": "Industry",
              "zh-CN": "行业"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "website",
            "name": "Website",
            "localizedName": {
              "en": "Website",
              "zh-CN": "网站"
            },
            "type": "url",
            "required": false
          },
          {
            "slug": "notes",
            "name": "Notes",
            "localizedName": {
              "en": "Notes",
              "zh-CN": "备注"
            },
            "type": "longtext",
            "required": false
          }
        ],
        "localizedName": {
          "en": "Companies",
          "zh-CN": "公司"
        }
      },
      {
        "key": "contacts",
        "slug": "busa-linkedin-desk-contacts",
        "name": "Contacts",
        "readLimit": 50,
        "fields": [
          {
            "slug": "name",
            "name": "Name",
            "localizedName": {
              "en": "Name",
              "zh-CN": "姓名"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "role",
            "name": "Role",
            "localizedName": {
              "en": "Role",
              "zh-CN": "职务"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "company",
            "name": "Company",
            "localizedName": {
              "en": "Company",
              "zh-CN": "公司"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-companies"
            }
          },
          {
            "slug": "linkedin-url",
            "name": "LinkedIn profile",
            "localizedName": {
              "en": "LinkedIn profile",
              "zh-CN": "LinkedIn 主页"
            },
            "type": "url",
            "required": true
          },
          {
            "slug": "verification",
            "name": "Verification",
            "localizedName": {
              "en": "Verification",
              "zh-CN": "身份核验"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "tier",
            "name": "Tier",
            "localizedName": {
              "en": "Tier",
              "zh-CN": "意向等级"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "owner",
            "name": "Owner",
            "localizedName": {
              "en": "Owner",
              "zh-CN": "负责人"
            },
            "type": "member",
            "required": false
          },
          {
            "slug": "source",
            "name": "Source",
            "localizedName": {
              "en": "Source",
              "zh-CN": "来源"
            },
            "type": "select",
            "required": false
          }
        ],
        "localizedName": {
          "en": "Contacts",
          "zh-CN": "联系人"
        }
      },
      {
        "key": "messages",
        "slug": "busa-linkedin-desk-messages",
        "name": "Messages",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "Title",
            "localizedName": {
              "en": "Title",
              "zh-CN": "标题"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "thread-id",
            "name": "Thread ID",
            "localizedName": {
              "en": "Thread ID",
              "zh-CN": "线程 ID"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "message-id",
            "name": "Message ID",
            "localizedName": {
              "en": "Message ID",
              "zh-CN": "消息 ID"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "contact",
            "name": "Contact",
            "localizedName": {
              "en": "Contact",
              "zh-CN": "联系人"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-contacts"
            }
          },
          {
            "slug": "direction",
            "name": "Direction",
            "localizedName": {
              "en": "Direction",
              "zh-CN": "方向"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "channel",
            "name": "Channel",
            "localizedName": {
              "en": "Channel",
              "zh-CN": "渠道"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "sent-at",
            "name": "Time",
            "localizedName": {
              "en": "Time",
              "zh-CN": "时间"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "body",
            "name": "Body",
            "localizedName": {
              "en": "Body",
              "zh-CN": "原文"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "intent",
            "name": "Intent",
            "localizedName": {
              "en": "Intent",
              "zh-CN": "意图"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "urgency",
            "name": "Urgency",
            "localizedName": {
              "en": "Urgency",
              "zh-CN": "紧急度"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "status",
            "name": "Status",
            "localizedName": {
              "en": "Status",
              "zh-CN": "处理状态"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "reply",
            "name": "Linked reply",
            "localizedName": {
              "en": "Linked reply",
              "zh-CN": "关联回复"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-replies"
            }
          }
        ],
        "localizedName": {
          "en": "Messages",
          "zh-CN": "消息表"
        }
      },
      {
        "key": "replies",
        "slug": "busa-linkedin-desk-replies",
        "name": "Replies",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "Title",
            "localizedName": {
              "en": "Title",
              "zh-CN": "标题"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "message",
            "name": "Source message",
            "localizedName": {
              "en": "Source message",
              "zh-CN": "针对消息"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-messages"
            }
          },
          {
            "slug": "contact",
            "name": "Contact",
            "localizedName": {
              "en": "Contact",
              "zh-CN": "联系人"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-contacts"
            }
          },
          {
            "slug": "draft",
            "name": "Draft",
            "localizedName": {
              "en": "Draft",
              "zh-CN": "草稿正文"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "version",
            "name": "Version",
            "localizedName": {
              "en": "Version",
              "zh-CN": "版本"
            },
            "type": "number",
            "required": false
          },
          {
            "slug": "approval-status",
            "name": "Approval status",
            "localizedName": {
              "en": "Approval status",
              "zh-CN": "审批状态"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "approver",
            "name": "Approver",
            "localizedName": {
              "en": "Approver",
              "zh-CN": "审批人"
            },
            "type": "member",
            "required": false
          },
          {
            "slug": "approval-notes",
            "name": "Approval notes",
            "localizedName": {
              "en": "Approval notes",
              "zh-CN": "审批意见"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "sent-body",
            "name": "Sent body",
            "localizedName": {
              "en": "Sent body",
              "zh-CN": "发送正文"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "sent-at",
            "name": "Sent at",
            "localizedName": {
              "en": "Sent at",
              "zh-CN": "发送时间"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "sent-message-id",
            "name": "Sent message ID",
            "localizedName": {
              "en": "Sent message ID",
              "zh-CN": "发送消息 ID"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "outcome",
            "name": "Outcome",
            "localizedName": {
              "en": "Outcome",
              "zh-CN": "后续结果"
            },
            "type": "select",
            "required": false
          }
        ],
        "localizedName": {
          "en": "Replies",
          "zh-CN": "回复表"
        }
      },
      {
        "key": "actions",
        "slug": "busa-linkedin-desk-actions",
        "name": "Actions",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "Title",
            "localizedName": {
              "en": "Title",
              "zh-CN": "标题"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "type",
            "name": "Type",
            "localizedName": {
              "en": "Type",
              "zh-CN": "类型"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "source-message",
            "name": "Source message",
            "localizedName": {
              "en": "Source message",
              "zh-CN": "来源消息"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-messages"
            }
          },
          {
            "slug": "source-reply",
            "name": "Source reply",
            "localizedName": {
              "en": "Source reply",
              "zh-CN": "来源回复"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-replies"
            }
          },
          {
            "slug": "owner",
            "name": "Owner",
            "localizedName": {
              "en": "Owner",
              "zh-CN": "负责人"
            },
            "type": "member",
            "required": false
          },
          {
            "slug": "due-date",
            "name": "Due date",
            "localizedName": {
              "en": "Due date",
              "zh-CN": "到期日"
            },
            "type": "date",
            "required": false
          },
          {
            "slug": "status",
            "name": "Status",
            "localizedName": {
              "en": "Status",
              "zh-CN": "状态"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "result",
            "name": "Result",
            "localizedName": {
              "en": "Result",
              "zh-CN": "完成结果"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "evidence-url",
            "name": "Evidence link",
            "localizedName": {
              "en": "Evidence link",
              "zh-CN": "证据链接"
            },
            "type": "url",
            "required": false
          }
        ],
        "localizedName": {
          "en": "Actions",
          "zh-CN": "处理表"
        }
      },
      {
        "key": "experience",
        "slug": "busa-linkedin-desk-experience",
        "name": "Experience",
        "readLimit": 50,
        "fields": [
          {
            "slug": "title",
            "name": "Title",
            "localizedName": {
              "en": "Title",
              "zh-CN": "标题"
            },
            "type": "text",
            "required": true
          },
          {
            "slug": "type",
            "name": "Type",
            "localizedName": {
              "en": "Type",
              "zh-CN": "类型"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "source-reply",
            "name": "Source reply",
            "localizedName": {
              "en": "Source reply",
              "zh-CN": "来源回复"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-replies"
            }
          },
          {
            "slug": "source-action",
            "name": "Source action",
            "localizedName": {
              "en": "Source action",
              "zh-CN": "来源处理"
            },
            "type": "relation",
            "required": false,
            "options": {
              "targetBaseSlug": "busa-linkedin-desk-actions"
            }
          },
          {
            "slug": "approval-quote",
            "name": "Approval quote",
            "localizedName": {
              "en": "Approval quote",
              "zh-CN": "审批原话"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "scope",
            "name": "Scope",
            "localizedName": {
              "en": "Scope",
              "zh-CN": "适用范围"
            },
            "type": "text",
            "required": false
          },
          {
            "slug": "limits",
            "name": "Limits",
            "localizedName": {
              "en": "Limits",
              "zh-CN": "反例与边界"
            },
            "type": "longtext",
            "required": false
          },
          {
            "slug": "status",
            "name": "Status",
            "localizedName": {
              "en": "Status",
              "zh-CN": "状态"
            },
            "type": "select",
            "required": false
          },
          {
            "slug": "promoted-to",
            "name": "Promoted to",
            "localizedName": {
              "en": "Promoted to",
              "zh-CN": "晋升去向"
            },
            "type": "url",
            "required": false
          },
          {
            "slug": "last-verified",
            "name": "Last verified",
            "localizedName": {
              "en": "Last verified",
              "zh-CN": "最近验证"
            },
            "type": "date",
            "required": false
          }
        ],
        "localizedName": {
          "en": "Experience",
          "zh-CN": "经验表"
        }
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
        "approval-quote": "Opening with his own words — that part is spot on",
        "status": "candidate"
      }
    }
  ],
  "demoRecordsByLocale": {
    "en": [
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
          "approval-quote": "Opening with his own words — that part is spot on",
          "status": "candidate"
        }
      }
    ],
    "zh-CN": [
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
          "title": "回复：你那篇电子表格管客户的帖子",
          "thread-id": "thread-demo-alex",
          "message-id": "msg-demo-alex-1",
          "contact": [
            "demo-contact-alex-rivera"
          ],
          "direction": "in",
          "channel": "linkedin",
          "sent-at": "__TODAY_0912__",
          "body": "看到你的帖子了——我们真的在用电子表格跟进客户，老是漏事。BusaCRM 是怎么解决这个的？",
          "intent": "interested",
          "urgency": "high",
          "status": "triaged"
        }
      },
      {
        "id": "demo-reply-alex-1",
        "baseKey": "replies",
        "fields": {
          "title": "回复 Alex Rivera——电子表格的痛点",
          "message": [
            "demo-message-alex-1"
          ],
          "contact": [
            "demo-contact-alex-rivera"
          ],
          "draft": "你好 Alex——电子表格的痛点正是 BusaCRM 要去掉的：每次跟进都变成一条有负责人、有到期日的记录，不再只装在某个人脑子里。给你开一个按你们团队现有方式搭好的两周试用台，看看？",
          "version": 1,
          "approval-status": "pending"
        }
      },
      {
        "id": "demo-experience-1",
        "baseKey": "experience",
        "fields": {
          "title": "第一句先复述对方自己的原话",
          "statement": "先用对方描述痛点的原话开口，再提产品；这一招两次都换来了当天回复。",
          "type": "script",
          "source-reply": [
            "demo-reply-alex-1"
          ],
          "approval-quote": "开头用他自己的原话，这点很好",
          "status": "candidate"
        }
      }
    ]
  }
};
