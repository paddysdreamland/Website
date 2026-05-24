document.addEventListener("DOMContentLoaded", async () => {
    const docs = document.querySelectorAll("document");

    for (const el of docs) {
        const file = el.getAttribute("file");
        if (!file) continue;

        try {
            const res = await fetch(file);
            const text = await res.text();
            el.innerHTML = text;

            // Re-execute any <script> tags that came in via innerHTML
            el.querySelectorAll("script").forEach(oldScript => {
                const newScript = document.createElement("script");
                for (const attr of oldScript.attributes) {
                    newScript.setAttribute(attr.name, attr.value);
                }
                newScript.textContent = oldScript.textContent;
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
        } catch (e) {
            console.error("Include failed for", file, e);
        }
    }
});