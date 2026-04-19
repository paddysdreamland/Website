splashMessages = [

];

function getRandomMessage() {
    const randomIndex = Math.floor(Math.random() * splashMessages.length);
    return splashMessages[randomIndex];
}

function updateSplashText() {
    const splashText = document.getElementById("splash-text");
    const holderWidth = document.getElementById("splash-holder").offsetWidth;

    splashText.innerHTML = getRandomMessage();

    const textWidth = splashText.offsetWidth;
    const duration = (textWidth + holderWidth) / 50;

    splashText.style.animationDuration = `${duration}s`;
    splashText.classList.remove("splash-text-move");
    void splashText.offsetWidth;
    splashText.classList.add("splash-text-move");

    setTimeout(updateSplashText, duration * 1000);
}

updateSplashText();