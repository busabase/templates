const STORAGE_KEY = "b2b-crm:overview-entrance:v1";
const EASE_OUT = "cubic-bezier(0.2, 0, 0, 1)";

let playedInMemory = false;

export function parseCountText(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^([\d,]+)(.*)$/);
  if (!match) return { target: 0, suffix: "", text };
  return {
    target: Number(match[1].replaceAll(",", "")) || 0,
    suffix: match[2] || "",
    text,
  };
}

export const easeOutCubic = (progress) => 1 - ((1 - progress) ** 3);

const hasPlayed = () => {
  if (playedInMemory) return true;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const markPlayed = () => {
  playedInMemory = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Sandboxed embeds may deny storage; the in-memory guard still prevents replay.
  }
};

const animateOnce = (element, keyframes, options) => {
  if (!element?.animate) return null;
  const animation = element.animate(keyframes, { fill: "both", ...options });
  animation.finished.then(() => animation.cancel()).catch(() => {});
  return animation;
};

const animateCounts = (elements) => {
  const values = elements.map((element, index) => ({
    element,
    index,
    ...parseCountText(element.dataset.value || element.textContent),
  }));
  for (const value of values) value.element.textContent = "0";

  const startedAt = performance.now();
  const duration = 650;
  const tick = (now) => {
    let running = false;
    for (const value of values) {
      const delay = 40 + (value.index * 50);
      const elapsed = now - startedAt - delay;
      if (elapsed < 0) {
        running = true;
        continue;
      }
      const progress = Math.min(1, elapsed / duration);
      const current = Math.round(value.target * easeOutCubic(progress));
      value.element.textContent = progress === 1 ? value.text : String(current);
      if (progress < 1) running = true;
    }
    if (running && values.every((value) => value.element.isConnected)) {
      requestAnimationFrame(tick);
    } else {
      for (const value of values) value.element.textContent = value.text;
    }
  };
  requestAnimationFrame(tick);
};

export function playOverviewEntrance(root) {
  if (!root?.isConnected || hasPlayed()) return false;
  markPlayed();
  root.dataset.entrance = "running";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.visibilityState === "hidden") {
    root.dataset.entrance = "done";
    return false;
  }
  if (reducedMotion) {
    animateOnce(root, [{ opacity: 0.88 }, { opacity: 1 }], {
      duration: 120,
      easing: EASE_OUT,
    });
    root.dataset.entrance = "done";
    return true;
  }

  const cards = [...root.querySelectorAll(".overview-stat")];
  cards.forEach((card, index) => {
    animateOnce(card, [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], {
      duration: 260,
      delay: index * 50,
      easing: EASE_OUT,
    });
  });
  animateCounts(cards.map((card) => card.querySelector(".overview-stat-value")).filter(Boolean));

  [...root.querySelectorAll(".rail-stage > i > b")].forEach((bar, index) => {
    bar.style.transformOrigin = "left center";
    animateOnce(bar, [
      { opacity: 0.55, transform: "scaleX(0)" },
      { opacity: 1, transform: "scaleX(1)" },
    ], {
      duration: 420,
      delay: 160 + (index * 24),
      easing: EASE_OUT,
    });
  });

  [...root.querySelectorAll(".activity-bar > i")].forEach((bar, index) => {
    bar.style.transformOrigin = "bottom center";
    animateOnce(bar, [
      { opacity: 0.5, transform: "scaleY(0)" },
      { opacity: 1, transform: "scaleY(1)" },
    ], {
      duration: 360,
      delay: 250 + (index * 30),
      easing: EASE_OUT,
    });
  });

  [...root.querySelectorAll(".overview-section")].forEach((panel, index) => {
    animateOnce(panel, [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], {
      duration: 240,
      delay: 210 + (index * 24),
      easing: EASE_OUT,
    });
  });

  setTimeout(() => {
    if (root.isConnected) root.dataset.entrance = "done";
  }, 900);
  return true;
}
