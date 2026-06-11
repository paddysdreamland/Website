// ─── Config ───────────────────────────────────────────────────────────────
const CHANNEL = "paddysdreamland";
const FALLBACK_COLOR = "rgb(192, 192, 192)";
const MAX_MESSAGES = 20;

// ─── Helper Functions ───────────────────────────────────────────────────
const CHAT_SOUND = new Audio("sounds/buttonrollover.wav");
CHAT_SOUND.volume = 1;
CHAT_SOUND.currentTime = 0;

function playChatSound() {
    CHAT_SOUND.play().catch(() => {});
}

// Bots to hide from the overlay (case-insensitive)
const BOT_USERNAMES = new Set([
    "nightbot", "streamelements", "streamlabs", "soundalerts",
    "moobot", "fossabot", "wizebot", "deepbot"
]);

// Emote CDN templates
const TWITCH_EMOTE_URL = (id) =>
    `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;

// ─── Presence (JOIN) events ─────────────────────────────────────────────
const SHOW_PRESENCE       = true;   // master toggle for "someone wandered in"
const JOIN_GRACE_MS       = 2000;   // ignore the startup/reconnect JOIN flood
const PRESENCE_MIN_GAP_MS = 500;    // min spacing so bursts drift in, not dump

// {user} is replaced with the (lowercase) login. One is picked at random.
const PRESENCE_MESSAGES = [
    "{user}'s presence radiates through the stream",
    "{user} drifts into the dreamland",
    "{user} materializes among the stars",
    "a faint signal from {user} reaches the united planet",
    "{user} settles in beneath the two moons",
    "{user} phases quietly into orbit",
    "the dreamland senses {user} nearby",
    "{user} wanders in from the cosmos",
    "{user} tunes into the frequency",
    "somewhere in ventara, {user} blinks into view",
    "{user} slips through the atmosphere",
    "{user} arrives, trailing stardust",
    "a presence stirs — it's {user}",
    "{user} fades comfortably into the room",
];
// ─────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    const chatWrapper = document.getElementById("chat-wrapper");

    // ─── Presence state (closure scope — survives reconnects) ─────────────
    // announced: dedup + flood absorber. Lives out here so a dropped socket
    //   doesn't re-announce the whole audience on reconnect.
    // joinGraceUntil: re-armed inside ws.onopen on every (re)connect.
    const announced     = new Set();
    let   joinGraceUntil = 0;
    let   selfNick       = "";
    let   presenceQueue  = [];
    let   presenceTimer  = null;

    // ─── IRC Parsing ──────────────────────────────────────────────────────

    function parseIRCTags(raw) {
        const tags = {};
        raw.split(";").forEach(part => {
            const [key, ...rest] = part.split("=");
            tags[key] = rest.join("=");
        });
        return tags;
    }

    function parseMessage(line) {
        const tagMatch = line.match(/^@([^ ]+) /);
        const tags = tagMatch ? parseIRCTags(tagMatch[1]) : {};
        const rest = tagMatch ? line.slice(tagMatch[0].length) : line;

        const privmsgMatch = rest.match(/^:(\w+)!\w+@\S+ PRIVMSG #\S+ :(.+)$/);
        if (!privmsgMatch) return null;

        let message = privmsgMatch[2];
        let isAction = false;

        // /me action format: \x01ACTION text\x01
        const actionMatch = message.match(/^\x01ACTION (.+)\x01$/);
        if (actionMatch) {
            isAction = true;
            message = actionMatch[1];
        }

        return {
            platform:    "twitch",
            username:    tags["display-name"] || privmsgMatch[1],
            message,
            color:       tags["color"] || FALLBACK_COLOR,
            emotes:      tags["emotes"] || "",
            badges:      tags["badges"] || "",
            msgId:       tags["id"] || "",
            userId:      tags["user-id"] || "",
            isFirstMsg:  tags["first-msg"] === "1",
            isHighlight: tags["msg-id"] === "highlighted-message",
            bits:        parseInt(tags["bits"], 10) || 0,
            isAction,
        };
    }

    // ─── Emote Rendering ──────────────────────────────────────────────────

    // Twitch sends emotes as: emoteId:start-end,start-end/emoteId:start-end
    // We need to splice them into the message text as <img> tags.
    function renderMessageWithEmotes(message, emotesRaw) {
        if (!emotesRaw) {
            return [{ type: "text", value: message }];
        }

        // Build a flat list of { start, end, id } ranges
        const ranges = [];
        emotesRaw.split("/").forEach(emoteBlock => {
            const [id, positions] = emoteBlock.split(":");
            if (!positions) return;
            positions.split(",").forEach(range => {
                const [start, end] = range.split("-").map(Number);
                ranges.push({ start, end, id });
            });
        });

        // Sort by start position so we can walk through linearly
        ranges.sort((a, b) => a.start - b.start);

        // Twitch uses code-point indices, not UTF-16 indices.
        // Convert to a code-point array first to handle emoji safely.
        const codePoints = Array.from(message);
        const parts = [];
        let cursor = 0;

        for (const { start, end, id } of ranges) {
            if (start > cursor) {
                parts.push({
                    type: "text",
                    value: codePoints.slice(cursor, start).join("")
                });
            }
            parts.push({
                type: "emote",
                id,
                name: codePoints.slice(start, end + 1).join("")
            });
            cursor = end + 1;
        }

        if (cursor < codePoints.length) {
            parts.push({
                type: "text",
                value: codePoints.slice(cursor).join("")
            });
        }

        return parts;
    }

    // ─── Badge Rendering ──────────────────────────────────────────────────

    // Badges format: broadcaster/1,subscriber/12,bits/100
    // Real badge images require the badge URL list from Helix; for an MVP we
    // use simple text/symbol fallbacks. Replace with image URLs later when you
    // wire up the Helix badge list endpoint.
    // Explicit image paths for badges we render locally (no Helix involvement)
    const BADGE_LOCAL = {
        youtube: "images/badges/youtube.png",
    };

    const BADGE_MISSING = "images/badges/missing.png";

    function renderBadges(badgesRaw) {
        if (!badgesRaw) return [];
        return badgesRaw.split(",").map(b => {
            const [name, version] = b.split("/");
            const localUrl = BADGE_LOCAL[name];
            const cached = BADGE_CACHE[name]?.[version];
            return {
                name,
                version,
                url:   localUrl || cached?.url_2x || BADGE_MISSING,
                title: localUrl ? name : (cached?.title || `${name}/${version}`),
            };
        });
    }

    // ─── DOM Building ─────────────────────────────────────────────────────
    // Two-helper entrance, nested INSIDE one flex child so the flex layout is
    // never touched:
    //   .msg-slot        (outer, the flex child) — vertical OPEN via max-height,
    //                     which the column-reverse stack turns into an upward push.
    //   .msg-slot-inner  (inner) — horizontal SLIDE; the fully-assembled message
    //                     flies in from off the left edge. overflow stays visible.
    // max-height is measured per message (not a fixed 9999px) so the open
    // animates over the full duration instead of snapping.
    function appendToChat(wrapper) {
        const slot = document.createElement("div");
        slot.classList.add("msg-slot");

        const inner = document.createElement("div");
        inner.classList.add("msg-slot-inner");
        inner.appendChild(wrapper);
        slot.appendChild(inner);
        chatWrapper.prepend(slot);

        // Read the assembled message's natural height (forces layout) and feed
        // it to the open. overflow is visible, so this is unaffected by max-height.
        const h = wrapper.offsetHeight;
        if (h > 0) slot.style.setProperty("--open-h", h + "px");

        // Once the open finishes, drop the cap so the row tracks natural height
        // (guards against any later reflow being clipped by a stale max-height).
        slot.addEventListener("animationend", function done(e) {
            if (e.animationName === "slot-open") {
                slot.style.maxHeight = "none";
                slot.removeEventListener("animationend", done);
            }
        });

        while (chatWrapper.children.length > MAX_MESSAGES) {
            chatWrapper.removeChild(chatWrapper.lastChild);
        }
    }

    function addMessage(data) {
        if (BOT_USERNAMES.has(data.username.toLowerCase())) return;

        playChatSound();

        const msgWrapper = document.createElement("div");
        msgWrapper.classList.add("msg-wrapper");
        msgWrapper.dataset.msgId = data.msgId;
        msgWrapper.dataset.userId = data.userId;
        msgWrapper.dataset.username = data.username.toLowerCase();
        msgWrapper.style.borderLeftColor = data.color;
        msgWrapper.style.setProperty("--msg-user-color", data.color);

        if (data.isHighlight)  msgWrapper.classList.add("msg-highlight");
        if (data.isFirstMsg)   msgWrapper.classList.add("msg-firstmsg");
        if (data.isAction)     msgWrapper.classList.add("msg-action");
        if (data.bits > 0)     msgWrapper.classList.add("msg-bits");

        // Badges
        const badges = renderBadges(data.badges);
        const badgeContainer = document.createElement("span");
        badgeContainer.classList.add("msg-badges");
        badges.forEach(b => {
            const img = document.createElement("img");
            img.classList.add("msg-badge", "msg-badge-img", `msg-badge-${b.name}`);
            img.src = b.url;
            img.alt = b.title;
            img.title = b.title;
            badgeContainer.appendChild(img);
        });

        // Author line
        const author = document.createElement("div");
        author.classList.add("msg-author", "text", "bold");

        if (badges.length) author.appendChild(badgeContainer);

        const nameSpan = document.createElement("span");
        nameSpan.classList.add("msg-username");
        nameSpan.textContent = data.username;
        nameSpan.style.color = data.color;
        author.appendChild(nameSpan);

        // First-msg badge tag
        if (data.isFirstMsg) {
            const firstTag = document.createElement("span");
            firstTag.classList.add("msg-firstmsg-tag");
            firstTag.textContent = "FIRST TIME";
            author.appendChild(firstTag);
        }

        // Bits indicator
        if (data.bits > 0) {
            const bitsTag = document.createElement("span");
            bitsTag.classList.add("msg-bits-tag");
            bitsTag.textContent = `+${data.bits} Bits`;
            author.appendChild(bitsTag);
        }

        // Content with emotes interleaved
        const content = document.createElement("div");
        content.classList.add("msg-content", "text");
        //if (data.isAction) content.style.color = data.color;

        const parts = renderMessageWithEmotes(data.message, data.emotes);
        parts.forEach(part => {
            if (part.type === "text") {
                content.appendChild(document.createTextNode(part.value));
            } else {
                const img = document.createElement("img");
                img.classList.add("msg-emote");
                img.src = TWITCH_EMOTE_URL(part.id);
                img.alt = part.name;
                img.title = part.name;
                content.appendChild(img);
            }
        });

        msgWrapper.appendChild(author);
        msgWrapper.appendChild(content);

        appendToChat(msgWrapper);
    }

    // ─── Moderation Handling ──────────────────────────────────────────────

    function handleClearChat(line) {
        // :tmi.twitch.tv CLEARCHAT #channel :username   → user timed out/banned
        // :tmi.twitch.tv CLEARCHAT #channel             → entire chat cleared
        const match = line.match(/CLEARCHAT #\S+(?: :(.+))?$/);
        if (!match) return;

        const targetUser = match[1];
        if (!targetUser) {
            // Full chat clear
            Array.from(chatWrapper.querySelectorAll(".msg-wrapper"))
                .forEach(el => el.classList.add("msg-deleted"));
            return;
        }

        // Mark all messages from that user as deleted
        const target = targetUser.toLowerCase();
        chatWrapper.querySelectorAll(`.msg-wrapper[data-username="${target}"]`)
            .forEach(el => el.classList.add("msg-deleted"));
    }

    function handleClearMsg(line) {
        // @login=user;target-msg-id=UUID :tmi.twitch.tv CLEARMSG #channel :text
        const tagMatch = line.match(/^@([^ ]+) /);
        if (!tagMatch) return;
        const tags = parseIRCTags(tagMatch[1]);
        const targetId = tags["target-msg-id"];
        if (!targetId) return;

        const el = chatWrapper.querySelector(`.msg-wrapper[data-msg-id="${targetId}"]`);
        if (el) el.classList.add("msg-deleted");
    }

    // ─── Presence Handling ────────────────────────────────────────────────

    function handleJoin(line) {
        if (!SHOW_PRESENCE) return;

        const m = line.match(/^:(\w+)!\w+@\S+ JOIN #/);
        if (!m) return;

        const login = m[1].toLowerCase();
        if (login === selfNick) return;        // our own justinfan join
        if (BOT_USERNAMES.has(login)) return;  // same bot filter as addMessage
        if (announced.has(login)) return;      // already greeted this session
        announced.add(login);               // record even during grace…

        if (Date.now() < joinGraceUntil) return;  // …but stay silent in the flood

        presenceQueue.push(login);
        if (!presenceTimer) drainPresence();
    }

    function drainPresence() {
        const login = presenceQueue.shift();
        if (login === undefined) { presenceTimer = null; return; }
        announcePresence(login);
        presenceTimer = setTimeout(drainPresence, PRESENCE_MIN_GAP_MS);
    }

    function announcePresence(login) {
        playChatSound();

        const template = PRESENCE_MESSAGES[
            Math.floor(Math.random() * PRESENCE_MESSAGES.length)
        ];

        const wrapper = document.createElement("div");
        wrapper.classList.add("msg-wrapper", "presence-event");
        wrapper.dataset.username = login;

        const lineEl = document.createElement("div");
        lineEl.classList.add("presence-text", "text");

        // Split on {user} and drop a styled span where the name goes.
        const segments = template.split("{user}");
        segments.forEach((seg, i) => {
            if (seg) lineEl.appendChild(document.createTextNode(seg));
            if (i < segments.length - 1) {
                const userSpan = document.createElement("span");
                userSpan.classList.add("presence-user");
                userSpan.textContent = login;   // kept lowercase, by design
                lineEl.appendChild(userSpan);
            }
        });

        wrapper.appendChild(lineEl);
        appendToChat(wrapper);
    }

    // ─── Log Events ───────────────────────────────────────────────────────
    // System notices rendered inline in the chat stream. Mirrors the templates:
    //   <div class="msg-wrapper log-event log-hint">
    //     <div class="msg-icon"></div>
    //     <div class="msg-content">…</div>
    //   </div>
    // Levels: "hint" | "warn" | "error".
    const LOG_LEVELS = new Set(["hint", "warn", "error"]);

    // Captured up front so renderLog (and the console mirror below) never route
    // their own output back through a patched console — that would recurse.
    const ORIG_CONSOLE = {
        log:   console.log.bind(console),
        warn:  console.warn.bind(console),
        error: console.error.bind(console),
    };

    // DOM-only: builds and inserts the notice. Does NOT touch the console, so
    // it's safe to call from inside the console mirror.
    function renderLog(level, message) {
        if (!LOG_LEVELS.has(level)) level = "hint";

        playChatSound();

        const wrapper = document.createElement("div");
        wrapper.classList.add("msg-wrapper", "log-event", `log-${level}`);

        const icon = document.createElement("div");
        icon.classList.add("msg-icon");

        const content = document.createElement("div");
        content.classList.add("msg-content");
        content.textContent = message;

        wrapper.appendChild(icon);
        wrapper.appendChild(content);
        appendToChat(wrapper);
    }

    // Public API: echo to the real console at matching severity, then render.
    function logEvent(level, message) {
        if (!LOG_LEVELS.has(level)) {
            ORIG_CONSOLE.warn(`logEvent: unknown level "${level}" — defaulting to "hint"`);
            level = "hint";
        }
        const echo = level === "error" ? ORIG_CONSOLE.error
                   : level === "warn"  ? ORIG_CONSOLE.warn
                   :                     ORIG_CONSOLE.log;
        echo(`[${level}] ${message}`);
        renderLog(level, message);
    }

    // ─── Console mirror ───────────────────────────────────────────────────
    // When on, real console.log / warn / error also surface in the overlay.
    // log → hint, warn → warn, error → error. The original console still runs
    // first (devtools + OBS log keep their copy); we only ADD the overlay node.
    const MIRROR_CONSOLE = true;

    // Stringify console args the way devtools roughly would, so objects/Errors
    // don't render as "[object Object]".
    function formatLogArgs(args) {
        return args.map(a => {
            if (typeof a === "string") return a;
            if (a instanceof Error)    return a.stack || `${a.name}: ${a.message}`;
            try { return JSON.stringify(a); } catch { return String(a); }
        }).join(" ");
    }

    if (MIRROR_CONSOLE) {
        // Re-entrancy guard: if rendering itself logs (or throws and something
        // logs), we don't want to spawn another overlay node mid-render.
        let mirroring = false;

        const mirror = (origFn, level) => (...args) => {
            origFn(...args);                 // always keep native behaviour
            if (mirroring) return;
            mirroring = true;
            try {
                renderLog(level, formatLogArgs(args));
            } catch (e) {
                ORIG_CONSOLE.error("console mirror failed:", e);
            } finally {
                mirroring = false;
            }
        };

        console.log   = mirror(ORIG_CONSOLE.log,   "hint");
        console.warn  = mirror(ORIG_CONSOLE.warn,  "warn");
        console.error = mirror(ORIG_CONSOLE.error, "error");
    }

    // ─── Global error capture ─────────────────────────────────────────────
    // The console mirror only sees what flows through console.*. Uncaught
    // exceptions and rejected promises are printed by the browser engine
    // itself and never call console.error, so they'd slip past. These window
    // handlers catch them and route them into the overlay as error notices.
    // We go through ORIG_CONSOLE.error (not the patched console.error) so the
    // real devtools/OBS log still gets its native copy, and renderLog draws
    // the node directly — avoiding a double render via the mirror.
    window.addEventListener("error", (event) => {
        // Resource load failures (img/script/link) fire here too, but with no
        // .error object and the failed element as the target.
        if (event.error) {
            const e = event.error;
            const where = event.filename
                ? ` (${event.filename}:${event.lineno}:${event.colno})`
                : "";
            ORIG_CONSOLE.error("Uncaught", e);
            renderLog("error", `Uncaught ${e.stack || `${e.name}: ${e.message}`}${where}`);
        } else if (event.target && event.target !== window) {
            const el = event.target;
            const src = el.src || el.href || "(unknown)";
            ORIG_CONSOLE.error("Resource failed to load:", src);
            renderLog("error", `Failed to load ${el.tagName.toLowerCase()}: ${src}`);
        } else {
            ORIG_CONSOLE.error("Error:", event.message);
            renderLog("error", event.message || "Unknown error");
        }
    }, true); // capture phase — resource errors don't bubble

    window.addEventListener("unhandledrejection", (event) => {
        const r = event.reason;
        const text = r instanceof Error ? (r.stack || `${r.name}: ${r.message}`)
                   : typeof r === "string" ? r
                   : (() => { try { return JSON.stringify(r); } catch { return String(r); } })();
        ORIG_CONSOLE.error("Unhandled promise rejection:", r);
        renderLog("error", `Unhandled rejection: ${text}`);
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
            ORIG_CONSOLE.error("fetch failed:", url, e);
            renderLog("error", `Network request failed: ${url} — ${e.message}`);
            throw e;
        }
    };

    // WebSocket: wrap the constructor so every socket reports a failed
    // connection with its URL (the raw "error" event carries no detail, by
    // design). We use addEventListener so we never clobber a caller's own
    // onerror/onmessage handlers — this is purely additive.
    const ORIG_WEBSOCKET = window.WebSocket;
    window.WebSocket = function (...args) {
        const ws = new ORIG_WEBSOCKET(...args);
        ws.addEventListener("error", () => {
            ORIG_CONSOLE.error("WebSocket error:", args[0]);
            renderLog("error", `WebSocket connection failed: ${args[0]}`);
        });
        return ws;
    };
    // Preserve the prototype + readyState statics so `instanceof WebSocket`
    // and `WebSocket.OPEN`/`.CLOSED` etc. still resolve correctly.
    window.WebSocket.prototype = ORIG_WEBSOCKET.prototype;
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach((k) => {
        window.WebSocket[k] = ORIG_WEBSOCKET[k];
    });

    // Console/OBS convenience aliases.
    window.logEvent = logEvent;

    // ─── Dev: manual presence trigger (safe to delete before release) ─────
    // From the OBS source / browser console:
    //   testPresence()             → random sample name
    //   testPresence("paddy")   → specific name
    // Or press Ctrl+Alt+P in a focused browser tab.
    // Calls announcePresence directly, so it ignores the grace window, the
    // dedup Set, and the bot filter — it always renders.
    const PRESENCE_TEST_NAMES = [
        "paddy", "stardust_wanderer", "moonlit_lurker", "cozy_viewer",
    ];

    function firePresenceTest(name) {
        const login = (name || PRESENCE_TEST_NAMES[
            Math.floor(Math.random() * PRESENCE_TEST_NAMES.length)
        ]).toLowerCase();
        announcePresence(login);
        return `presence fired for "${login}"`;
    }

    window.testPresence = firePresenceTest;

    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.altKey && e.code === "KeyP") {
            e.preventDefault();
            firePresenceTest();
        }
    });

    // ─── WebSocket Connection ─────────────────────────────────────────────

    function connect() {
        const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");

        ws.onopen = () => {
            selfNick = `justinfan${Math.floor(Math.random() * 99999)}`;
            joinGraceUntil = Date.now() + JOIN_GRACE_MS;  // re-armed each connect
            ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
            ws.send("PASS SCHMOOPIIE");
            ws.send(`NICK ${selfNick}`);
            ws.send(`JOIN #${CHANNEL}`);
        };

        ws.onmessage = (event) => {
            const lines = event.data.trim().split("\r\n");

            for (const line of lines) {
                if (line.startsWith("PING")) {
                    ws.send("PONG :tmi.twitch.tv");
                    continue;
                }

                if (line.includes("PRIVMSG")) {
                    const parsed = parseMessage(line);
                    if (parsed) addMessage(parsed);
                } else if (line.includes("CLEARCHAT")) {
                    handleClearChat(line);
                } else if (line.includes("CLEARMSG")) {
                    handleClearMsg(line);
                } else if (line.includes(" JOIN #")) {
                    handleJoin(line);
                }
            }
        };

        ws.onclose = () => {
            console.warn("Twitch IRC disconnected. Reconnecting in 5 seconds…");
            setTimeout(connect, 5000);
        };

        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
            ws.close();
        };
    }

    let BADGE_CACHE = {};

    async function init() {
        try {
            const r = await fetch("badges.json");
            // fetch only rejects on network failure, NOT on 404/500 — the
            // browser logs "GET ... 404" itself but never throws, so check.
            if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
            BADGE_CACHE = await r.json();
        } catch (e) {
            console.warn("badges.json missing. Using \"missing texture\" as fallback.");
            console.warn(e);
        }
        connect();
    }

    init();

    let ytReconnectDelay = 5000;

    function connectYouTubeRelay() {
        const ws = new WebSocket("ws://localhost:7898");

        ws.onopen = () => {
            console.log("YouTube relay connected.");
            ytReconnectDelay = 5000;
        };

        ws.onmessage = (event) => {
            try {
                addMessage(JSON.parse(event.data));
            } catch (e) {
                console.error("Bad YouTube relay payload.");
                console.warn(e);
            }
        };

        ws.onclose = () => {
            setTimeout(connectYouTubeRelay, ytReconnectDelay);
            ytReconnectDelay = Math.min(ytReconnectDelay * 1.5, 60000);
        };

        // The browser logs "WebSocket connection ... failed" itself, but that
        // raw line can't be intercepted — so surface our own overlay notice
        // here, where we actually have the event.
        ws.onerror = () => {
            console.warn(`YouTube relay unavailable. Retrying in ${Math.round(ytReconnectDelay / 1000)} seconds...`);
            ws.close();
        };
    }

    connectYouTubeRelay();
});