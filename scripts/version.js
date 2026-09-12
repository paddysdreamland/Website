fetch("/version.json")
    .then((res) => res.json())
    .then((data) => {
        document.querySelectorAll(".version-date").forEach((el) => {
            el.textContent = data.version;
        });
    })
    .catch((err) => console.error("Failed to load version.json", err));
