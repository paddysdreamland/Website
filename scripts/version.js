const CHANGELOG_ENTRY_LIMIT = 5;
const CHANGELOG_MORE_URL = "https://github.com/paddysdreamland/Website/tree/Release";

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

fetch("/version.json")
    .then((res) => res.json())
    .then((data) => {
        const el = document.getElementById("git-version");
        if (el) el.textContent = data.version;
    })
    .catch((err) => console.error("Failed to load version.json", err));

const changelogEl = document.getElementById("git-changelog");
if (changelogEl) {
    fetch("/changelog.json")
        .then((res) => res.json())
        .then((entries) => {
            const shown = entries.slice(0, CHANGELOG_ENTRY_LIMIT);

            const entriesHtml = shown.map((entry) => {
                const bullets = entry.body
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => /^[-*•]\s+/.test(line))
                    .map((line) => line.replace(/^[-*•]\s+/, ""));

                const list = bullets.length
                    ? `<ul class="changelog-bullets">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
                    : "";

                return `<div class="changelog-entry">
                    <div class="changelog-entry-header">
                        <span class="changelog-version">${escapeHtml(entry.version)}</span>
                        <span class="changelog-date">${escapeHtml(entry.date)}</span>
                    </div>
                    <div class="changelog-subject">${escapeHtml(entry.subject)}</div>
                    ${list}
                </div>`;
            }).join("");

            const moreHtml = `<div class="changelog-more"><a href="${CHANGELOG_MORE_URL}" target="_blank" rel="noopener">See more changes on GitHub</a></div>`;

            changelogEl.innerHTML = entriesHtml + moreHtml;
        })
        .catch((err) => console.error("Failed to load changelog.json", err));
}
