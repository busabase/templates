// A detail recheck may finish after navigation or a global refresh. Apply only
// to the same live selection/snapshot; late responses never replace newer data.
export async function recheckIdea({ load, isCurrent, apply }) {
  const idea = await load();
  if (!isCurrent()) return false;
  apply(idea);
  return true;
}

// Attention totals describe the loaded Ideas. The workspace total comes from
// records.count and must survive a one-Idea refresh, even on a partial page.
export function applyRecheckedIdea(snapshot, updated) {
  snapshot.ideas = snapshot.ideas.map((idea) => idea.record_id === updated.record_id ? updated : idea);
  snapshot.counts = {
    ...snapshot.counts,
    needsAnswer: snapshot.ideas.filter((idea) => idea.attention === "needs_answer").length,
    readyForAgent: snapshot.ideas.filter((idea) => idea.attention === "ready_for_agent").length,
    parked: snapshot.ideas.filter((idea) => idea.attention === "parked").length,
  };
}
