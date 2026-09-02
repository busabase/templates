const CLOSED_STAGES = new Set(["closed-won", "closed-lost"]);

const recordsFor = (records, baseKey) => records.filter((record) => record.baseKey === baseKey);
const dateField = (record, fieldSlug) => String(record.fields?.[fieldSlug] || "").slice(0, 10);
const pad = (value) => String(value).padStart(2, "0");

export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const localDateFromKey = (value) => {
  const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day, 12) : null;
};

const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);

const mondayFor = (date) => addDays(date, -((date.getDay() + 6) % 7));
const compactCount = (count, partial) => `${count}${partial ? "+" : ""}`;

export function buildOverviewModel({
  records = [],
  pageInfo = {},
  counts = {},
  stages = [],
  now = new Date(),
}) {
  const companies = recordsFor(records, "companies");
  const activities = recordsFor(records, "activities");
  const deals = recordsFor(records, "deals");
  const today = localDateKey(now);
  const weekStartDate = mondayFor(now);
  const weekStart = localDateKey(weekStartDate);
  const weekEnd = localDateKey(addDays(weekStartDate, 6));
  const weekLabel = `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(weekStartDate)}-${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(addDays(weekStartDate, 6))}`;
  const closingHorizon = localDateKey(addDays(now, 30));
  const activitiesPartial = Boolean(pageInfo.activities?.nextCursor);
  const dealsPartial = Boolean(pageInfo.deals?.nextCursor);

  const customerAccounts = counts.customerAccounts ?? companies.filter(
    (record) => record.fields?.["relationship-type"] === "customer",
  ).length;
  const prospects = counts.prospects ?? companies.filter(
    (record) => record.fields?.["relationship-type"] === "prospect",
  ).length;
  const stageCounts = Object.fromEntries(stages.map((stage) => [
    stage.id,
    counts.dealStages?.[stage.id] ?? deals.filter((record) => record.fields?.stage === stage.id).length,
  ]));
  const openDeals = stages
    .filter((stage) => !CLOSED_STAGES.has(stage.id))
    .reduce((sum, stage) => sum + (stageCounts[stage.id] || 0), 0);
  const wonDeals = stageCounts["closed-won"] || 0;
  const lostDeals = stageCounts["closed-lost"] || 0;
  const decidedDeals = wonDeals + lostDeals;
  const winRate = decidedDeals ? Math.round((wonDeals / decidedDeals) * 100) : null;

  const activitiesThisWeek = activities.filter((record) => {
    const value = dateField(record, "activity-date");
    return value >= weekStart && value <= weekEnd;
  });
  const oldestLoadedActivity = activities.reduce((oldest, record) => {
    const value = dateField(record, "activity-date");
    return value && (!oldest || value < oldest) ? value : oldest;
  }, "");
  const weekCountPartial = activitiesPartial && (!oldestLoadedActivity || oldestLoadedActivity >= weekStart);
  const dueActivities = activities
    .filter((record) => {
      const value = dateField(record, "next-follow-up-date");
      return value && value <= today;
    })
    .sort((left, right) =>
      dateField(left, "next-follow-up-date").localeCompare(dateField(right, "next-follow-up-date")),
    );
  const closingSoon = deals
    .filter((record) => {
      const value = dateField(record, "expected-close-date");
      return !CLOSED_STAGES.has(record.fields?.stage) && value >= today && value <= closingHorizon;
    })
    .sort((left, right) =>
      dateField(left, "expected-close-date").localeCompare(dateField(right, "expected-close-date")),
    );
  const missingNextStep = deals.filter(
    (record) => !CLOSED_STAGES.has(record.fields?.stage) && !String(record.fields?.["next-step"] || "").trim(),
  );

  const openValueByCurrency = new Map();
  for (const deal of deals.filter((record) => !CLOSED_STAGES.has(record.fields?.stage))) {
    const currency = String(deal.fields?.currency || "").toLowerCase();
    const amount = Number(deal.fields?.amount || 0);
    if (currency && Number.isFinite(amount)) {
      openValueByCurrency.set(currency, (openValueByCurrency.get(currency) || 0) + amount);
    }
  }

  const activitySeries = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(now, index - 6);
    const key = localDateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
      count: activities.filter((record) => dateField(record, "activity-date") === key).length,
    };
  });
  const activityPeak = Math.max(1, ...activitySeries.map((item) => item.count));
  const activityMix = ["call", "email", "meeting", "note"].map((type) => ({
    type,
    count: activitiesThisWeek.filter((record) => record.fields?.["activity-type"] === type).length,
  }));

  const stagePeak = Math.max(1, ...Object.values(stageCounts));
  const railStages = stages.map((stage) => ({
    ...stage,
    count: stageCounts[stage.id] || 0,
    fill: Math.max(6, Math.round(((stageCounts[stage.id] || 0) / stagePeak) * 100)),
  }));

  return {
    today,
    dateLabel: new Intl.DateTimeFormat("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now),
    weekLabel,
    stats: [
      { label: "Customer accounts", icon: "building-2", value: String(customerAccounts), note: "Current relationships", target: "customers" },
      { label: "Prospects", icon: "target", value: String(prospects), note: "Open account relationships", target: "prospects" },
      { label: "Activities this week", icon: "activity", value: compactCount(activitiesThisWeek.length, weekCountPartial), note: weekLabel, target: "activities" },
      { label: "Follow-ups due", icon: "alarm-clock", value: compactCount(dueActivities.length, activitiesPartial), note: activitiesPartial ? "Loaded activity window" : "Through today", target: "followups" },
    ],
    openDeals,
    wonDeals,
    lostDeals,
    winRate,
    railStages,
    openValues: [...openValueByCurrency.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    openValuePartial: dealsPartial,
    dueActivities,
    dueActivitiesPartial: activitiesPartial,
    closingSoon,
    closingSoonPartial: dealsPartial,
    missingNextStep,
    missingNextStepPartial: dealsPartial,
    activitySeries: activitySeries.map((item) => ({
      ...item,
      height: item.count ? Math.max(12, Math.round((item.count / activityPeak) * 100)) : 4,
    })),
    activityMix,
    activityWindowPartial: activitiesPartial,
    closedWon: deals
      .filter((record) => record.fields?.stage === "closed-won")
      .sort((left, right) =>
        dateField(right, "expected-close-date").localeCompare(dateField(left, "expected-close-date")),
      )
      .slice(0, 3),
    recentTouches: [...activities]
      .sort((left, right) =>
        dateField(right, "activity-date").localeCompare(dateField(left, "activity-date")),
      )
      .slice(0, 4),
  };
}

export function renderOverviewMarkup(model, helpers) {
  const { escapeHtml, formatDate, formatMoney, recordTitle, displayValue, choiceLabel } = helpers;
  const statHtml = model.stats.map((stat) => `
    <button class="overview-stat" type="button" data-overview-target="${escapeHtml(stat.target)}">
      <span class="overview-stat-icon" aria-hidden="true"><i data-lucide="${escapeHtml(stat.icon)}"></i></span>
      <span class="overview-stat-content">
        <span class="overview-stat-label">${escapeHtml(stat.label)}</span>
        <strong class="overview-stat-value" data-value="${escapeHtml(stat.value)}" aria-label="${escapeHtml(stat.value)}">${escapeHtml(stat.value)}</strong>
        <small>${escapeHtml(stat.note)}</small>
      </span>
    </button>`).join("");
  const stageHtml = model.railStages.map((stage) => `
    <button class="rail-stage" type="button" data-stage="${escapeHtml(stage.id)}" style="--stage-color:${escapeHtml(stage.color || "#0f766e")};--stage-fill:${stage.fill}%">
      <span>${escapeHtml(stage.name)}</span><strong>${stage.count}</strong>
      <i aria-hidden="true"><b></b></i>
    </button>`).join("");
  const valueHtml = model.openValues.length
    ? model.openValues.map((item) => `<span>${escapeHtml(formatMoney(item.amount, item.currency))}</span>`).join("")
    : '<span>No open value</span>';

  const focusRow = (record, baseKey, tone, label, dateSlug) => `
    <button class="focus-row ${escapeHtml(tone)}" type="button" data-overview-record="${escapeHtml(record.id)}" data-overview-base="${escapeHtml(baseKey)}">
      <i class="focus-signal ${tone}" aria-hidden="true"></i>
      <span><strong>${escapeHtml(recordTitle(record))}</strong><small>${escapeHtml(label)}</small></span>
      <time>${escapeHtml(formatDate(record.fields?.[dateSlug]))}</time>
    </button>`;
  const dueHtml = model.dueActivities.length
    ? model.dueActivities.slice(0, 3).map((record) => focusRow(
        record,
        "activities",
        "overdue",
        `${choiceLabel("activities", "activity-type", record.fields?.["activity-type"])} / ${displayValue(record.fields?.company)}`,
        "next-follow-up-date",
      )).join("")
    : '<div class="overview-empty">No follow-ups are due in this window.</div>';
  const closingHtml = model.closingSoon.length
    ? model.closingSoon.slice(0, 2).map((record) => focusRow(
        record,
        "deals",
        "closing",
        `${displayValue(record.fields?.company)} / ${formatMoney(record.fields?.amount, record.fields?.currency)}`,
        "expected-close-date",
      )).join("")
    : '<div class="overview-empty">No open deals close in the next 30 days.</div>';
  const missingHtml = model.missingNextStep.length
    ? `<button class="focus-row incomplete" type="button" data-overview-target="missing-next-step">
        <i class="focus-signal incomplete" aria-hidden="true"></i>
        <span><strong>${model.missingNextStep.length}${model.missingNextStepPartial ? "+" : ""} deal${model.missingNextStep.length === 1 ? "" : "s"} need a next step</strong><small>Complete the plan before the next review</small></span>
        <span class="focus-action">View</span>
      </button>`
    : '<div class="overview-complete">Every loaded open deal has a next step.</div>';

  const barsHtml = model.activitySeries.map((item) => `
    <div class="activity-day">
      <span class="activity-bar"><i style="height:${item.height}%" title="${escapeHtml(`${item.label}: ${item.count}`)}"></i></span>
      <strong>${item.count}</strong><small>${escapeHtml(item.label)}</small>
    </div>`).join("");
  const mixHtml = model.activityMix.map((item) => `
    <span><i class="mix-dot ${escapeHtml(item.type)}"></i>${escapeHtml(item.type)} <strong>${item.count}</strong></span>`).join("");

  const wonHtml = model.closedWon.length
    ? model.closedWon.map((record) => `
      <button class="outcome-row" type="button" data-overview-record="${escapeHtml(record.id)}" data-overview-base="deals">
        <span class="outcome-mark" aria-hidden="true"><i data-lucide="trophy"></i></span>
        <span><strong>${escapeHtml(recordTitle(record))}</strong><small>${escapeHtml(displayValue(record.fields?.company))}</small></span>
        <b>${escapeHtml(formatMoney(record.fields?.amount, record.fields?.currency))}</b>
      </button>`).join("")
    : '<div class="overview-empty">Closed-won deals will appear here.</div>';
  const touchesHtml = model.recentTouches.length
    ? model.recentTouches.map((record) => `
      <button class="touch-row" type="button" data-overview-record="${escapeHtml(record.id)}" data-overview-base="activities">
        <span class="touch-type">${escapeHtml(choiceLabel("activities", "activity-type", record.fields?.["activity-type"]))}</span>
        <span><strong>${escapeHtml(recordTitle(record))}</strong><small>${escapeHtml(displayValue(record.fields?.company))}</small></span>
        <time>${escapeHtml(formatDate(record.fields?.["activity-date"]))}</time>
      </button>`).join("")
    : '<div class="overview-empty">Recent sales activity will appear here.</div>';

  return `
    <section class="overview-stat-strip" aria-label="Relationship momentum">${statHtml}</section>
    <section class="revenue-rail" aria-labelledby="revenueRailTitle">
      <header class="revenue-rail-head">
        <div><span class="eyebrow icon-label"><i data-lucide="chart-no-axes-column-increasing"></i>Pipeline pulse</span><h2 id="revenueRailTitle"><strong>${model.openDeals}</strong> open deals</h2></div>
        <div class="rail-values"><span class="icon-label"><i data-lucide="wallet-cards"></i>${model.openValuePartial ? "Loaded open value" : "Open value"}</span><div>${valueHtml}</div></div>
        <div class="rail-outcome"><span class="icon-label"><i data-lucide="trophy"></i>Closed outcomes</span><strong>${model.winRate == null ? "-" : `${model.winRate}%`}</strong><small>${model.wonDeals} won / ${model.lostDeals} lost</small></div>
      </header>
      <div class="revenue-track">${stageHtml}</div>
    </section>
    <div class="overview-work-grid">
      <section class="overview-section focus-section" aria-labelledby="todayFocusTitle">
        <header class="overview-section-head"><div><span class="eyebrow icon-label"><i data-lucide="list-todo"></i>Daily worklist</span><h2 id="todayFocusTitle">Today's focus</h2></div><span>${escapeHtml(model.dateLabel)}</span></header>
        <div class="focus-group"><div class="focus-group-head"><strong class="icon-label"><i data-lucide="alarm-clock"></i>Follow-ups due</strong><span>${model.dueActivities.length}${model.dueActivitiesPartial ? "+" : ""}</span></div>${dueHtml}</div>
        <div class="focus-group"><div class="focus-group-head"><strong class="icon-label"><i data-lucide="calendar-range"></i>Closing in 30 days</strong><span>${model.closingSoon.length}${model.closingSoonPartial ? "+" : ""}</span></div>${closingHtml}</div>
        <div class="focus-group"><div class="focus-group-head"><strong class="icon-label"><i data-lucide="clipboard-check"></i>Pipeline hygiene</strong></div>${missingHtml}</div>
      </section>
      <section class="overview-section activity-rhythm" aria-labelledby="activityRhythmTitle">
        <header class="overview-section-head"><div><span class="eyebrow icon-label"><i data-lucide="activity"></i>Last 7 days</span><h2 id="activityRhythmTitle">Activity rhythm</h2></div><span>${model.activityWindowPartial ? "Loaded window" : model.weekLabel}</span></header>
        <div class="activity-chart" aria-label="Activity count for each of the last seven days">${barsHtml}</div>
        <div class="activity-mix" aria-label="This week's activity types">${mixHtml}</div>
      </section>
    </div>
    <div class="overview-outcomes">
      <section class="overview-section" aria-labelledby="wonDealsTitle">
        <header class="overview-section-head"><div><span class="eyebrow icon-label"><i data-lucide="trophy"></i>Closed outcome</span><h2 id="wonDealsTitle">Won deals</h2></div><span>Loaded window</span></header>
        <div>${wonHtml}</div>
      </section>
      <section class="overview-section" aria-labelledby="touchesTitle">
        <header class="overview-section-head"><div><span class="eyebrow icon-label"><i data-lucide="messages-square"></i>Relationship motion</span><h2 id="touchesTitle">Recent touches</h2></div><button type="button" data-overview-target="activities">View all</button></header>
        <div>${touchesHtml}</div>
      </section>
    </div>`;
}
