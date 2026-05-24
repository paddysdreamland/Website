document.addEventListener("DOMContentLoaded", () => {
    const newsSection = document.getElementById("news-section");

    function renderPost(id, post) {
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

    // Sort post keys by date, newest first (optional)
    const sortedKeys = Object.keys(newsPosts).sort((a, b) => {
        const dateA = new Date(newsPosts[a].postDate);
        const dateB = new Date(newsPosts[b].postDate);
        return dateB - dateA;
    });

    // Inject all posts
    const latestHeader = document.querySelector("#news-section .main-header:nth-of-type(1)");
    const previousHeader = document.querySelector("#news-section .main-header:nth-of-type(2)");

    const visiblePosts = sortedKeys.filter(k => !newsPosts[k].hidden);
    const [latestKey, ...previousKeys] = visiblePosts;

    if (latestHeader && latestKey) {
        const post = renderPost(latestKey, newsPosts[latestKey]);
        latestHeader.insertAdjacentElement("afterend", post);
    }

    if (previousHeader) {
        [...previousKeys].reverse().forEach(key => {
            const post = renderPost(key, newsPosts[key]);
            previousHeader.insertAdjacentElement("afterend", post);
        });
    }

    const homeHeader = document.querySelector("#home-section .main-header:nth-of-type(2)");

    if (homeHeader && latestKey) {
        const homePost = renderPost(latestKey, newsPosts[latestKey]);
        homeHeader.insertAdjacentElement("afterend", homePost);
    }
});