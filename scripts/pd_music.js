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
var currentTrackBPM = null;    // effective (sounding) tempo of the mix, used for selector coloring

// Tempo-mixing state. The mix runs at masterTempo (BPM); every track is played at
// playbackRate = masterTempo / nativeBPM so differing-BPM tracks stay beat-locked.
// A running beat count lets new tracks be dropped in on the beat.
var masterTempo = null;
var beatRefTime = 0;           // audioContext time of the beat reference
var beatRefBeats = 0;          // beats elapsed at beatRefTime (mix runs at constant masterTempo since then)
var tempoGlideToken = 0;       // invalidates pending tempo-glide re-anchors when superseded
const tempoGlideDuration = 4;  // seconds to glide the mix to a new track's native tempo (Adapt mode)

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

// Total beats elapsed on the running mix clock (the mix runs at constant masterTempo since beatRefTime).
function currentBeats() {
    if (!masterTempo) return 0;
    return beatRefBeats + (audioContext.currentTime - beatRefTime) * masterTempo / 60;
}

// The power-of-two multiple of mixTempo nearest (geometrically) to nativeBPM. Octave multiples stay
// beat-aligned, so matching to the nearest octave keeps a layer near its own speed while staying synced.
function nearestOctaveTempo(mixTempo, nativeBPM) {
    const k = Math.round(Math.log2(nativeBPM / mixTempo));
    return mixTempo * Math.pow(2, k);
}

// Loads all 8 layers for the given track (respecting per-layer selector overrides),
// creates panned/looping sources started at volume 0, and returns the new node sets.
// options:
//   targetTempo – tempo to play it at; with the native BPM this sets playbackRate (pitch-shifts)
//   sync        – when true, the loops start on the current mix beat so they stay beat-locked
async function loadTrackSources(trackKey, { targetTempo = null, sync = false } = {}) {
    const layerSelectors = [
        document.getElementById("layers-selector1"),
        document.getElementById("layers-selector2"),
        document.getElementById("layers-selector3"),
        document.getElementById("layers-selector4")
    ];

    // Each layer group can be a different track with its own BPM. The first group is the
    // master loop (it defines the loop length and the mix's native tempo). Every group is
    // tempo-matched to the mix tempo *independently*, so only off-tempo layers get pitch-shifted.
    const groupKeys = layerSelectors.map(selector => selector.value || trackKey);
    const groupBPMs = groupKeys.map(getBPMFromTrackName);
    const nativeBPM = groupBPMs[0];

    const layers = await Promise.all(groupKeys.map(async (groupKey, groupIndex) => {
        const selectedLayerKeys = groupKey.split('.');
        const selectedLayerTrack = music[selectedLayerKeys[0]][selectedLayerKeys[1]][selectedLayerKeys[2]];

        return [
            await loadAudio(selectedLayerTrack[`layer${(groupIndex * 2) + 1}`]),
            await loadAudio(selectedLayerTrack[`layer${(groupIndex * 2) + 2}`])
        ];
    }));

    const duration = layers[0][0]?.duration || 0;
    const startTime = audioContext.currentTime;

    // Mix tempo to play at: an explicit target (a transition), else the master group's own BPM.
    const mixTempo = targetTempo || nativeBPM;

    const sources = [];
    const gains = [];
    const groupRates = [];
    const groupOffsets = [];

    layers.forEach((bufferPair, groupIndex) => {
        const groupBPM = groupBPMs[groupIndex];
        const groupDuration = bufferPair[0]?.duration || 0;

        // Tempo-match to the nearest octave of the mix tempo (not the mix tempo itself), so a fast
        // layer plays near its own speed at double/quad time instead of being dragged way down.
        const matchedTempo = (groupBPM && mixTempo) ? nearestOctaveTempo(mixTempo, groupBPM) : mixTempo;
        const groupRate = (groupBPM && matchedTempo) ? matchedTempo / groupBPM : 1;
        groupRates.push(groupRate);

        // Beat-align each group's loop start to the running mix clock. The group runs at `octave`
        // times the grid's beat rate (its tempo is octave*mixTempo), so scale the beat phase by it.
        let groupOffset = 0;
        if (sync && groupBPM && groupDuration > 0) {
            const loopBeats = groupDuration * groupBPM / 60;
            const octave = mixTempo ? matchedTempo / mixTempo : 1;
            let phase = (currentBeats() * octave) % loopBeats;
            if (phase < 0) phase += loopBeats;
            groupOffset = (phase * 60 / groupBPM) % groupDuration;
        }
        groupOffsets.push(groupOffset);

        bufferPair.forEach((buffer, index) => {
            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            source.buffer = buffer;
            source.playbackRate.value = groupRate;

            const panner = audioContext.createStereoPanner();
            panner.pan.value = index === 0 ? -1 : 1;

            gainNode.gain.value = 0;
            source.connect(panner).connect(gainNode).connect(audioContext.destination);
            source.loop = true;
            source.start(startTime, groupOffset);

            sources.push(source);
            gains.push(gainNode);
        });
    });

    return { sources, gains, duration, startTime, startOffset: groupOffsets[0], rate: groupRates[0], nativeBPM, groupBPMs, groupRates };
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
    const { sources, gains, duration, startTime, nativeBPM } = await loadTrackSources(trackKey, { sync: false });

    loadingIndicator.style.display = "none";
    sourceNodes = sources;
    gainNodes = gains;
    trackLength = duration;

    // The first track defines the mix tempo and resets the beat clock to its downbeat.
    masterTempo = nativeBPM;
    beatRefTime = startTime;
    beatRefBeats = 0;
    tempoGlideToken++;
    currentTrackBPM = masterTempo;
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

    const maintainBPM = document.getElementById("starter-layer-checkbox6").checked;

    const oldSources = sourceNodes;
    const oldGainNodes = gainNodes;

    // Play the incoming track at the current mix tempo (when we have one) so it beat-locks;
    // its native BPM is resolved from the first layer inside loadTrackSources.
    const { sources, gains, duration, startTime, startOffset, rate, nativeBPM, groupBPMs, groupRates } =
        await loadTrackSources(selectedTrack, { targetTempo: masterTempo, sync: !!masterTempo });

    const incomingBPM = nativeBPM;
    const canTempoMatch = !!(masterTempo && incomingBPM);

    loadingIndicator.style.display = "none";

    const fadeDuration = duration / 8;

    // Swap globals to the new nodes, then crossfade old out and new in together.
    sourceNodes = sources;
    gainNodes = gains;
    trackLength = duration;

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

    const token = ++tempoGlideToken; // invalidates any pending glide; identifies this transition

    if (maintainBPM || !canTempoMatch || rate === 1) {
        // Maintain BPM: keep the mix tempo; the incoming track is already beat-locked to it,
        // so the beat clock continues uninterrupted. Bootstrap it if we had no tempo yet.
        if (!masterTempo && incomingBPM) {
            masterTempo = incomingBPM;
            beatRefTime = startTime;
            beatRefBeats = 0;
            currentTrackBPM = masterTempo;
        }
    } else {
        // Adapt: after the crossfade, glide the mix from the current tempo to the incoming
        // track's native tempo (playbackRate rate -> 1.0), then re-anchor the beat clock.
        const now = audioContext.currentTime;
        const startGlide = now + fadeDuration;
        const endGlide = startGlide + tempoGlideDuration;

        sources.forEach((source, i) => {
            const group = Math.floor(i / 2);
            const startRate = groupRates[group];
            // Glide each group to the rate that keeps it at the new master tempo (group 0's native),
            // snapped to its nearest octave so fast layers stay near their own speed.
            const endRate = groupBPMs[group] ? (nearestOctaveTempo(nativeBPM, groupBPMs[group]) / groupBPMs[group]) : 1;
            source.playbackRate.setValueAtTime(startRate, startGlide);
            source.playbackRate.linearRampToValueAtTime(endRate, endGlide);
        });

        // Buffer position the loop reaches when the glide ends (integral of the rate ramp).
        const posAtEnd = (startOffset + rate * (startGlide - startTime) + ((rate + 1) / 2) * tempoGlideDuration) % duration;
        setTimeout(() => {
            if (token !== tempoGlideToken) return; // superseded by a newer transition
            masterTempo = incomingBPM;
            beatRefTime = audioContext.currentTime;
            beatRefBeats = posAtEnd * incomingBPM / 60;
            currentTrackBPM = masterTempo;
            updateTrackSelectorColors();
        }, (endGlide - now) * 1000 + 50);
    }

    updateTrackSelectorColors();

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

    masterTempo = null;
    tempoGlideToken++;
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