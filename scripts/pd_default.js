/* Default */

document.addEventListener('wheel', function (event) {
    if (event.ctrlKey === true) {
        event.preventDefault();
    }
}, { passive: false });

document.addEventListener('keydown', function (event) {
    if (event.ctrlKey === true && (event.key === '+' || event.key === '-' || event.key === '0')) {
        event.preventDefault();
    }
});

function detectZoom() {
    if (window.devicePixelRatio !== 1) {
        let warning = document.getElementById('zoom-warning');
        if (!warning) {
            warning = document.createElement('div');
            warning.id = 'zoom-warning';
            warning.style.position = 'fixed';
            warning.style.bottom = '10px';
            warning.style.right = '10px';
            warning.style.background = 'rgba(0, 0, 0, 0.75)';
            warning.style.color = 'white';
            warning.style.fontFamily = 'Lato';
            warning.style.padding = '10px 20px';
            warning.style.borderRadius = '5px';
            warning.style.zIndex = '9999';
            warning.innerText = 'I would highly discourage you from zooming.';
            document.body.appendChild(warning);

            setTimeout(() => {
                warning.remove();
            }, 5000); // Auto-remove after 5 seconds
        }
    }
}

/*window.addEventListener('resize', detectZoom);
window.addEventListener('load', detectZoom);

var tooMuchZoomCount = 0;
var tooLessZoomCount = 0;

function tooMuchZoom() {
    if (window.devicePixelRatio > 2 && tooMuchZoomCount == 0) {
        tooMuchZoomCount += 1;
        alert("Are you trying to count my pixels?");
    }
}

function tooLessZoom() {
    if (window.devicePixelRatio < 0.5 && tooLessZoomCount == 0) {
        tooLessZoomCount += 1;
        alert("Zoomed out so far, you’re practically in another universe!");
    }
}

window.addEventListener('resize', tooMuchZoom);
window.addEventListener('resize', tooLessZoom);*/

/* Local Storage */

function openLastSection() {
    var lastVisitedSection = localStorage.getItem("lastVisitedSection");
    switch (lastVisitedSection) {
        case "home":
            openHome();
            break;
        case "news":
            openNews();
            break;
        case "showcase":
            openShowcase();
            break;
        case "services":
            openServices();
            break;
        case "information":
            openInformation();
            break;
        case "credits":
            openCredits();
            break;
        case "gallery":
            openGallery();
            break;
        case "ost":
            openOst();
            break;
        case "settings":
            openSettings();
            break;
        default:
            openHome();
            break;
    }
}

/* Navigation - Main */

var pdSections = document.querySelectorAll("section");

function closeAllSections() {
    pdSections.forEach(function (section) {
        section.style.display = "none";
    });
}

var buttons = [
    { button: document.getElementById("home-button"), section: document.getElementById("home-section"), openFunction: openHome },
    { button: document.getElementById("news-button"), section: document.getElementById("news-section"), openFunction: openNews },
    { button: document.getElementById("showcase-button"), section: document.getElementById("showcase-section"), openFunction: openShowcase },
    { button: document.getElementById("services-button"), section: document.getElementById("services-section"), openFunction: openServices },
    { button: document.getElementById("information-button"), section: document.getElementById("information-section"), openFunction: openInformation },
    { button: document.getElementById("credits-button"), section: document.getElementById("credits-section"), openFunction: openCredits },
    { button: document.getElementById("gallery-button"), section: document.getElementById("gallery-section"), openFunction: openGallery },
    { button: document.getElementById("ost-button"), section: document.getElementById("ost-section"), openFunction: openOst },
    { button: document.getElementById("settings-button"), section: document.getElementById("settings-section"), openFunction: openSettings }
];

function openHome() {
    closeAllSections();
    document.getElementById("home-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "home");
}

function openNews() {
    closeAllSections();
    document.getElementById("news-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "news");
}

function openShowcase() {
    closeAllSections();
    document.getElementById("showcase-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "showcase");
}

function openServices() {
    closeAllSections();
    document.getElementById("services-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "services");
}

function openInformation() {
    closeAllSections();
    document.getElementById("information-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "information");
}

function openCredits() {
    closeAllSections();
    document.getElementById("credits-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "credits");
}

function openGallery() {
    closeAllSections();
    document.getElementById("gallery-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "gallery");
}

function openOst() {
    closeAllSections();
    document.getElementById("ost-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "ost");
}

function openSettings() {
    closeAllSections();
    document.getElementById("settings-section").style.display = "block";
    localStorage.setItem("lastVisitedSection", "settings");
}

buttons.forEach(function (item) {
    item.button.addEventListener("click", function () {
        if (!item.button.querySelector(".nav-locked")) {
            item.openFunction();
        } else {
            console.log("This section is locked.");
        }
    });
});

/* Navigation - Socials */

var discordButton = document.getElementById("discord-button");
var robloxButton = document.getElementById("roblox-button");
var steamButton = document.getElementById("steam-button");
var youtubeButton = document.getElementById("youtube-button");

discordButton.addEventListener("click", function() {
    window.open("https://discord.gg/paddysdreamland");
});

robloxButton.addEventListener("click", function() {
    window.open("https://www.twitch.tv/paddysdreamland/about");
});

steamButton.addEventListener("click", function() {
    window.open("https://steamcommunity.com/groups/paddysdreamland");
});

youtubeButton.addEventListener("click", function() {
    window.open("https://www.youtube.com/@paddysdreamland");
});

/* Media */

function playSound(soundPath, soundVolume = 1) {
    if (!soundPath) {
        console.warn("Sound file not found or invalid.");
        return;
    }

    var newSound = new Audio(soundPath);
    newSound.volume = soundVolume;
    newSound.play();
}

document.querySelectorAll('button').forEach(function (button) {
    button.addEventListener('click', function () {
        playSound("ME_Sound/UI/ME_ProgressionTree_Nav.wav", 0.125)
    });
    button.addEventListener('mouseenter', function () {
        //playSound("sounds/ui/buttonrollover.wav", 1)
    });
});

document.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
        playSound("ME_Sound/UI/ME_ProgressionTree_Nav.wav", 0.125)
    });
    a.addEventListener('mouseenter', function () {
        //playSound("sounds/ui/buttonrollover.wav", 1)
    });
});

/* Sections */

const loreText = document.getElementById("lore-continuation");
const loreButton = document.getElementById("lore-button");

loreButton.addEventListener("click", function() {
    loreText.style.display = "flex";
    loreButton.style.display = "none";
});

/* Init */

document.addEventListener("DOMContentLoaded", function () {
    openLastSection();
});