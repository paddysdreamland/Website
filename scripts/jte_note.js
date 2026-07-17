// ─── Config ───────────────────────────────────────────────────────────────
// Editable note card. The text is typed into a native prompt on the PC (opened
// by the OSC note button) and arrives here on the control channel as an
// "overlay:note" event — so this module owns no socket of its own.
//
// The markup's own text is left alone until a note actually arrives, so the
// hard-coded default in the HTML stays put on a fresh setup. An empty note
// hides the card.
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const wrap = document.getElementById("note-wrapper");
    const text = document.getElementById("note-message");
    if (!wrap || !text) return;

    window.addEventListener("overlay:note", (e) => {
        const s = ((e.detail && e.detail.text) || "").trim();
        if (!s) { wrap.style.display = "none"; return; }
        text.textContent = s;
        wrap.style.display = "";
    });
});
