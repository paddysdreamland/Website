// ─── Wallpaper Slideshow ──────────────────────────────────────────────────
// Cycles #wallpaper-holder through images/slideshow/, crossfading between them.
//
// Driven by the layer system rather than running on its own: it starts when the
// "wallpaper" layer goes on and stops when it goes off. That matters because
// #wallpaper-holder is display:none when the layer is off - CSS stops animating
// a hidden subtree, but a setInterval does not stop on its own, so without this
// the page would keep decoding 3MB PNGs for a wallpaper nobody is looking at,
// in every scene.
//
// Two slots, not one. Assigning background-image straight onto a single element
// is a hard cut, and a visible blank frame the first time an image is used
// because the swap happens before the bytes arrive. Instead the back slot loads
// and decodes the next picture while the front one is still up, then they
// crossfade and trade places.

// The folder is the source of truth - images/slideshow/list.php globs it and
// answers JSON. Reached without the .php because the root .htaccess rewrites
// extensionless paths; asking for list.php directly would 301 here anyway.
const SLIDESHOW_LIST = "images/slideshow/list";

// How long each picture stays up, and how long the crossfade takes. The fade is
// the only part that costs anything continuous: on the s&box panel every
// animating frame is a full-texture upload, so a slow fade on a long interval
// (a few percent of the time spent animating) is very different from a short
// interval with a long fade.
const SLIDE_MS = 120000;
const FADE_MS = 4000;

// Shuffle so a stream that sits on this scene twice does not open with the same
// picture both times.
const SHUFFLE = true;

// ─────────────────────────────────────────────────────────────────────────────

let images = [];      // filenames from the listing, in the order we'll show them
let cursor = 0;
let slots = [];       // the two .slide elements
let front = 0;        // index into slots of the one currently visible
let timer = null;
let started = false;  // whether the first picture is up yet

function shuffled(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

async function loadList() {
    try {
        const r = await fetch(SLIDESHOW_LIST);
        // fetch only rejects on network failure, NOT on 404/500 - the browser
        // logs "GET ... 404" itself but never throws, so check.
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);

        const list = await r.json();
        if (!Array.isArray(list) || !list.length) throw new Error("no images in the folder");

        images = SHUFFLE ? shuffled(list) : list.slice();
    } catch (e) {
        // Warned, not thrown: no wallpaper is a much better failure than a dead
        // overlay, and jte_log.js puts this on screen as a card.
        console.warn(`Slideshow: ${SLIDESHOW_LIST} unavailable, wallpaper disabled. ${e.message}`);
        images = [];
    }
}

/// Load and decode before showing it. decode() is what stops the swap landing
/// on a half-painted image - without it the first showing of any picture can
/// flash, because the crossfade starts before the bytes are there.
async function paint(slot, file) {
    const url = `images/slideshow/${encodeURIComponent(file)}`;

    try {
        const img = new Image();
        img.src = url;
        await img.decode();
    } catch {
        // A missing or corrupt file shouldn't stall the rotation - let the
        // background-image below fail on its own and move on next tick.
        console.warn(`Slideshow: could not decode ${file}`);
        return false;
    }

    slot.style.backgroundImage = `url("${url}")`;
    return true;
}

async function advance() {
    if (images.length === 0) return;

    const file = images[cursor % images.length];
    cursor++;

    // First picture goes straight onto the visible slot - there is nothing to
    // fade from, and fading in from blank just delays the wallpaper appearing.
    if (!started) {
        if (await paint(slots[front], file)) started = true;
        return;
    }

    const back = 1 - front;
    if (!(await paint(slots[back], file))) return;

    // The class swap is the crossfade; the transition lives in the stylesheet.
    slots[back].classList.add("is-front");
    slots[front].classList.remove("is-front");
    front = back;
}

function start() {
    if (timer !== null || images.length === 0) return;

    advance();
    timer = setInterval(advance, SLIDE_MS);
}

function stop() {
    if (timer === null) return;

    clearInterval(timer);
    timer = null;
}

// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
    slots = [...document.querySelectorAll("#wallpaper-holder .slide")];

    if (slots.length < 2) {
        console.warn("Slideshow: #wallpaper-holder needs two .slide children to crossfade between.");
        return;
    }

    front = Math.max(0, slots.findIndex(s => s.classList.contains("is-front")));

    await loadList();

    // The layer may already be on by the time the listing lands.
    if (document.getElementById("wallpaper-holder")?.classList.contains("active")) start();
});

// jte_layers.js announces the active set whenever the hash changes, which is
// how a scene switch reaches us.
window.addEventListener("overlay:layers", (e) => {
    const active = e.detail?.active ?? [];
    if (active.includes("wallpaper")) start();
    else stop();
});
