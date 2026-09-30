/* Image Viewer */

// Full-screen viewer for gallery blocks. Call openImageViewer(images, index) with
// images as [{ src, caption? }]; the strip at the bottom lists every image passed in.

const iv = {
    images: [],
    index: 0
};

function openImageViewer(images, index) {
    if (!images || images.length === 0) return;

    iv.images = images;
    iv.index = 0;

    const nav = document.getElementById("iv-nav");
    nav.replaceChildren();
    images.forEach((image, i) => {
        const thumb = document.createElement("button");
        thumb.className = "iv-nav-image";
        thumb.title = image.caption || "";
        // JSON.stringify quotes and escapes the path, so it can't break out of url("...").
        thumb.style.backgroundImage = `url(${JSON.stringify(image.src)})`;
        thumb.addEventListener("click", () => showViewerImage(i));
        nav.appendChild(thumb);
    });

    document.getElementById("iv-holder1").style.display = "";
    showViewerImage(index || 0);
}

function closeImageViewer() {
    document.getElementById("iv-holder1").style.display = "none";
    document.getElementById("iv-image").removeAttribute("src");
}

function showViewerImage(index) {
    const count = iv.images.length;
    iv.index = (index + count) % count; // wrap around at both ends
    const image = iv.images[iv.index];

    const img = document.getElementById("iv-image");
    img.src = image.src;
    img.alt = image.caption || "";

    document.getElementById("iv-caption").textContent = image.caption || "";
    document.getElementById("iv-counter").textContent = `${iv.index + 1} / ${count}`;
    // Only ever link out to http(s), never e.g. a javascript: URL from bad data.
    const url = new URL(image.src, window.location.href);
    document.getElementById("iv-original").href = (url.protocol === "https:" || url.protocol === "http:") ? url.href : "#";

    const single = count < 2;
    document.getElementById("iv-prev").style.display = single ? "none" : "";
    document.getElementById("iv-next").style.display = single ? "none" : "";
    document.querySelector(".iv-nav1").style.display = single ? "none" : "";

    document.querySelectorAll("#iv-nav .iv-nav-image").forEach((thumb, i) => {
        thumb.classList.toggle("iv-nav-image-active", i === iv.index);
        if (i === iv.index) thumb.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
}

/* Init */

document.addEventListener("DOMContentLoaded", function () {
    const holder = document.getElementById("iv-holder1");

    document.getElementById("iv-close").addEventListener("click", closeImageViewer);
    document.getElementById("iv-prev").addEventListener("click", () => showViewerImage(iv.index - 1));
    document.getElementById("iv-next").addEventListener("click", () => showViewerImage(iv.index + 1));

    // Clicking the dimmed backdrop (not the viewer itself) closes it.
    holder.addEventListener("click", (event) => {
        if (event.target === holder) closeImageViewer();
    });

    document.addEventListener("keydown", (event) => {
        if (holder.style.display === "none") return;
        if (event.key === "Escape") closeImageViewer();
        else if (event.key === "ArrowLeft") showViewerImage(iv.index - 1);
        else if (event.key === "ArrowRight") showViewerImage(iv.index + 1);
    });
});
