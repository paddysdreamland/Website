document.addEventListener("DOMContentLoaded", async () => {
    function renderPost(post) {
        const container = document.createElement("div");
        container.className = "section-container";

        const header = document.createElement("h4");
        header.className = "section-header";
        header.textContent = `${post.postDate} — ${post.postHeader}`;
        container.appendChild(header);

        post.postBody.forEach(block => {
            if (block.type === "paragraph") {
                const p = document.createElement("p");
                p.className = "section-paragraph";
                p.innerHTML = block.content;
                container.appendChild(p);
            } else if (block.type === "bulletList") {
                const ul = document.createElement("ul");
                ul.className = "section-list";
                block.content.forEach(item => {
                    const li = document.createElement("li");
                    li.innerHTML = item;
                    ul.appendChild(li);
                });
                container.appendChild(ul);
            } else if (block.type === "audio") {
                const audio = document.createElement("audio");
                audio.controls = true;
                const source = document.createElement("source");
                source.src = block.src;
                source.type = "audio/mpeg";
                audio.appendChild(source);
                audio.appendChild(document.createTextNode("Your browser does not support the audio element."));
                container.appendChild(audio);
            }
        });

        const signature = document.createElement("p");
        signature.className = "section-signature";
        signature.textContent = `— ${post.postSignature}`;
        container.appendChild(signature);

        if (post.irrelevant) {
            const irrelevantHolder = document.createElement("div");
            irrelevantHolder.className = "news-irrelevant-holder";

            const irrelevantLabel = document.createElement("p");
            irrelevantLabel.className = "news-irrelevant";
            irrelevantLabel.innerHTML = "OUTDATED";

            container.appendChild(irrelevantHolder);
            irrelevantHolder.appendChild(irrelevantLabel);
        }

        return container;
    }

    let posts;
    try {
        const response = await fetch("pd_posts.php");
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        posts = await response.json();
    } catch (err) {
        console.error("Failed to load news posts:", err);
        return;
    }

    // The endpoint already returns visible posts, newest first.
    const [latest, ...previous] = posts;

    const latestHeader = document.querySelector("#news-section .main-header:nth-of-type(1)");
    const previousHeader = document.querySelector("#news-section .main-header:nth-of-type(2)");

    if (latestHeader && latest) {
        latestHeader.insertAdjacentElement("afterend", renderPost(latest));
    }

    if (previousHeader) {
        // Insert oldest first so repeated afterend inserts leave newest at the top.
        [...previous].reverse().forEach(post => {
            previousHeader.insertAdjacentElement("afterend", renderPost(post));
        });
    }

    const homeHeader = document.querySelector("#home-section .main-header:nth-of-type(2)");

    if (homeHeader && latest) {
        homeHeader.insertAdjacentElement("afterend", renderPost(latest));
    }
});
