// ─── Config ───────────────────────────────────────────────────────────────
// Music toast: renders foobar2000 now-playing (via OverlayControl → beefweb).
// This owns the DATA + VISIBILITY only — all motion lives in your CSS, driven
// by the `.show` class and the `data-state` attribute on `.toast-wrapper`:
//     .toast-wrapper           → hidden / resting
//     .toast-wrapper.show      → on screen
//     .toast-wrapper[data-state="playing" | "paused"]
const TOAST_HOLD_MS    = 8000;          // time on screen after an update
const NP_LABEL_PLAYING = "Now Playing:";
const NP_LABEL_PAUSED  = "Paused:";
const REPLAY_COOLDOWN_MS = 4000;        // min gap between !nowplaying replays

// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const wrap     = document.querySelector(".toast-wrapper");
    const albumEl  = document.getElementById("toast-album-image");
    const albumBg  = document.getElementById("toast-album-image-bg");
    const npEl     = document.getElementById("toast-now-playing");
    const titleEl  = document.getElementById("toast-title");
    const artistEl = document.getElementById("toast-artist");
    const albumTx  = document.getElementById("toast-album");
    const lengthEl = document.getElementById("toast-length");
    if (!wrap) return;

    let hideTimer   = null;
    let current     = null;   // last non-stopped payload, for !nowplaying replay
    let lastReplay  = 0;

    const setText = (el, v) => { if (el) el.textContent = v || ""; };

    const setArt = (el, art) => {
        if (!el) return;
        if (art) el.style.backgroundImage = `url("${art}")`;
        else     el.style.removeProperty("background-image");
    };

    function show() {
        clearTimeout(hideTimer);
        wrap.classList.remove("hide");
        wrap.classList.add("show");
        hideTimer = setTimeout(hide, TOAST_HOLD_MS);
    }

    function hide() {
        clearTimeout(hideTimer);
        // Only play the exit animation if it was actually on screen — otherwise
        // a "stopped"/load event would run the reverse anim from a resting toast.
        if (!wrap.classList.contains("show")) return;
        wrap.classList.remove("show");
        wrap.classList.add("hide");
    }

    function render(d) {
        if (!d || d.state === "stopped") { current = null; hide(); return; }

        current = d;
        wrap.dataset.state = d.state || "playing";
        setText(npEl, d.state === "paused" ? NP_LABEL_PAUSED : NP_LABEL_PLAYING);
        setText(titleEl,  d.title);
        setText(artistEl, d.artist);
        setText(albumTx,  d.album);
        setText(lengthEl, d.length);

        setArt(albumEl, d.art);   // foreground cover
        setArt(albumBg, d.art);   // background (for your blur/bleed effect)

        show();
    }

    window.addEventListener("overlay:nowplaying", (e) => render(e.detail));

    // Chat "!nowplaying" → replay the open animation for the current track.
    // Restarts the animation even if the toast is already on screen, and
    // rate-limits so viewers can't machine-gun it.
    function replay() {
        if (!current) return;                      // nothing playing → no-op
        const now = Date.now();
        if (now - lastReplay < REPLAY_COOLDOWN_MS) return;
        lastReplay = now;

        wrap.classList.remove("show");
        void wrap.offsetWidth;                     // reflow so the anim restarts
        render(current);
    }

    window.addEventListener("overlay:nowplaying-request", replay);
    window.replayToast = replay;                   // manual trigger for testing

    // ─── Dev: preview the toast without foobar running ────────────────────
    //   testToast()          → playing sample
    //   testToast("paused")  → paused sample
    //   testToast("stopped") → dismiss
    // Or press Ctrl+Alt+M. `artUrl` optional to preview real cover art.
    window.testToast = (state = "playing", artUrl = "") => {
        render({
            type: "nowplaying", state,
            artist: "Sample Artist", title: "Sample Title Goes Here",
            album: "Sample Album", length: "3:57", art: artUrl,
        });
        return `toast: ${state}`;
    };
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.altKey && e.code === "KeyF") {
            e.preventDefault();
            window.testToast();
        }
    });
});
