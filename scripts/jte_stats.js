// ─── Config ───────────────────────────────────────────────────────────────
// Renders live viewer/follower counts pushed by the OverlayControl helper.
// The counts arrive on the control channel (jte_control.js) and are relayed
// here as an "overlay:stats" event, so this module owns no socket of its own.
const STATS_STALE_MS = 150000;  // no update in this long (2.5 polls) → N/A

// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const viewersEl   = document.getElementById("viewer-count");
    const followersEl = document.getElementById("follower-count");
    if (!viewersEl && !followersEl) return;

    let staleTimer = null;

    const fmt = (n) =>
        typeof n === "number" ? n.toLocaleString("en-US") : "N/A";

    function setStale() {
        if (viewersEl)   viewersEl.textContent   = "N/A";
        if (followersEl) followersEl.textContent = "N/A";
    }

    function armStale() {
        clearTimeout(staleTimer);
        staleTimer = setTimeout(setStale, STATS_STALE_MS);
    }

    window.addEventListener("overlay:stats", (e) => {
        const { viewers, followers } = e.detail || {};
        if (viewersEl   && viewers   != null) viewersEl.textContent   = fmt(viewers);
        if (followersEl && followers != null) followersEl.textContent = fmt(followers);
        armStale();
    });

    // If the control channel drops (helper stopped), stop trusting the frozen
    // numbers after a while.
    window.addEventListener("overlay:retry", armStale);
});
