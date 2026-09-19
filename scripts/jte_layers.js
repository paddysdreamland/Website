// ─── Hash Layers ──────────────────────────────────────────────────────────
// Lets whoever embeds this page choose which optional layers are on, by URL:
//
//   .../jte_chat#layers=chat
//   .../jte_chat#layers=chat,wallpaper
//
// Why the hash and not a query string: changing only the fragment is a
// same-document navigation, so the page is NOT reloaded. That matters because
// the s&box panel keeps one browser alive across scene changes - a reload would
// throw away the chat scrollback, the control socket and the Twitch IRC
// connection, which is exactly what that persistence exists to prevent. A
// "?layers=" would reload every time and undo all of it. Verified against
// Steam's HTML surface: the socket survives a fragment change untouched.
//
// OBS does not need this - it has a Custom CSS box and can just restyle the
// page directly. s&box has no equivalent (no user CSS, no script injection),
// so the URL is the only channel it has, and this is it.
//
// Tip: always put a fragment on EVERY variant, including the plain one
// (#layers=chat rather than no hash at all). Fragment-to-fragment is the
// transition that has actually been tested; going from a hash to no hash has
// not, and it costs nothing to stay on the tested path.

// ─── Layer table ──────────────────────────────────────────────────────────
// layer name -> { "element-id": "class class ...", ... }
//
// The elements are expected to already be in the page, hidden or shown by
// default in CSS. All this does is add a class to them. Classes are ADDED to
// whatever is already there, never assigned over the top - jte_twitch_chat.js
// is adding and removing its own classes on these nodes constantly and must
// not be disturbed.
//
// One thing worth knowing about the default "hidden" state: prefer
// display:none for anything that moves. A display:none subtree is not
// rendered, so its CSS animations stop and requestAnimationFrame stops firing
// for it. visibility:hidden and opacity:0 are still rendered - an animated
// layer parked either of those ways keeps running and keeps dirtying the
// surface, which on the s&box panel means a full-texture upload every frame in
// scenes that do not even show it. <video> is the exception to all of it: it
// keeps decoding while hidden, so pause it explicitly rather than trusting CSS.
const LAYERS = {
    // The base content. Nothing to switch on - the chat is simply always there
    // - but "#layers=chat" is the recommended spelling for a plain scene, so it
    // has to be a layer the table knows about or every load warns about it.
    chat: {},

    // Template. Uncomment once those elements exist, otherwise it warns on
    // every load about the ones it cannot find.
    //
    wallpaper: {
        "wallpaper-holder": "active",
    },
};

// ─────────────────────────────────────────────────────────────────────────────

// Exactly the [element, class] pairs added on the last pass. Tracked rather
// than re-derived, for two reasons. Overlapping layers: if two active layers
// both add the same class to the same element, removing "layer A's classes"
// when leaving A would strip one that B still wants. And editing LAYERS while
// the page is live can't strand a class that is no longer in the table.
let applied = [];

function activeLayers() {
    const params = new URLSearchParams(location.hash.slice(1));
    return (params.get("layers") || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
}

function applyLayers() {
    // DOMContentLoaded will call this again with a document to work on. Without
    // the guard an early hashchange would warn about elements that merely have
    // not been parsed yet.
    if (document.readyState === "loading") return;

    // Remove everything we put on last time, then recompute from scratch. The
    // whole-set rebuild is what makes overlapping layers safe.
    for (const [el, cls] of applied) el.classList.remove(cls);
    applied = [];

    for (const name of activeLayers()) {
        const def = LAYERS[name];

        // Warned rather than ignored: a typo in a scene's URL would otherwise
        // be a layer that silently never appears. console.warn is mirrored by
        // jte_log.js, so this surfaces as a card on the overlay itself - and on
        // the s&box panel, which is the one place with no devtools to open.
        if (!def) {
            console.warn(`Unknown layer "${name}" in ${location.hash}`);
            continue;
        }

        for (const [id, cls] of Object.entries(def)) {
            const el = document.getElementById(id);
            if (!el) {
                console.warn(`Layer "${name}": no element #${id} to put "${cls}" on.`);
                continue;
            }

            // Split so an entry may name more than one class; classList throws
            // on a string containing a space rather than splitting it.
            for (const one of cls.split(/\s+/).filter(Boolean)) {
                el.classList.add(one);
                applied.push([el, one]);
            }
        }
    }
}

// hashchange is the whole point - it fires without reloading. The initial call
// matters just as much: the hash is already there on first load.
window.addEventListener("hashchange", applyLayers);
document.addEventListener("DOMContentLoaded", applyLayers);

// Manual trigger for testing without changing scene: setLayers("chat,wallpaper")
window.setLayers = (list) => { location.hash = `layers=${list}`; };
