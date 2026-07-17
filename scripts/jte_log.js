// ─── Config ───────────────────────────────────────────────────────────────
// Shared CAPTURE layer — load this FIRST on every overlay page.
//
// It patches console.*, the global error handlers, and the fetch/WebSocket
// primitives at parse time (before any other script opens a socket), then emits
// each event two ways:
//   • locally  — as an "overlay:log" event, which the chat overlay renders
//   • onto the bus — via jte_control.js, so logs from OTHER overlay pages land
//     in the chat overlay too. One on-stream console for the whole system.
//
// Pages are separate browser sources, so they share no DOM — the control
// WebSocket is the only thing that can carry a log across that boundary.
//
// This file does NOT render anything. The renderer lives in jte_twitch_chat.js.
const LOG_BACKLOG_MAX = 50;   // early events held until a renderer is ready

(() => {
    // Which page is this? Tags every log so the chat overlay can show "[music]".
    // jte_chatwidget.html → "chatwidget", jte_music.html → "music", etc.
    const SOURCE = (() => {
        const file = location.pathname.split("/").pop() || "overlay";
        return file.replace(/\.html?$/i, "").replace(/^jte[_-]/, "") || "overlay";
    })();
    window.OVERLAY_SOURCE = SOURCE;

    // Captured up front so nothing we print re-enters the patched console.
    const ORIG = {
        log:   console.log.bind(console),
        warn:  console.warn.bind(console),
        error: console.error.bind(console),
    };
    window.ORIG_CONSOLE = ORIG;

    // Events emitted before a renderer exists (e.g. a parse-time error) would
    // dispatch into the void. Hold them until the renderer drains the backlog.
    const backlog = [];
    let buffering = true;

    function emit(level, message, publish = true) {
        const payload = { type: "log", source: SOURCE, level, message };

        if (buffering) {
            backlog.push(payload);
            if (backlog.length > LOG_BACKLOG_MAX) backlog.shift();
        }

        window.dispatchEvent(new CustomEvent("overlay:log", { detail: payload }));
        if (publish && window.overlayPublish) window.overlayPublish(payload);
    }

    // The renderer calls this once at startup: returns held events and stops
    // buffering (from then on it just listens for "overlay:log").
    window.overlayLogDrain = () => {
        buffering = false;
        return backlog.splice(0, backlog.length);
    };

    // Public API: echo to the real console at matching severity, then emit.
    window.logEvent = (level, message) => {
        const echo = level === "error" ? ORIG.error
                   : level === "warn"  ? ORIG.warn
                   :                     ORIG.log;
        echo(`[${level}] ${message}`);
        emit(level, message);
    };

    // Local-only: render on THIS page's chat overlay (if any) but never cross
    // the bus. For per-page operational chatter that every page produces
    // independently — the control channel's own connect/disconnect, an OSC
    // retry landing on all pages — where publishing would show one duplicate
    // card per page. Echoes via ORIG so devtools still gets it (bypassing the
    // patched console avoids re-entering the mirror, which would publish).
    window.overlayLogLocal = (level, message) => {
        const echo = level === "error" ? ORIG.error
                   : level === "warn"  ? ORIG.warn
                   :                     ORIG.log;
        echo(message);
        emit(level, message, false);
    };

    // ─── Console mirror ───────────────────────────────────────────────────
    // log → hint, warn → warn, error → error. The original console still runs
    // first (devtools + OBS log keep their copy); we only ADD the overlay event.

    // Stringify console args the way devtools roughly would, so objects/Errors
    // don't come out as "[object Object]".
    function formatArgs(args) {
        return args.map(a => {
            if (typeof a === "string") return a;
            if (a instanceof Error)    return a.stack || `${a.name}: ${a.message}`;
            try { return JSON.stringify(a); } catch { return String(a); }
        }).join(" ");
    }

    // Re-entrancy guard: if emitting itself logs (or throws and something logs),
    // we don't want to spawn another event mid-emit.
    let mirroring = false;

    const mirror = (origFn, level) => (...args) => {
        origFn(...args);                 // always keep native behaviour
        if (mirroring) return;
        mirroring = true;
        try {
            emit(level, formatArgs(args));
        } catch (e) {
            ORIG.error("console mirror failed:", e);
        } finally {
            mirroring = false;
        }
    };

    console.log   = mirror(ORIG.log,   "hint");
    console.warn  = mirror(ORIG.warn,  "warn");
    console.error = mirror(ORIG.error, "error");

    // ─── Global error capture ─────────────────────────────────────────────
    // The console mirror only sees what flows through console.*. Uncaught
    // exceptions and rejected promises are printed by the browser engine itself
    // and never call console.error, so they'd slip past. We go through ORIG
    // (not the patched console) so devtools keeps its native copy and we emit
    // exactly once.
    window.addEventListener("error", (event) => {
        // Resource load failures (img/script/link) fire here too, but with no
        // .error object and the failed element as the target.
        if (event.error) {
            const e = event.error;
            const where = event.filename
                ? ` (${event.filename}:${event.lineno}:${event.colno})`
                : "";
            ORIG.error("Uncaught", e);
            emit("error", `Uncaught ${e.stack || `${e.name}: ${e.message}`}${where}`);
        } else if (event.target && event.target !== window) {
            const el = event.target;
            const src = el.src || el.href || "(unknown)";
            ORIG.error("Resource failed to load:", src);
            emit("error", `Failed to load ${el.tagName.toLowerCase()}: ${src}`);
        } else {
            ORIG.error("Error:", event.message);
            emit("error", event.message || "Unknown error");
        }
    }, true); // capture phase — resource errors don't bubble

    window.addEventListener("unhandledrejection", (event) => {
        const r = event.reason;
        const text = r instanceof Error ? (r.stack || `${r.name}: ${r.message}`)
                   : typeof r === "string" ? r
                   : (() => { try { return JSON.stringify(r); } catch { return String(r); } })();
        ORIG.error("Unhandled promise rejection:", r);
        emit("error", `Unhandled rejection: ${text}`);
    });

    // ─── Network primitive wrappers ───────────────────────────────────────
    // fetch() and WebSocket failures are logged by the browser's network stack
    // as red lines no page handler can intercept. We can't silence those, but
    // wrapping the primitives once here makes every failure ALSO surface in the
    // overlay — so call sites don't each have to remember error handling.

    // fetch: ONLY a network-level failure rejects (DNS, offline, refused, CORS).
    // A 404/500 still RESOLVES, so HTTP status stays the caller's concern
    // (check res.ok). We log the reject, then re-throw so existing try/catch
    // blocks keep behaving exactly as before.
    const ORIG_FETCH = window.fetch.bind(window);
    window.fetch = async (...args) => {
        try {
            return await ORIG_FETCH(...args);
        } catch (e) {
            const req = args[0];
            const url = typeof req === "string" ? req
                      : req && req.url ? req.url
                      : "(unknown)";
            ORIG.error("fetch failed:", url, e);
            emit("error", `Network request failed: ${url} — ${e.message}`);
            throw e;
        }
    };

    // WebSocket: wrap the constructor so every socket reports a failed
    // connection with its URL (the raw "error" event carries no detail, by
    // design). addEventListener, so we never clobber a caller's own handlers.
    // Deduped by URL so a socket retrying every 30s doesn't stamp a fresh error
    // card each attempt: emit ONCE when a URL first fails, stay silent while
    // it's still down, clear the flag when it next opens (each script's own
    // onopen announces the recovery).
    const ORIG_WEBSOCKET = window.WebSocket;
    const wsDown = new Set();
    window.WebSocket = function (...args) {
        const url = String(args[0]);
        const ws = new ORIG_WEBSOCKET(...args);
        ws.addEventListener("open", () => { wsDown.delete(url); });
        ws.addEventListener("error", () => {
            if (wsDown.has(url)) return;   // already reported this outage
            wsDown.add(url);
            ORIG.error("WebSocket error:", url);
            // The control bus is the log transport itself; every page sees its
            // own copy drop, so keep that failure local — publishing it would
            // stamp one duplicate card per page.
            emit("error", `Connection failed: ${url}`, url !== window.OVERLAY_BUS_URL);
        });
        return ws;
    };
    // Preserve the prototype + readyState statics so `instanceof WebSocket`
    // and `WebSocket.OPEN`/`.CLOSED` etc. still resolve correctly.
    window.WebSocket.prototype = ORIG_WEBSOCKET.prototype;
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach((k) => {
        window.WebSocket[k] = ORIG_WEBSOCKET[k];
    });
})();
