import { createElement, X } from "../vendor/lucide.js";

const copy = {
  en: {
    help: "Review checklist",
    settings: "Data settings",
    close: "Close",
    source: "Data source",
    examples: "Example records",
    busabase: "Busabase workspace",
    loaded: "Last read",
    asof: "Review date",
    mode: "Access",
    readOnly: "Read-only",
    finance: [
      "Check expense and invoice amounts against original evidence in the same currency.",
      "Approval, payment, invoice issuance and filing are separate facts with their own source references.",
      "Review monthly actuals against the close pack; confirm operator-entered filing dates with the authority notice.",
    ],
    cashier: [
      "Bank balances require a check within the last 24 hours, including restricted accounts.",
      "Verify approval, invoice and beneficiary evidence before handing a payment request to the human operator.",
      "Match amount, currency and bank receipt before reconciliation. Investigate differences before proposing adjustments.",
    ],
  },
  "zh-CN": {
    help: "业务复核清单",
    settings: "数据设置",
    close: "关闭",
    source: "数据来源",
    examples: "示例记录",
    busabase: "Busabase 工作区",
    loaded: "最近读取时间",
    asof: "复核日期",
    mode: "访问模式",
    readOnly: "只读",
    finance: [
      "按原始凭证核对报销及开票金额，保留原始币种。",
      "批准、付款、开票及申报是不同事实，各自需要独立依据。",
      "月度实际数据需核对结账资料；人工录入的申报日期须与官方通知确认。",
    ],
    cashier: [
      "银行余额应在最近 24 小时内核查，受限账户也需要标注过期余额。",
      "交接付款申请前，核对审批、发票及收款人依据，由人工执行付款。",
      "金额、币种和银行回单一致后才能对账；先调查差异，再提出调整建议。",
    ],
  },
};

export function openDeskDialog(kind, { locale, appId, state, trigger }) {
  const text = copy[locale] || copy.en;
  const dialog = document.createElement("dialog");
  dialog.className = "desk-dialog";
  dialog.setAttribute("aria-labelledby", "desk-dialog-title");
  const title = document.createElement("h2");
  title.id = "desk-dialog-title";
  title.textContent = text[kind];
  const close = document.createElement("button");
  close.className = "icon-button";
  close.setAttribute("aria-label", text.close);
  close.title = text.close;
  close.append(createElement(X, { "aria-hidden": "true" }));
  close.onclick = () => dialog.close();
  const header = document.createElement("header");
  header.append(title, close);
  dialog.append(header);
  if (kind === "help") {
    const list = document.createElement("ol");
    for (const item of text[
      appId.endsWith("finance") ? "finance" : "cashier"
    ]) {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    }
    dialog.append(list);
  } else {
    const values = [
      [text.source, state.provider === "demo" ? text.examples : text.busabase],
      [text.loaded, new Date(state.loadedAt).toLocaleString(locale)],
      [text.asof, new Date(state.reviewTime).toLocaleString(locale)],
      [text.mode, text.readOnly],
    ];
    const dl = document.createElement("dl");
    for (const [label, value] of values) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      dl.append(dt, dd);
    }
    dialog.append(dl);
  }
  dialog.addEventListener("close", () => {
    dialog.remove();
    trigger?.focus();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }
  });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}
