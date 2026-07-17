// ─── Config ───────────────────────────────────────────────────────────────
// Heart-rate readout. BPM arrives on the shared control channel (jte_control.js)
// as an "overlay:heartrate" event — the BLE connection lives in the OverlayHub
// helper, so this module owns no socket of its own.
const HR_STALE_MS   = 8000;   // no beat for this long → hide the readout
const HR_SHOW_PULSE = true;   // pulse the ♥ in time with the heartbeat

// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const el      = document.getElementById("heart-rate");
    const wrapper = document.getElementById("heart-rate-wrapper");
    if (!el) return;

    let staleTimer = null;

    function armStale() {
        clearTimeout(staleTimer);
        staleTimer = setTimeout(setStale, HR_STALE_MS);
    }

    function setBpm(bpm) {
        el.textContent = `${bpm}`;
        el.classList.add("has-pulse");
        if (HR_SHOW_PULSE) {
            // One full pulse per beat: 60 / bpm seconds.
            el.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`);
        }
        if (wrapper) wrapper.style.display = "";
        armStale();
    }

    function setStale() {
        clearTimeout(staleTimer);
        el.textContent = "0";
        el.classList.remove("has-pulse");
        el.style.removeProperty("--beat");
        if (wrapper) wrapper.style.display = "none";
    }

    window.addEventListener("overlay:heartrate", (e) => {
        const bpm = e.detail && e.detail.bpm;
        if (bpm == null || bpm <= 0) setStale();
        else setBpm(bpm);
    });

    setStale();   // start hidden until the first live beat arrives
});
