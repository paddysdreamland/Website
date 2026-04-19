// ─── Config ───────────────────────────────────────────────────────────────
const CHANNEL = "paddysdreamland"; // lowercase channel name
const MAX_MESSAGES = 20;
const FALLBACK_COLOR = "rgb(128, 128, 128)";
// ─────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    const chatWrapper = document.getElementById("chat-wrapper");

    function parseIRCTags(raw) {
        // Parses the @key=value;key=value prefix into an object
        const tags = {};
        raw.split(";").forEach(part => {
            const [key, ...rest] = part.split("=");
            tags[key] = rest.join("=");
        });
        return tags;
    }

    function parseMessage(line) {
        // Full IRCv3 line format:
        // @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :message text
        const tagMatch = line.match(/^@([^ ]+) /);
        const tags = tagMatch ? parseIRCTags(tagMatch[1]) : {};

        const rest = tagMatch ? line.slice(tagMatch[0].length) : line;

        const privmsgMatch = rest.match(/^:(\w+)!\w+@\S+ PRIVMSG #\S+ :(.+)$/);
        if (!privmsgMatch) return null;

        return {
            username: privmsgMatch[1],
            message:  privmsgMatch[2],
            color:    tags["color"] || FALLBACK_COLOR,
        };
    }

    function addMessage({ username, message, color }) {
        const overlay = document.getElementById("chat-nomsg-overlay");
        if (overlay && !overlay.classList.contains("fade-out")) {
            overlay.classList.add("fade-out");
        }

        const msgWrapper = document.createElement("div");
        msgWrapper.classList.add("msg-wrapper");

        const author = document.createElement("div");
        author.classList.add("msg-author", "text", "bold");
        author.textContent = username;
        author.style.color = color;

        const content = document.createElement("div");
        content.classList.add("msg-content", "text");
        content.textContent = message;

        msgWrapper.appendChild(author);
        msgWrapper.appendChild(content);

        // chat-wrapper is column-reverse, so prepend puts it at the visual bottom
        chatWrapper.prepend(msgWrapper);

        // Enforce message cap — remove oldest (last child in the DOM)
        while (chatWrapper.children.length > MAX_MESSAGES) {
            chatWrapper.removeChild(chatWrapper.lastChild);
        }
    }

    function connect() {
        const ws = new WebSocket("wss://irc-ws.chat.twitch.tv");

        ws.onopen = () => {
            ws.send("CAP REQ :twitch.tv/tags");          // request IRCv3 tags (colors etc.)
            ws.send("PASS SCHMOOPIIE");                   // anonymous pass placeholder
            ws.send(`NICK justinfan${Math.floor(Math.random() * 99999)}`);
            ws.send(`JOIN #${CHANNEL}`);
        };

        ws.onmessage = (event) => {
            const lines = event.data.trim().split("\r\n");

            for (const line of lines) {
                // Keep the connection alive
                if (line.startsWith("PING")) {
                    ws.send("PONG :tmi.twitch.tv");
                    continue;
                }

                // Only care about chat messages
                if (!line.includes("PRIVMSG")) continue;

                const parsed = parseMessage(line);
                if (parsed) addMessage(parsed);
            }
        };

        ws.onclose = () => {
            // Reconnect after 5 seconds if the connection drops
            console.warn("Twitch IRC disconnected — reconnecting in 5s…");
            setTimeout(connect, 5000);
        };

        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
            ws.close();
        };
    }

    connect();
});