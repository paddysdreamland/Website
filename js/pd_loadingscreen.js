window.addEventListener("load", function () {
    const loadingHolder = document.getElementById("loading-holder");
    const loadingIcon = this.document.getElementById("loading-icon");

    loadingHolder.classList = "loading-holder-fade";
    loadingIcon.remove();

    loadingHolder.addEventListener("animationend", () => {
        loadingHolder.remove();
    });
});