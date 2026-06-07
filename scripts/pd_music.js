const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const musicButton = document.getElementById("music-start");
const musicTransition = document.getElementById("music-transition");
const musicReset = document.getElementById("music-reset");
const musicDownload = document.getElementById("music-download");

var trackName;
var trackNameClean;

const trackSelector = document.getElementById("track-selector");
const loadingIndicator = document.getElementById("volume-loading");

const volumeBars = [
    document.getElementById("volume-bar1"),
    document.getElementById("volume-bar2"),
    document.getElementById("volume-bar3"),
    document.getElementById("volume-bar4"),
    document.getElementById("volume-bar5"),
    document.getElementById("volume-bar6"),
    document.getElementById("volume-bar7"),
    document.getElementById("volume-bar8")
];

var alreadyPlaying = false;
var trackLength;
let gainNodes = [];
let sourceNodes = [];
var loopAnchorTime = 0;   // audioContext time at which the current loop's position 0 occurred
var currentTrackBPM = null;

const volumeLoadingBar = document.getElementById("volume-loading-bar");
const volumeLoadingPercentage = document.getElementById("volume-loading-percentage");
var loadPercentage = 0;

async function loadAudio(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    loadPercentage += 12.5;
    volumeLoadingBar.style.width = parseInt(loadPercentage) + "%";
    volumeLoadingPercentage.innerHTML = parseInt(loadPercentage) + "%";

    return await audioContext.decodeAudioData(arrayBuffer);
}

function populateTrackSelector() {
    const missionNames = ["BackInTheGame", "Benefactor", "Family", "Flytrap", "Gridnodes", "Kingdom", "PrisonerX", "Release", "Sanctuary", "Savant", "Shard", "TopOfTheWorld", "Vive"];

    const layerSelectors = [
        document.getElementById("layers-selector1"),
        document.getElementById("layers-selector2"),
        document.getElementById("layers-selector3"),
        document.getElementById("layers-selector4")
    ];

    for (const category in music) {
        for (const district in music[category]) {
            const groupLabel = missionNames.includes(district) ? "Mission" : "District";
            const titleOption = document.createElement("option");
            titleOption.text = `${groupLabel}: ${district}`;
            titleOption.disabled = true;
            titleOption.style.fontWeight = "bold";
            titleOption.style.color = "gray";

            trackSelector.appendChild(titleOption);
            layerSelectors.forEach(layerSelector => layerSelector.appendChild(titleOption.cloneNode(true)));

            for (const track in music[category][district]) {
                const option = document.createElement("option");
                option.value = `${category}.${district}.${track}`;
                //option.text = `ME_Sound/Music/${category}/${district}/${track}`;
                option.text = `${track}`;
                
                trackSelector.appendChild(option);
                layerSelectors.forEach(layerSelector => layerSelector.appendChild(option.cloneNode(true)));
            }
        }
    }
}

function getBPMFromTrackName(trackName) {
    const bpmMatch = trackName.match(/(\d+_?\d*)BPM/);
    return bpmMatch ? parseFloat(bpmMatch[1].replace("_", ".")) : null;
}

// Colors a select's track options by how their BPM relates to a reference BPM:
// green = exact match, yellow = half/double, red = anything else. Options without a
// BPM (district/mission headers) are left untouched; a null reference clears coloring.
function colorSelectorByBPM(selectorElement, referenceBPM) {
    Array.from(selectorElement.options).forEach(option => {
        const optionBPM = getBPMFromTrackName(option.value);
        if (!optionBPM) return;

        if (!referenceBPM) {
            option.style.color = "";
            return;
        }

        // Apply a tolerance for floating-point comparisons
        const isExactMatch = Math.abs(optionBPM - referenceBPM) < 0.01;
        const isHalfOrDouble = Math.abs(optionBPM - referenceBPM / 2) < 0.01 || Math.abs(optionBPM - referenceBPM * 2) < 0.01;

        if (isExactMatch) {
            option.style.color = "rgb(128, 255, 128)"; // Greenish for exact match
        } else if (isHalfOrDouble) {
            option.style.color = "rgb(255, 255, 128)"; // Yellowish for half or double
        } else {
            option.style.color = "rgb(255, 128, 128)"; // Reddish for other
        }
    });
}

function updateLayerSelectorColors() {
    const mainTrackBPM = getBPMFromTrackName(trackSelector.value);
    if (!mainTrackBPM) return;

    [
        document.getElementById("layers-selector1"),
        document.getElementById("layers-selector2"),
        document.getElementById("layers-selector3"),
        document.getElementById("layers-selector4")
    ].forEach(layerSelector => colorSelectorByBPM(layerSelector, mainTrackBPM));
}

// During playback, colors the main track selector relative to the playing track's BPM
// so green/yellow options flag beat-syncable transition targets. Clears when stopped.
function updateTrackSelectorColors() {
    colorSelectorByBPM(trackSelector, alreadyPlaying ? currentTrackBPM : null);
}

trackSelector.addEventListener("change", () => {
    const selectedTrackValue = trackSelector.value;
    if (selectedTrackValue) {
        document.getElementById("layers-selector1").value = selectedTrackValue;
        document.getElementById("layers-selector2").value = selectedTrackValue;
        document.getElementById("layers-selector3").value = selectedTrackValue;
        document.getElementById("layers-selector4").value = selectedTrackValue;
    }
    updateLayerSelectorColors(); // Update colors based on the selected track BPM
});

// Loads all 8 layers for the given track (respecting per-layer selector overrides),
// creates panned/looping sources started at volume 0, and returns the new node sets.
// When syncReference ({ anchorTime, length }) is supplied, the new loops start at the
// same playback phase as the reference track so BPM-matched transitions stay beat-aligned.
async function loadTrackSources(trackKey, syncReference = null) {
    const layerSelectors = [
        document.getElementById("layers-selector1"),
        document.getElementById("layers-selector2"),
        document.getElementById("layers-selector3"),
        document.getElementById("layers-selector4")
    ];

    const layers = await Promise.all(layerSelectors.flatMap(async (layerSelector, groupIndex) => {
        const selectedLayerTrackKey = layerSelector.value || trackKey;
        const selectedLayerKeys = selectedLayerTrackKey.split('.');
        const selectedLayerTrack = music[selectedLayerKeys[0]][selectedLayerKeys[1]][selectedLayerKeys[2]];

        return [
            await loadAudio(selectedLayerTrack[`layer${(groupIndex * 2) + 1}`]),
            await loadAudio(selectedLayerTrack[`layer${(groupIndex * 2) + 2}`])
        ];
    }));

    const duration = layers[0][0]?.duration || 0;
    const startTime = audioContext.currentTime;

    // Compute the phase offset (in seconds) at the actual start moment, after loading,
    // so the new track picks up exactly where the reference track currently is.
    let startOffset = 0;
    if (syncReference && syncReference.length > 0 && duration > 0) {
        let phase = (startTime - syncReference.anchorTime) % syncReference.length;
        if (phase < 0) phase += syncReference.length;
        startOffset = phase % duration;
    }

    const sources = [];
    const gains = [];

    layers.forEach((bufferPair) => {
        bufferPair.forEach((buffer, index) => {
            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            source.buffer = buffer;

            const panner = audioContext.createStereoPanner();
            panner.pan.value = index === 0 ? -1 : 1;

            gainNode.gain.value = 0;
            source.connect(panner).connect(gainNode).connect(audioContext.destination);
            source.loop = true;
            source.start(startTime, startOffset);

            sources.push(source);
            gains.push(gainNode);
        });
    });

    return { sources, gains, duration, startTime, startOffset };
}

// Fades each layer group toward its current muted state (0 if muted, 1 if active).
function applyMuteStateWithFade(fadeDuration) {
    for (let groupIndex = 0; groupIndex < 4; groupIndex++) {
        const targetVolume = layerGroupsMuted[groupIndex] ? 0 : 1;
        fadeLayerVolume(groupIndex * 2, targetVolume, fadeDuration);
        fadeLayerVolume((groupIndex * 2) + 1, targetVolume, fadeDuration);
    }
}

async function playSelectedTrack(trackKey) {
    const { sources, gains, duration, startTime, startOffset } = await loadTrackSources(trackKey);

    loadingIndicator.style.display = "none";
    sourceNodes = sources;
    gainNodes = gains;
    trackLength = duration;
    loopAnchorTime = startTime - startOffset;
    currentTrackBPM = getBPMFromTrackName(trackKey);
    updateTrackSelectorColors();

    applyMuteStateWithFade(trackLength / 32);

    if (document.getElementById("starter-layer-checkbox5").checked == true) {
        startDynamicHandling();
    }

    updateVolumeBars();
}

// Crossfades from the currently playing track to the newly selected one,
// keeping the active/muted layer groups consistent across the transition.
async function transitionToTrack() {
    if (!alreadyPlaying) return;

    const selectedTrack = trackSelector.value;
    if (!selectedTrack) {
        alert("Please select a track to transition to.");
        return;
    }

    loadPercentage = 0;
    volumeLoadingBar.style.width = "0%";
    volumeLoadingPercentage.innerHTML = "0%";
    loadingIndicator.style.display = "block";

    trackName = selectedTrack.trim();
    trackNameClean = trackName.split('.').pop();

    // Beat-sync the transition only when the target is BPM-compatible (green = exact,
    // yellow = half/double); incompatible (red) targets just start from the top.
    const targetBPM = getBPMFromTrackName(selectedTrack);
    let syncReference = null;
    if (currentTrackBPM && targetBPM && trackLength > 0) {
        const isExactMatch = Math.abs(targetBPM - currentTrackBPM) < 0.01;
        const isHalfOrDouble = Math.abs(targetBPM - currentTrackBPM / 2) < 0.01 || Math.abs(targetBPM - currentTrackBPM * 2) < 0.01;
        if (isExactMatch || isHalfOrDouble) {
            syncReference = { anchorTime: loopAnchorTime, length: trackLength };
        }
    }

    const oldSources = sourceNodes;
    const oldGainNodes = gainNodes;

    const { sources, gains, duration, startTime, startOffset } = await loadTrackSources(selectedTrack, syncReference);

    loadingIndicator.style.display = "none";

    const fadeDuration = duration / 8;

    // Swap globals to the new nodes, then crossfade old out and new in together.
    sourceNodes = sources;
    gainNodes = gains;
    trackLength = duration;
    loopAnchorTime = startTime - startOffset;
    currentTrackBPM = targetBPM;
    updateTrackSelectorColors();

    applyMuteStateWithFade(fadeDuration);
    oldGainNodes.forEach(gainNode => rampGain(gainNode, 0, fadeDuration));

    // Once the old track has faded out, stop and release its nodes.
    setTimeout(() => {
        oldSources.forEach(source => {
            try { source.stop(); } catch (e) { /* already stopped */ }
            source.disconnect();
        });
        oldGainNodes.forEach(gainNode => gainNode.disconnect());
    }, (fadeDuration * 1000) + 100);

    // Restart dynamic handling so its interval matches the new track length.
    if (document.getElementById("starter-layer-checkbox5").checked == true) {
        startDynamicHandling();
    }
}

function rampGain(gainNode, targetVolume, fadeDuration) {
    const currentTime = audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(currentTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
    gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + fadeDuration);
}

function fadeLayerVolume(layerIndex, targetVolume, fadeDuration) {
    if (gainNodes[layerIndex]) {
        rampGain(gainNodes[layerIndex], targetVolume, fadeDuration);
    }
}

function setLayerVolume(layerIndex, volume) {
    if (gainNodes[layerIndex]) {
        gainNodes[layerIndex].gain.value = volume;
    }
}

var alreadyUpdatingVolumeBars = false;

function updateVolumeBars() {
    if (!alreadyUpdatingVolumeBars) {
        alreadyUpdatingVolumeBars = true;
        setInterval(() => {
            gainNodes.forEach((gainNode, index) => {
                const volume = gainNode.gain.value;
                volumeBars[index].style.width = `${volume * 100}%`;

                if (alreadyPlaying == true) {
                    volumeBars[index].style.opacity = `1`;
                } else if (alreadyPlaying == false) {
                    volumeBars[index].style.opacity = `0.5`;
                }
            });
        }, 100);
    }
}

var layerGroup1Muted;
var layerGroup2Muted;
var layerGroup3Muted;
var layerGroup4Muted;
var layerGroupsForFade = 0;
let previousSelectedLayerGroups = [];
var layerGroupsMuted = [];
let dynamicHandlingInterval;

function startDynamicHandling() {
    clearInterval(dynamicHandlingInterval);

    dynamicHandlingInterval = setInterval( () => {
        function countPlayingGroups() {
            return layerGroupsMuted.filter(muted => !muted).length;
        }

        function toggleLayerGroup1() {
            if (layerGroup1Muted == true) {
                layerGroup1Muted = false;
                fadeLayerVolume(0, 1, trackLength / 4);
                fadeLayerVolume(1, 1, trackLength / 4);
            } else if (countPlayingGroups() > 2) {
                layerGroup1Muted = true;
                fadeLayerVolume(0, 0, trackLength / 4);
                fadeLayerVolume(1, 0, trackLength / 4);
            }
            layerGroupsMuted[0] = layerGroup1Muted;
        }

        function toggleLayerGroup2() {
            if (layerGroup2Muted == true) {
                layerGroup2Muted = false;
                fadeLayerVolume(2, 1, trackLength / 4);
                fadeLayerVolume(3, 1, trackLength / 4);
            } else if (countPlayingGroups() > 2) {
                layerGroup2Muted = true;
                fadeLayerVolume(2, 0, trackLength / 4);
                fadeLayerVolume(3, 0, trackLength / 4);
            }
            layerGroupsMuted[1] = layerGroup2Muted;
        }

        function toggleLayerGroup3() {
            if (layerGroup3Muted == true) {
                layerGroup3Muted = false;
                fadeLayerVolume(4, 1, trackLength / 4);
                fadeLayerVolume(5, 1, trackLength / 4);
            } else if (countPlayingGroups() > 2) {
                layerGroup3Muted = true;
                fadeLayerVolume(4, 0, trackLength / 4);
                fadeLayerVolume(5, 0, trackLength / 4);
            }
            layerGroupsMuted[2] = layerGroup3Muted;
        }

        function toggleLayerGroup4() {
            if (layerGroup4Muted == true) {
                layerGroup4Muted = false;
                fadeLayerVolume(6, 1, trackLength / 4);
                fadeLayerVolume(7, 1, trackLength / 4);
            } else if (countPlayingGroups() > 2) {
                layerGroup4Muted = true;
                fadeLayerVolume(6, 0, trackLength / 4);
                fadeLayerVolume(7, 0, trackLength / 4);
            }
            layerGroupsMuted[3] = layerGroup4Muted;
        }

        function selectRandomLayerGroup() {
            let availableLayerGroups = [0, 1, 2, 3];
            availableLayerGroups = availableLayerGroups.filter(group => !previousSelectedLayerGroups.includes(group));
            let selectedLayerGroup = availableLayerGroups[Math.floor(Math.random() * availableLayerGroups.length)];
            if (previousSelectedLayerGroups.length >= 2) {
                previousSelectedLayerGroups.shift();
            }
            previousSelectedLayerGroups.push(selectedLayerGroup);
            return selectedLayerGroup;
        }

        function toggleLayerGroupWithCheck() {
            let attempts = 0;
            let selectedGroup;
            do {
                selectedGroup = selectRandomLayerGroup();
                attempts++;
            } while (countPlayingGroups() === 2 && layerGroupsMuted[selectedGroup] === false && attempts < 10);

            return selectedGroup;
        }

        layerGroupsForFade = Math.ceil(Math.random() * 2);

        for (let i = 0; i < layerGroupsForFade; i++) {
            let selectedLayerGroup = toggleLayerGroupWithCheck();

            if (selectedLayerGroup == 0) {
                toggleLayerGroup1();
            } else if (selectedLayerGroup == 1) {
                toggleLayerGroup2();
            } else if (selectedLayerGroup == 2) {
                toggleLayerGroup3();
            } else if (selectedLayerGroup == 3) {
                toggleLayerGroup4();
            }
        }

        console.log("--[Current Muted Layers]----------------\n" + "Layer 1: " + layerGroupsMuted[0] + "\n" + "Layer 2: " + layerGroupsMuted[1] + "\n" + "Layer 3: " + layerGroupsMuted[2] + "\n" + "Layer 4: " + layerGroupsMuted[3] + "\n" + "----------------------------------------");

    }, (trackLength * 1000));
}

document.addEventListener("DOMContentLoaded", populateTrackSelector);

function resetVariables() {
    if (document.getElementById("starter-layer-checkbox1").checked == false) {
        layerGroup1Muted = true;
        layerGroupsMuted[0] = true;
    } else {
        layerGroup1Muted = false;
        layerGroupsMuted[0] = false;
    }

    if (document.getElementById("starter-layer-checkbox2").checked == false) {
        layerGroup2Muted = true;
        layerGroupsMuted[1] = true;
    } else {
        layerGroup2Muted = false;
        layerGroupsMuted[1] = false;
    }

    if (document.getElementById("starter-layer-checkbox3").checked == false) {
        layerGroup3Muted = true;
        layerGroupsMuted[2] = true;
    } else {
        layerGroup3Muted = false;
        layerGroupsMuted[2] = false;
    }

    if (document.getElementById("starter-layer-checkbox4").checked == false) {
        layerGroup4Muted = true;
        layerGroupsMuted[3] = true;
    } else {
        layerGroup4Muted = false;
        layerGroupsMuted[3] = false;
    }
}

musicButton.addEventListener("click", async function () {
    if (alreadyPlaying) return;

    const selectedTrack = trackSelector.value;
    if (selectedTrack) {
        alreadyPlaying = true;
        resetVariables();
        loadingIndicator.style.display = "block";

        musicButton.style.display = "none";
        musicTransition.style.display = "";
        musicReset.style.display = "";

        trackName = selectedTrack.trim();
        trackNameClean = trackName.split('.').pop();

        await playSelectedTrack(selectedTrack);
    } else {
        alert("Please select a track to play.");
    }
});

musicTransition.addEventListener("click", transitionToTrack);

function setLayerGroupMuted(groupIndex, muted) {
    const targetVolume = muted ? 0 : 1;
    fadeLayerVolume(groupIndex * 2, targetVolume, trackLength / 8);
    fadeLayerVolume((groupIndex * 2) + 1, targetVolume, trackLength / 8);

    layerGroupsMuted[groupIndex] = muted;
    if (groupIndex === 0) layerGroup1Muted = muted;
    else if (groupIndex === 1) layerGroup2Muted = muted;
    else if (groupIndex === 2) layerGroup3Muted = muted;
    else if (groupIndex === 3) layerGroup4Muted = muted;
}

[1, 2, 3, 4].forEach(groupNumber => {
    document.getElementById(`starter-layer-checkbox${groupNumber}`).addEventListener("change", function () {
        if (!alreadyPlaying) return;
        setLayerGroupMuted(groupNumber - 1, !this.checked);
    });
});

document.getElementById("starter-layer-checkbox5").addEventListener("change", function () {
    if (!alreadyPlaying) return;
    if (this.checked) {
        startDynamicHandling();
    } else {
        clearInterval(dynamicHandlingInterval);
    }
});

musicReset.addEventListener("click", function () {
    loadPercentage = 0;
    volumeLoadingBar.style.width = parseInt(0) + "%";
    volumeLoadingPercentage.innerHTML = parseInt(0) + "%";

    sourceNodes.forEach(source => {
        try { source.stop(); } catch (e) { /* already stopped */ }
        source.disconnect();
    });
    sourceNodes = [];
    gainNodes.forEach(gainNode => gainNode.disconnect());
    gainNodes = [];
    alreadyPlaying = false;
    clearInterval(dynamicHandlingInterval);
    updateVolumeBars();
    resetVariables();

    currentTrackBPM = null;
    updateTrackSelectorColors();

    musicButton.style.display = "";
    musicTransition.style.display = "none";
    musicReset.style.display = "none";
});

// Download Feature

async function renderAndDownloadMultiChannelMix() {
    const selectedTrack = trackSelector.value;
    if (!selectedTrack) {
        alert("Please select a track to download.");
        return;
    }

    const sampleRate = audioContext.sampleRate;
    const offlineContext = new OfflineAudioContext(8, sampleRate * trackLength, sampleRate); // 8 channels

    // Create a ChannelMergerNode to handle the 8 channels
    const merger = offlineContext.createChannelMerger(8);

    const layerSelectors = [
        document.getElementById("layers-selector1"),
        document.getElementById("layers-selector2"),
        document.getElementById("layers-selector3"),
        document.getElementById("layers-selector4")
    ];

    await Promise.all(layerSelectors.map(async (selector, index) => {
        const selectedLayerTrackKey = selector.value || selectedTrack;
        const selectedLayerKeys = selectedLayerTrackKey.split('.');
        const track = music[selectedLayerKeys[0]][selectedLayerKeys[1]][selectedLayerKeys[2]];

        const buffer1 = await loadAudio(track[`layer${(index * 2) + 1}`]);
        const buffer2 = await loadAudio(track[`layer${(index * 2) + 2}`]);

        // Create buffer sources for each layer
        const source1 = offlineContext.createBufferSource();
        const source2 = offlineContext.createBufferSource();

        source1.buffer = buffer1;
        source2.buffer = buffer2;

        // Connect each source to its respective channel in the merger
        source1.connect(merger, 0, index * 2); // Connect to channel (index*2)
        source2.connect(merger, 0, (index * 2) + 1); // Connect to channel (index*2 + 1)

        source1.start(0);
        source2.start(0);
    }));

    // Connect the merger to the offlineContext destination
    merger.connect(offlineContext.destination);

    // Render the multi-channel mix
    const renderedBuffer = await offlineContext.startRendering();

    // Convert to multi-channel WAV and download
    downloadMultiChannelWAV(renderedBuffer);
}

// Function to download the multi-channel WAV file
function downloadMultiChannelWAV(buffer) {
    const wavData = encodeMultiChannelWAV(buffer);
    const blob = new Blob([wavData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = trackNameClean + "_Custom.wav";
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(downloadLink);
}

// Updated WAV encoding function for multi-channel support
function encodeMultiChannelWAV(buffer) {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numberOfChannels * 2 + 44;
    const wav = new DataView(new ArrayBuffer(length));

    // RIFF header
    writeString(wav, 0, 'RIFF');
    wav.setUint32(4, length - 8, true);
    writeString(wav, 8, 'WAVE');
    writeString(wav, 12, 'fmt ');
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true);
    wav.setUint16(22, numberOfChannels, true);
    wav.setUint32(24, sampleRate, true);
    wav.setUint32(28, sampleRate * numberOfChannels * 2, true);
    wav.setUint16(32, numberOfChannels * 2, true);
    wav.setUint16(34, 16, true);
    writeString(wav, 36, 'data');
    wav.setUint32(40, length - 44, true);

    // Audio data: Write each sample from each channel
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
            wav.setInt16(offset, sample * 32767, true);
            offset += 2;
        }
    }

    return wav;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Attach to download button
musicDownload.addEventListener("click", renderAndDownloadMultiChannelMix);