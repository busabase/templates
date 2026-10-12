import { updateChrome } from "./chrome.js";
import { renderEpisodesWorkspace } from "./episodes.js";
import { renderListAndDetail } from "./list-detail.js";
import { renderOverview } from "./overview.js";
import { DETAIL_MODES } from "./router.js";
import { $, store } from "./store.js";

// Body state for the shared record-view layout in base-ui.css: `ws-detail-open`
// whenever a record is shown, plus exactly one mode class.
function syncLayoutState() {
  const onRecordView = store.view !== "overview";
  const open = onRecordView && Boolean(store.selectedId);
  const mode = DETAIL_MODES[store.view];
  const body = document.body.classList;
  body.toggle("ws-detail-open", open);
  body.toggle("ws-detail-page", open && store.presentation === "page");
  body.toggle("ws-detail-drawer", open && store.presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && mode === "split" && store.presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(store.query));
  body.add("ws-has-mobile-bar");
  $("overviewPage").hidden = onRecordView;
  $("viewPage").hidden = !onRecordView;
}

export function render() {
  if (!store.state) return;
  syncLayoutState();
  updateChrome();
  if (store.view === "overview") renderOverview();
  else if (store.view === "episodes") renderEpisodesWorkspace();
  else renderListAndDetail();
}
