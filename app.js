const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;
const DEFAULT_FREQUENCY = 440;
const RAMP_SECONDS = 0.018;
const COARSE_HZ_PER_PIXEL = 2;
const FINE_HZ_PER_PIXEL = 0.12;
const WHEEL_REFERENCE_FREQUENCY = 1500;
const MIN_WHEEL_RATIO = 0.15;
const MAX_WHEEL_RATIO = 4;
const SPIN_FRICTION = 0.94;
const MIN_SPIN_VELOCITY = 0.18;
const MIN_THROW_VELOCITY = 1.35;
const MAX_SPIN_VELOCITY = 16;
const AUDIO_START_TIMEOUT_MS = 1500;
const AUTO_VOLUME_POINTS = [
  [20, 1],
  [40, 0.9733],
  [63, 0.9333],
  [100, 0.88],
  [160, 0.8267],
  [250, 0.7733],
  [440, 0.72],
  [1000, 0.6133],
  [2000, 0.4533],
  [3500, 0.4],
  [5000, 0.4133],
  [8000, 0.44],
  [12000, 0.48],
  [16000, 0.4667],
  [20000, 0.44],
];

const playButton = document.querySelector("#playButton");
const waveformSelect = document.querySelector("#waveform");
const waveSelectShell = document.querySelector("#waveSelectShell");
const noiseModeBadge = document.querySelector("#noiseModeBadge");
const modeButtons = [...document.querySelectorAll(".mode-tab")];
const volumeSlider = document.querySelector("#volumeSlider");
const volumeValue = document.querySelector("#volumeValue");
const audioStatus = document.querySelector("#audioStatus");
const tonePanels = [...document.querySelectorAll(".tone-panel")];
const noisePanels = [...document.querySelectorAll(".noise-panel")];
const frequencyValue = document.querySelector("#frequencyValue");
const frequencyNote = document.querySelector("#frequencyNote");
const frequencyFader = document.querySelector("#frequencyFader");
const tuningWheels = [...document.querySelectorAll(".tuning-wheel")];
const fineVelocity = document.querySelector("#fineVelocity");
const noiseButtons = [...document.querySelectorAll(".noise-button")];
const noiseName = document.querySelector("#noiseName");
const noiseDescription = document.querySelector("#noiseDescription");
const noiseGraph = document.querySelector("#noiseGraph");
const noiseGraphLine = document.querySelector("#noiseGraphLine");

const NOISE_PRESETS = {
  white: {
    label: "WHITE",
    description: "Flat energy across the spectrum",
    graph: "M20 75 H300",
  },
  pink: {
    label: "PINK",
    description: "Gentle low-to-high rolloff",
    graph: "M20 36 H58 C72 40 82 45 96 49 H126 C142 55 154 62 170 68 H204 C222 76 236 86 252 94 H300",
  },
  brown: {
    label: "BROWN",
    description: "Heavy low-frequency emphasis",
    graph: "M20 24 H46 C62 32 78 48 92 65 C110 88 126 104 146 113 H188 C218 120 250 126 300 132",
  },
  green: {
    label: "GREEN",
    description: "Mid-band focused natural noise",
    graph: "M20 124 C52 116 78 98 98 78 C118 55 134 42 160 38 C188 41 204 58 224 78 C246 102 270 118 300 126",
  },
  blue: {
    label: "BLUE",
    description: "Bright high-frequency lift",
    graph: "M20 116 H62 C82 112 98 104 118 96 H150 C174 82 194 70 218 58 H252 C270 48 284 38 300 30",
  },
  violet: {
    label: "VIOLET",
    description: "Strong high-frequency emphasis",
    graph: "M20 132 H62 C86 128 104 116 124 100 C150 78 166 62 190 48 H226 C252 38 272 28 300 20",
  },
  grey: {
    label: "GREY",
    description: "Perceptual balance curve",
    graph: "M20 92 C42 56 70 46 100 58 C126 70 142 88 166 91 C192 94 210 75 232 58 C258 38 284 48 300 78",
  },
};

const audio = {
  context: null,
  oscillator: null,
  noiseSource: null,
  noiseBuffer: null,
  gain: null,
  playing: false,
};

let frequency = DEFAULT_FREQUENCY;
let mode = "tone";
let toneWaveform = "sine";
let noiseType = "white";
let volume = Number(volumeSlider.value) / 100;
let dragState = null;
let spinVelocity = 0;
let spinFrame = 0;
const wheelStates = {
  coarse: {
    sensitivity: COARSE_HZ_PER_PIXEL,
    offset: 0,
    remainderHz: 0,
    wheel: document.querySelector("#coarseWheel"),
    track: document.querySelector("#coarseWheelTrack"),
  },
  fine: {
    sensitivity: FINE_HZ_PER_PIXEL,
    offset: 0,
    remainderHz: 0,
    wheel: document.querySelector("#fineWheel"),
    track: document.querySelector("#fineWheelTrack"),
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function frequencyToSliderValue(hz) {
  const minLog = Math.log10(MIN_FREQUENCY);
  const maxLog = Math.log10(MAX_FREQUENCY);
  const normalized = (Math.log10(hz) - minLog) / (maxLog - minLog);
  return Math.round(clamp(normalized, 0, 1) * 10000);
}

function sliderValueToFrequency(value) {
  const normalized = clamp(Number(value) / 10000, 0, 1);
  const minLog = Math.log10(MIN_FREQUENCY);
  const maxLog = Math.log10(MAX_FREQUENCY);
  return Math.round(10 ** (minLog + normalized * (maxLog - minLog)));
}

function now() {
  return audio.context?.currentTime ?? 0;
}

function updateFaderFill() {
  const percent = `${(Number(frequencyFader.value) / 10000) * 100}%`;
  frequencyFader.style.setProperty("--fader-percent", percent);
}

function updateDisplay() {
  frequencyValue.textContent = String(Math.round(frequency));
  frequencyNote.textContent = noteNameForFrequency(frequency);
  frequencyFader.value = String(frequencyToSliderValue(frequency));
  frequencyFader.setAttribute("aria-valuenow", String(Math.round(frequency)));
  tuningWheels.forEach((wheel) => {
    wheel.setAttribute("aria-valuenow", String(Math.round(frequency)));
  });
  updateFaderFill();
}

function noteNameForFrequency(hz) {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const octave = Math.floor(midi / 12) - 1;
  const noteName = noteNames[((midi % 12) + 12) % 12];
  const exactFrequency = 440 * (2 ** ((midi - 69) / 12));
  const cents = Math.round(1200 * Math.log2(hz / exactFrequency));
  const centsLabel = Math.abs(cents) >= 1 ? ` ${cents > 0 ? "+" : ""}${cents}c` : "";
  return `${noteName}${octave}${centsLabel}`;
}

function setFrequency(nextFrequency, options = {}) {
  const rounded = Math.round(clamp(nextFrequency, MIN_FREQUENCY, MAX_FREQUENCY));
  if (rounded === frequency && !options.force) return;

  frequency = rounded;
  updateDisplay();
  updateAutoVolume();

  if (audio.playing && audio.oscillator) {
    const targetTime = now() + RAMP_SECONDS;
    audio.oscillator.frequency.cancelScheduledValues(now());
    audio.oscillator.frequency.setTargetAtTime(frequency, now(), RAMP_SECONDS);
    audio.oscillator.frequency.linearRampToValueAtTime(frequency, targetTime);
  }
}

function autoVolumeForFrequency(hz) {
  const frequencyLog = Math.log10(clamp(hz, MIN_FREQUENCY, MAX_FREQUENCY));

  for (let index = 0; index < AUTO_VOLUME_POINTS.length - 1; index += 1) {
    const [leftFrequency, leftVolume] = AUTO_VOLUME_POINTS[index];
    const [rightFrequency, rightVolume] = AUTO_VOLUME_POINTS[index + 1];

    if (hz <= rightFrequency) {
      const leftLog = Math.log10(leftFrequency);
      const rightLog = Math.log10(rightFrequency);
      const normalized = (frequencyLog - leftLog) / (rightLog - leftLog);
      return leftVolume + (rightVolume - leftVolume) * clamp(normalized, 0, 1);
    }
  }

  return AUTO_VOLUME_POINTS[AUTO_VOLUME_POINTS.length - 1][1];
}

function updateAutoVolume() {
  setVolume(autoVolumeForFrequency(frequency));
}

function setVolume(nextVolume) {
  volume = clamp(nextVolume, 0, 1);
  volumeSlider.value = String(Math.round(volume * 100));
  volumeValue.textContent = `${Math.round(volume * 100)}%`;

  if (audio.gain && audio.context) {
    audio.gain.gain.cancelScheduledValues(now());
    audio.gain.gain.setTargetAtTime(audio.playing ? volume : 0, now(), RAMP_SECONDS);
  }
}

function setMode(nextMode) {
  mode = nextMode;
  document.body.dataset.mode = mode;

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  tonePanels.forEach((panel) => {
    panel.hidden = mode !== "tone";
  });

  noisePanels.forEach((panel) => {
    panel.hidden = mode !== "noise";
  });

  waveSelectShell.hidden = mode !== "tone";
  noiseModeBadge.hidden = mode !== "noise";

  if (mode === "noise") {
    setVolume(1);
  } else {
    updateAutoVolume();
  }

  if (audio.playing) {
    restartSound();
  }
}

function setToneWaveform(nextWaveform) {
  toneWaveform = nextWaveform;
  waveformSelect.value = toneWaveform;

  if (audio.playing && mode === "tone") {
    restartSound();
  }
}

function setNoiseType(nextNoiseType) {
  noiseType = nextNoiseType;
  const preset = NOISE_PRESETS[noiseType];

  noiseName.textContent = preset.label;
  noiseDescription.textContent = preset.description;
  noiseGraphLine.setAttribute("d", preset.graph);
  noiseGraph.classList.toggle("show-flat", noiseType === "white");

  noiseButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.noise === noiseType);
  });

  if (audio.playing && mode === "noise") {
    restartSound();
  }
}

function setAudioStatus(message = "") {
  audioStatus.textContent = message;
  audioStatus.hidden = message.length === 0;
}

function supportsWebAudio() {
  return Boolean(window.AudioContext || window.webkitAudioContext);
}

function waitWithTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

async function ensureAudioContext() {
  if (!audio.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not available in this browser.");
    }

    audio.context = new AudioContextClass();
    audio.gain = audio.context.createGain();
    audio.gain.gain.value = 0;
    audio.gain.connect(audio.context.destination);
  }

  if (audio.context.state === "suspended") {
    await waitWithTimeout(
      audio.context.resume(),
      AUDIO_START_TIMEOUT_MS,
      "Audio start timed out. The browser may be blocking Web Audio."
    );
  }

  return Promise.resolve();
}

function filterNoiseSample(type, white, state) {
  if (type === "pink") {
    state.b0 = 0.99886 * state.b0 + white * 0.0555179;
    state.b1 = 0.99332 * state.b1 + white * 0.0750759;
    state.b2 = 0.96900 * state.b2 + white * 0.1538520;
    state.b3 = 0.86650 * state.b3 + white * 0.3104856;
    state.b4 = 0.55000 * state.b4 + white * 0.5329522;
    state.b5 = -0.7616 * state.b5 - white * 0.0168980;
    const value = (state.b0 + state.b1 + state.b2 + state.b3 + state.b4 + state.b5 + state.b6 + white * 0.5362) * 0.11;
    state.b6 = white * 0.115926;
    return value;
  }

  if (type === "brown") {
    state.brown = (state.brown + 0.02 * white) / 1.02;
    return clamp(state.brown * 3.5, -1, 1);
  }

  if (type === "green") {
    state.low = 0.985 * state.low + 0.015 * white;
    const high = white - state.low;
    state.mid = 0.92 * state.mid + 0.08 * high;
    return clamp(state.mid * 2.4, -1, 1);
  }

  if (type === "blue") {
    const value = (white - state.previousWhite) * 0.72;
    state.previousWhite = white;
    return clamp(value, -1, 1);
  }

  if (type === "violet") {
    const firstDiff = white - state.previousWhite;
    const secondDiff = firstDiff - state.previousDiff;
    state.previousWhite = white;
    state.previousDiff = firstDiff;
    return clamp(secondDiff * 0.46, -1, 1);
  }

  if (type === "grey") {
    state.brown = (state.brown + 0.018 * white) / 1.018;
    const high = (white - state.previousWhite) * 0.44;
    state.previousWhite = white;
    return clamp((state.brown * 1.15 + high + white * 0.18) * 0.95, -1, 1);
  }

  return white * 0.85;
}

function createNoiseBuffer(type) {
  if (!audio.context) return null;

  const sampleRate = audio.context.sampleRate;
  const buffer = audio.context.createBuffer(1, sampleRate * 2, sampleRate);
  const output = buffer.getChannelData(0);
  const state = {
    b0: 0,
    b1: 0,
    b2: 0,
    b3: 0,
    b4: 0,
    b5: 0,
    b6: 0,
    brown: 0,
    low: 0,
    mid: 0,
    previousWhite: 0,
    previousDiff: 0,
  };

  for (let index = 0; index < output.length; index += 1) {
    const white = Math.random() * 2 - 1;
    output[index] = filterNoiseSample(type, white, state);
  }

  return buffer;
}

function stopNodes() {
  if (audio.oscillator) {
    try {
      audio.oscillator.stop();
    } catch {
      // The node may already be stopped during a fast waveform switch.
    }
    audio.oscillator.disconnect();
    audio.oscillator = null;
  }

  if (audio.noiseSource) {
    try {
      audio.noiseSource.stop();
    } catch {
      // The node may already be stopped during a fast waveform switch.
    }
    audio.noiseSource.disconnect();
    audio.noiseSource = null;
  }
}

function startNodes() {
  if (!audio.context || !audio.gain) return;

  stopNodes();

  if (mode === "noise") {
    audio.noiseBuffer = createNoiseBuffer(noiseType);
    audio.noiseSource = audio.context.createBufferSource();
    audio.noiseSource.buffer = audio.noiseBuffer;
    audio.noiseSource.loop = true;
    audio.noiseSource.connect(audio.gain);
    audio.noiseSource.start();
    return;
  }

  audio.oscillator = audio.context.createOscillator();
  audio.oscillator.type = toneWaveform;
  audio.oscillator.frequency.value = frequency;
  audio.oscillator.connect(audio.gain);
  audio.oscillator.start();
}

async function startSound() {
  await ensureAudioContext();
  setAudioStatus();
  startNodes();
  audio.playing = true;
  playButton.classList.add("playing");
  playButton.setAttribute("aria-pressed", "true");
  playButton.querySelector(".play-label").textContent = "STOP";
  setVolume(volume);
}

function stopSound() {
  if (!audio.context || !audio.gain) return;

  audio.gain.gain.cancelScheduledValues(now());
  audio.gain.gain.setTargetAtTime(0, now(), RAMP_SECONDS);

  window.setTimeout(() => {
    stopNodes();
  }, RAMP_SECONDS * 1000 + 30);

  audio.playing = false;
  playButton.classList.remove("playing");
  playButton.setAttribute("aria-pressed", "false");
  playButton.querySelector(".play-label").textContent = "PLAY";
}

function restartSound() {
  if (!audio.playing) return;

  stopNodes();
  startNodes();
  setVolume(volume);
}

function wheelStateFor(element) {
  return wheelStates[element.dataset.wheel] ?? wheelStates.fine;
}

function moveWheel(state, deltaPixels) {
  state.offset = (state.offset + deltaPixels) % 16;
  state.track.style.setProperty("--wheel-offset", `${state.offset}px`);
}

function wheelFrequencyRatio() {
  return clamp(Math.sqrt(frequency / WHEEL_REFERENCE_FREQUENCY), MIN_WHEEL_RATIO, MAX_WHEEL_RATIO);
}

function effectiveWheelSensitivity(state) {
  return state.sensitivity * wheelFrequencyRatio();
}

function applyWheelDelta(state, deltaPixels) {
  moveWheel(state, deltaPixels);
  state.remainderHz += -deltaPixels * effectiveWheelSensitivity(state);

  const wholeHz = state.remainderHz > 0
    ? Math.floor(state.remainderHz)
    : Math.ceil(state.remainderHz);

  if (wholeHz !== 0) {
    setFrequency(frequency + wholeHz);
    state.remainderHz -= wholeHz;
  }
}

function resetWheelRemainder(state) {
  state.remainderHz = 0;
}

function resetAllWheelRemainders() {
  Object.values(wheelStates).forEach(resetWheelRemainder);
}

function stopSpin() {
  if (spinFrame) {
    cancelAnimationFrame(spinFrame);
    spinFrame = 0;
  }
  spinVelocity = 0;
  resetAllWheelRemainders();
  fineVelocity.textContent = "±1 Hz";
}

function animateSpin() {
  spinVelocity *= SPIN_FRICTION;

  if (Math.abs(spinVelocity) < MIN_SPIN_VELOCITY) {
    stopSpin();
    return;
  }

  const state = dragState?.spinState ?? wheelStates.fine;
  applyWheelDelta(state, spinVelocity);
  const hzPerFrame = -spinVelocity * effectiveWheelSensitivity(state);
  fineVelocity.textContent = `${hzPerFrame > 0 ? "+" : ""}${Math.round(hzPerFrame)} Hz/s`;
  spinFrame = requestAnimationFrame(animateSpin);
}

function startSpin(initialVelocity, state) {
  if (spinFrame) {
    cancelAnimationFrame(spinFrame);
    spinFrame = 0;
  }

  if (Math.abs(initialVelocity) < MIN_THROW_VELOCITY) {
    spinVelocity = 0;
    resetWheelRemainder(state);
    fineVelocity.textContent = "±1 Hz";
    return;
  }

  dragState = { spinState: state };
  spinVelocity = clamp(initialVelocity, -MAX_SPIN_VELOCITY, MAX_SPIN_VELOCITY);
  if (Math.abs(spinVelocity) >= MIN_SPIN_VELOCITY) {
    spinFrame = requestAnimationFrame(animateSpin);
  }
}

function beginFineDrag(event) {
  event.preventDefault();
  stopSpin();
  const state = wheelStateFor(event.currentTarget);
  resetWheelRemainder(state);
  event.currentTarget.setPointerCapture(event.pointerId);
  dragState = {
    pointerId: event.pointerId,
    wheel: event.currentTarget,
    state,
    lastX: event.clientX,
    lastTime: performance.now(),
    velocity: 0,
  };
}

function updateFineDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const currentTime = performance.now();
  const deltaX = event.clientX - dragState.lastX;
  const deltaTime = Math.max(8, currentTime - dragState.lastTime);

  applyWheelDelta(dragState.state, deltaX);
  dragState.velocity = deltaX / deltaTime * 16.67;
  dragState.lastX = event.clientX;
  dragState.lastTime = currentTime;
  const hzDelta = -deltaX * effectiveWheelSensitivity(dragState.state);
  const pendingHz = dragState.state.remainderHz;
  const shownDelta = Math.abs(hzDelta) >= 0.5 ? Math.round(hzDelta) : pendingHz.toFixed(1);
  fineVelocity.textContent = `${Number(shownDelta) > 0 ? "+" : ""}${shownDelta} Hz`;
}

function endFineDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const velocity = dragState.velocity;
  const state = dragState.state;
  const wheel = dragState.wheel;
  dragState = null;
  wheel.releasePointerCapture(event.pointerId);
  startSpin(velocity, state);
}

playButton.addEventListener("click", () => {
  if (audio.playing) {
    stopSound();
  } else {
    startSound().catch((error) => {
      console.warn("Could not start audio", error);
      setAudioStatus("Audio could not start in this browser.");
      stopSound();
    });
  }
});

volumeSlider.addEventListener("input", (event) => {
  setVolume(Number(event.target.value) / 100);
});

frequencyFader.addEventListener("input", (event) => {
  stopSpin();
  resetAllWheelRemainders();
  setFrequency(sliderValueToFrequency(event.target.value));
});

waveformSelect.addEventListener("change", (event) => {
  setToneWaveform(event.target.value);
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
  });
});

noiseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setNoiseType(button.dataset.noise);
  });
});

tuningWheels.forEach((wheel) => {
  wheel.addEventListener("pointerdown", beginFineDrag);
  wheel.addEventListener("pointermove", updateFineDrag);
  wheel.addEventListener("pointerup", endFineDrag);
  wheel.addEventListener("pointercancel", endFineDrag);

  wheel.addEventListener("keydown", (event) => {
    const state = wheelStateFor(event.currentTarget);
    const step = event.shiftKey ? 10 : (state === wheelStates.coarse ? 5 : 1);

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stopSpin();
      resetWheelRemainder(state);
      setFrequency(frequency + step);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      stopSpin();
      resetWheelRemainder(state);
      setFrequency(frequency - step);
    }
  });
});

setFrequency(DEFAULT_FREQUENCY, { force: true });
setVolume(volume);
setToneWaveform(toneWaveform);
setNoiseType(noiseType);
setMode(mode);

if (!supportsWebAudio()) {
  setAudioStatus("Web Audio is not supported in this browser.");
  playButton.disabled = true;
}
