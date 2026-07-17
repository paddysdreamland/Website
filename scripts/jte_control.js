// ─── Config ───────────────────────────────────────────────────────────────
// Control channel to the OverlayControl helper — the bus every overlay page
// shares. Separate OBS browser sources have no DOM in common, so this socket is
// the only thing that can carry a message between them.
//
// Inbound  (helper → this page):
//   {cmd:"retry"}       → "overlay:retry"       (Stream Deck OSC button)
//   {type:"chat"}       → "overlay:chat"        (YouTube chat message)
//   {type:"heartrate"}  → "overlay:heartrate"  (live BPM)
//   {type:"stats"}      → "overlay:stats"       (viewer/follower counts)
//   {type:"nowplaying"} → "overlay:nowplaying"  (foobar2000 track change)
//   {type:"nowplaying-request"} → "overlay:nowplaying-request"  ("!np" in chat)
//   {type:"note"}       → "overlay:note"        (text typed via the OSC prompt)
//   {type:"log"}        → "overlay:log"         (a log from ANOTHER overlay)
//
// Outbound (this page → helper → every other page):
//   overlayPublish(msg) — jte_log.js ships this page's logs to the chat overlay;
//   jte_twitch_chat.js ships "!np" to whichever page holds the music toast.
const CONTROL_URL       = "ws://localhost:8770";
const CONTROL_RETRY_MS  = 10000;   // keep the control channel warm
const PUBLISH_QUEUE_MAX = 50;      // outbound messages held while disconnected

// Tell jte_log.js which URL is the bus, so it keeps this socket's own failures
// local (they're per-page facts about shared infrastructure — see below).
window.OVERLAY_BUS_URL = CONTROL_URL;

// This page's own control-channel chatter (connect, retry received, bad payload)
// is something EVERY page produces independently, so it's logged locally only —
// publishing it would show one duplicate card per overlay page.
const localLog = (level, message) =>
    (window.overlayLogLocal || (() => {}))(level, message);

// ─── Publish (module scope: must exist before jte_log.js emits) ────────────
let controlWs = null;
const outbox = [];

window.overlayPublish = (msg) => {
    const data = JSON.stringify(msg);
    if (controlWs && controlWs.readyState === WebSocket.OPEN) {
        controlWs.send(data);
    } else {
        // Helper down / not connected yet — hold it so early errors still reach
        // the chat overlay once the bus comes up.
        outbox.push(data);
        if (outbox.length > PUBLISH_QUEUE_MAX) outbox.shift();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    let timer = null;

    const relay = (name, detail) =>
        window.dispatchEvent(new CustomEvent(name, { detail }));

    function fireRetry() {
        window.dispatchEvent(new CustomEvent("overlay:retry"));
    }

    function connect() {
        clearTimeout(timer);
        const ws = new WebSocket(CONTROL_URL);
        controlWs = ws;

        ws.onopen = () => {
            localLog("hint", "Overlay control connected.");
            while (outbox.length && ws.readyState === WebSocket.OPEN) {
                ws.send(outbox.shift());
            }
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.cmd === "retry") {
                    localLog("hint", "Retry signal received.");
                    fireRetry();
                } else if (msg.type === "chat") {
                    relay("overlay:chat", msg);         // → jte_twitch_chat.js
                } else if (msg.type === "heartrate") {
                    relay("overlay:heartrate", msg);    // → jte_heartrate.js
                } else if (msg.type === "stats") {
                    relay("overlay:stats", msg);        // → jte_stats.js
                } else if (msg.type === "nowplaying") {
                    relay("overlay:nowplaying", msg);   // → jte_music.js
                } else if (msg.type === "nowplaying-request") {
                    // "!np" from chat, on another page → replay the toast here.
                    relay("overlay:nowplaying-request", msg);
                } else if (msg.type === "note") {
                    relay("overlay:note", msg);         // → jte_note.js
                } else if (msg.type === "log") {
                    // A log from another overlay page. The helper never echoes a
                    // message back to its sender, so this is always remote —
                    // no risk of double-rendering our own logs.
                    relay("overlay:log", msg);          // → jte_twitch_chat.js
                }
            } catch (e) {
                localLog("error", `Bad control payload: ${e.message}`);
            }
        };

        ws.onclose = () => {
            timer = setTimeout(connect, CONTROL_RETRY_MS);
        };

        ws.onerror = () => ws.close();
    }

    // Manual trigger for testing without the helper: overlayRetry() in the
    // console, or Ctrl+Alt+R in a focused browser tab.
    window.overlayRetry = fireRetry;
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.altKey && e.code === "KeyR") {
            e.preventDefault();
            fireRetry();
        }
    });

    connect();
});
