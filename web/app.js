import {
  loadSoundfont,
  playMidiNote,
  releaseMidiNote,
  selectSoundfontPreset,
  silenceAllNotes,
  suspendSound,
} from "./audio_engine.js?v=low-latency-1";

const isTeacherScreen = document.documentElement.dataset.screen === "teacher";
const isComposeScreen = document.documentElement.dataset.compose === "true";
document.title = `키캡 오케스트라 · ${isTeacherScreen ? "교사" : "학생"}`;
const connectionPill = document.querySelector("#connection-pill");
const connectionLabel = document.querySelector("#connection-label");
const instrumentSelect = document.querySelector("#instrument-select");
const instrumentHelp = document.querySelector("#instrument-help");
const combinationValue = document.querySelector("#combination-value");
const combinationMask = document.querySelector("#combination-mask");
const inputFeedback = document.querySelector("#input-feedback");
const audioEnableButton = document.querySelector("#audio-enable");
const soundStatus = document.querySelector("#sound-status");
const soundfontFileInput = document.querySelector("#soundfont-file");
const uploadSoundfontButton = document.querySelector("#upload-soundfont");
const soundfontFeedback = document.querySelector("#soundfont-feedback");
const soundfontList = document.querySelector("#soundfont-list");
const soundfontSelect = document.querySelector("#soundfont-select");
const presetSelect = document.querySelector("#preset-select");
const settingsButton = document.querySelector("#teacher-settings");
const teacherModal = document.querySelector("#teacher-modal");
const closeSettingsButton = document.querySelector("#close-settings");
const newInstrumentButton = document.querySelector("#new-instrument");
const resetFormButton = document.querySelector("#reset-instrument-form");
const instrumentForm = document.querySelector("#instrument-form");
const instrumentAdminList = document.querySelector("#instrument-admin-list");
const instrumentName = document.querySelector("#instrument-name");
const instrumentFamily = document.querySelector("#instrument-family");
const instrumentIcon = document.querySelector("#instrument-icon");
const formIconPreview = document.querySelector("#form-icon-preview");
const editingInstrumentId = document.querySelector("#editing-instrument-id");
const instrumentFormTitle = document.querySelector("#instrument-form-title");
const saveInstrumentButton = document.querySelector("#save-instrument");
const fingeringRows = document.querySelector("#fingering-rows");
const addFingeringRowButton = document.querySelector("#add-fingering-row");
const formFeedback = document.querySelector("#form-feedback");
const arcadeButtons = [...document.querySelectorAll(".arcade-button")];
const practiceSequence = document.querySelector("#practice-sequence");
const practiceStaff = document.querySelector("#practice-staff");
const practiceStaffScroll = document.querySelector("#practice-staff-scroll");
const practiceNextNote = document.querySelector("#practice-next-note");
const practiceCurrentNote = document.querySelector("#practice-current-note");
const practiceTitle = document.querySelector("#practice-title");
const practiceDescription = document.querySelector("#practice-description");
const practiceSongSelect = document.querySelector("#practice-song-select");
const practiceProgress = document.querySelector("#practice-progress");
const practiceNoteName = document.querySelector("#practice-note-name");
const practiceNoteDetail = document.querySelector("#practice-note-detail");
const practiceStatus = document.querySelector("#practice-status");
const practiceStartButton = document.querySelector("#practice-start");
const practiceResetButton = document.querySelector("#practice-reset");
const teacherTabInstruments = document.querySelector("#teacher-tab-instruments");
const teacherTabSongs = document.querySelector("#teacher-tab-songs");
const instrumentAdminView = document.querySelector("#instrument-admin-view");
const songAdminView = document.querySelector("#song-admin-view");
const songAdminList = document.querySelector("#song-admin-list");
const songOriginFilter = document.querySelector("#song-origin-filter");
songOriginFilter.addEventListener("change", () => renderAdminSongList());
const newSongButton = document.querySelector("#new-song");
const songForm = document.querySelector("#song-form");
const editingSongId = document.querySelector("#editing-song-id");
const songFormTitle = document.querySelector("#song-form-title");
const songTitleInput = document.querySelector("#song-title-input");
const songBpmInput = document.querySelector("#song-bpm-input");
const songDescriptionInput = document.querySelector("#song-description-input");
const songClefInput = document.querySelector("#song-clef-input");
const songMeterInput = document.querySelector("#song-meter-input");
const scoreEditorSummary = document.querySelector("#score-editor-summary");
const studentComposeOpenButton = document.querySelector("#student-compose-open");
const studentComposerModal = document.querySelector("#student-composer-modal");
const closeStudentComposerButton = document.querySelector("#close-student-composer");
const studentComposerHost = document.querySelector("#student-composer-host");
const teacherSongFormHost = document.querySelector("#teacher-song-form-host");
const studentAuthorNameInput = document.querySelector("#student-author-name");
const studentSongList = document.querySelector("#student-song-list");
const submitStudentSongButton = document.querySelector("#submit-student-song");
const songNoteRows = document.querySelector("#song-note-rows");
const addSongNoteButton = document.querySelector("#add-song-note");
const scoreStaffScroll = document.querySelector("#score-staff-scroll");
const scoreStaff = document.querySelector("#score-staff");
const scoreEditorFeedback = document.querySelector("#score-editor-feedback");
const previewSongButton = document.querySelector("#preview-song");
const stopPreviewSongButton = document.querySelector("#stop-preview-song");
const songPreviewFeedback = document.querySelector("#song-preview-feedback");
const toggleNoteListButton = document.querySelector("#toggle-note-list");
const songListEditorHeading = document.querySelector(".song-list-editor-heading");
const songListEditor = document.querySelector("#song-list-editor");
const removeScoreNoteButton = document.querySelector("#remove-score-note");
const newScoreNoteButton = document.querySelector("#new-score-note");
const fillMeasureRestsButton = document.querySelector("#fill-measure-rests");
fillMeasureRestsButton.addEventListener("click", () => {
  if (songTitleInput.disabled) return;
  const notes = getSongNoteValues();
  const {capacity, totalTicks} = measureNotation(notes, songMeterInput.value);
  const used = totalTicks % capacity;
  if (!used) return;
  const rests = measureNotation([{pitch: "R", beats: (capacity - used) / 16}], songMeterInput.value)
    .fragments.map(({pitch, beats}) => ({pitch, beats}));
  if (notes.length + rests.length > 64) {
    scoreEditorFeedback.textContent = "쉼표를 추가하면 최대 64개 음을 넘어요. 음을 줄인 뒤 다시 시도해 주세요.";
    return;
  }
  selectedScoreNoteIndex = notes.length;
  renderSongNoteRows([...notes, ...rests]);
  scoreEditorFeedback.textContent = "마지막 마디의 남은 박자를 쉼표로 채웠어요.";
});
const DURATIONS = [[4, "온"], [2, "2분"], [1, "4분"], [0.5, "8분"], [0.25, "16분"], [3, "점2분"], [1.5, "점4분"], [0.75, "점8분"]];
let advancedTools = false;
let selectedScoreRest = false;
const advancedToggle = document.querySelector("#advanced-tools");
const palette = document.querySelector(".note-tool-palette");
palette.querySelectorAll(".note-tool").forEach((button) => button.remove());
// Draw tool symbols as SVG so their shape does not depend on music fonts.
function createNoteToolIcon(beats, rest) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 44 48");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("note-tool-icon");
  const draw = (tag, attrs) => {
    const element = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    svg.append(element);
  };
  const dotted = [3, 1.5, 0.75].includes(beats);
  const base = dotted ? beats / 1.5 : beats;
  if (rest) {
    if (base >= 2) {
      draw("path", {d: "M 8 20 H 31", fill: "none", stroke: "currentColor", "stroke-width": 1.5});
      draw("rect", {x: 13, y: base === 4 ? 20 : 14, width: 14, height: 6, fill: "currentColor"});
    } else if (base === 1) {
      draw("path", {d: "M 20 6 L 28 16 L 21 24 L 27 32 Q 15 28 18 41 Q 8 32 18 28 L 13 21 L 21 13 Z", fill: "currentColor"});
    } else {
      draw("path", {d: "M 27 13 L 18 40", fill: "none", stroke: "currentColor", "stroke-width": 2.3});
      draw("path", {d: "M 14 15 Q 18 24 26 15", fill: "none", stroke: "currentColor", "stroke-width": 2});
      draw("circle", {cx: 14, cy: 15, r: 3.5, fill: "currentColor"});
      if (base === 0.25) {
        draw("path", {d: "M 11 25 Q 15 34 23 25", fill: "none", stroke: "currentColor", "stroke-width": 2});
        draw("circle", {cx: 11, cy: 25, r: 3.5, fill: "currentColor"});
      }
    }
  } else {
    draw("ellipse", {cx: 17, cy: 34, rx: base === 4 ? 9 : 7, ry: 5, transform: "rotate(-20 17 34)", fill: base >= 2 ? "none" : "currentColor", stroke: "currentColor", "stroke-width": base >= 2 ? 2.3 : 1});
    if (base < 4) draw("path", {d: "M 23 33 V 6", fill: "none", stroke: "currentColor", "stroke-width": 2});
    if (base <= 0.5) draw("path", {d: "M 23 6 C 23 15 37 14 30 26", fill: "none", stroke: "currentColor", "stroke-width": 2.5});
    if (base === 0.25) draw("path", {d: "M 23 13 C 23 22 35 21 29 32", fill: "none", stroke: "currentColor", "stroke-width": 2.5});
  }
  if (dotted) draw("circle", {cx: 36, cy: rest ? 22 : 32, r: 2, fill: "currentColor"});
  return svg;
}

const noteToolButtons = [];
DURATIONS.forEach(([beats, label], index) => {
  [false, true].forEach((rest) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-tool";
    button.draggable = false;
    button.dataset.beats = beats;
    button.dataset.rest = String(rest);
    button.dataset.advanced = String(index >= 4);
    const name = `${label}${rest ? "\uc27c\ud45c" : "\uc74c\ud45c"}`;
    button.setAttribute("aria-label", name);
    button.title = name;
    const caption = document.createElement("span");
    caption.textContent = name;
    button.append(createNoteToolIcon(beats, rest), caption);
    button.hidden = index >= 4;
    palette.insertBefore(button, palette.querySelector(".score-toolbar-divider"));
    noteToolButtons.push(button);
  });
});
function availableDurations() { return DURATIONS.slice(0, advancedTools ? 8 : 4); }
function applyEditorSettings(value) {
  if (advancedTools === value) return;
  const notes = getSongNoteValues();
  advancedTools = value;
  advancedToggle.checked = value;
  noteToolButtons.forEach((button) => { button.hidden = !value && button.dataset.advanced === "true"; });
  if (!availableDurations().some(([beats]) => beats === selectedScoreDuration)) selectedScoreDuration = 1;
  const locked = songTitleInput.disabled;
  renderSongNoteRows(notes);
  if (locked) songNoteRows.querySelectorAll("select, button").forEach((control) => { control.disabled = true; });
}
async function refreshEditorSettings() {
  try {
    const response = await fetch("/api/editor-settings");
    if (response.ok && !advancedToggle.disabled) applyEditorSettings((await response.json()).advanced_tools);
  } catch { /* Keep the last successfully loaded setting. */ }
}
advancedToggle.addEventListener("change", async () => {
  advancedToggle.disabled = true;
  try {
    const response = await fetch("/api/teacher/editor-settings", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({advanced_tools: advancedToggle.checked})});
    if (!response.ok) throw new Error("??? ???? ?????.");
    applyEditorSettings((await response.json()).advanced_tools);
  } catch (error) { advancedToggle.checked = advancedTools; alert(error.message); }
  finally { advancedToggle.disabled = false; }
});
window.addEventListener("focus", refreshEditorSettings);
setInterval(refreshEditorSettings, 5000);

const accidentalToolButtons = [...document.querySelectorAll(".accidental-tool")];
const resetSongFormButton = document.querySelector("#reset-song-form");
const saveSongButton = document.querySelector("#save-song");
const songFormFeedback = document.querySelector("#song-form-feedback");

const DEFAULT_FINGERING_NAMES = ["도", "레", "미", "파", "솔", "라", "시"];
const DEFAULT_PITCHES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"];
const DEFAULT_BUTTONS = [[1], [2], [1, 2], [3], [1, 3], [2, 3], [4]];
const buttonNumbers = new Map(arcadeButtons.map((button) => [button.dataset.keyId, button.dataset.keyId.slice(-1)]));
const localHeldButtons = new Set();
let socket;
let loadedInstruments = [];
let loadedSongs = [];
let teacherSongs = [];
let studentWorks = [];
let songEditorMode = "teacher";
let studentSongEditingId = "";
let scoreStaffBottomY = 170;
let scoreStaffViewHeight = 320;
let scoreStaffRowHeight = 320;
let scoreStaffClef = "treble";
let studentOwnerToken = localStorage.getItem("keycap-orchestra-owner-token");
if (!studentOwnerToken) {
  studentOwnerToken = crypto.randomUUID?.() ?? [...crypto.getRandomValues(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  localStorage.setItem("keycap-orchestra-owner-token", studentOwnerToken);
}
let activePracticeSong = null;
let activeFingeringByMask = new Map();
let audioContext = null;
let activeVoice = [];
let latestButtonMask = 0;
let soundingMask = -1;
let audioEnabled = false;
let audioHasBeenEnabled = false;
let audioStartPending = false;
let loadedSoundfontId = null;
let selectedPresets = [];
let activeMidiNote = [];
let activeNoteSource = null;
let instrumentLoadSequence = 0;
let loadedSoundfonts = [];
let practiceRun = null;
let selectedScoreNoteIndex = null;
let selectedScoreDuration = 1;
let selectedScoreAccidental = "";
let songPreviewRun = null;

function setSoundStatus(message, enabled = false) {
  soundStatus.textContent = message;
  soundStatus.dataset.state = enabled ? "enabled" : "disabled";
  audioEnableButton.textContent = enabled ? "🔇 소리 끄기" : "🔊 소리 켜기";
}

async function enableAudio() {
  if (audioStartPending) return;
  audioStartPending = true;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("이 브라우저는 오디오 재생을 지원하지 않아요.");
    if (!audioContext) audioContext = new AudioContextClass({ latencyHint: "interactive" });
    // Keep the fallback oscillator independent from the optional SoundFont
    // AudioWorklet. A SoundFont initialization error must not mute basic audio.
    await audioContext.resume();
    if (audioContext.state !== "running") throw new Error("브라우저 오디오가 시작되지 않았어요.");
    audioEnabled = true;
    audioHasBeenEnabled = true;
    setSoundStatus("소리 켜짐 · 버튼을 누르고 있으면 음이 이어져요.", true);
    await activateSelectedInstrumentSound();
    syncAudioNote(latestButtonMask);
  } catch (error) {
    audioEnabled = false;
    setSoundStatus(`소리를 켜지 못했어요: ${error.message}`);
  } finally {
    audioStartPending = false;
  }
}

function disableAudio() {
  stopSongPreview(null);
  stopActiveNote();
  if (audioContext) audioContext.suspend();
  suspendSound();
  audioEnabled = false;
  setSoundStatus("소리가 꺼져 있어요.");
}

function pitchToMidi(pitchName) {
  const match = /^([A-G])([#b♯♭]?)(-?\d+)$/.exec(pitchName);
  if (!match) return null;
  const noteNumbers = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2];
  const offset = accidental === "#" || accidental === "♯"
    ? 1
    : accidental === "b" || accidental === "♭" ? -1 : 0;
  const semitone = noteNumbers[match[1]] + offset;
  return (Number(match[3]) + 1) * 12 + semitone;
}

function pitchToFrequency(pitchName) {
  const midiNumber = pitchToMidi(pitchName);
  return midiNumber === null ? null : 440 * 2 ** ((midiNumber - 69) / 12);
}

async function loadSoundfontPresets(soundfontId) {
  const response = await fetch(`/api/soundfonts/${soundfontId}/file`);
  if (!response.ok) throw new Error("음원 파일을 불러오지 못했습니다.");
  const presets = await loadSoundfont(soundfontId, await response.arrayBuffer());
  loadedSoundfontId = String(soundfontId);
  return presets;
}

async function activateSelectedInstrumentSound() {
  const instrument = loadedInstruments.find((item) => String(item.id) === instrumentSelect.value);
  const sequence = ++instrumentLoadSequence;
  if (!instrument?.soundfont_id || !instrument.preset) return;
  try {
    if (String(instrument.soundfont_id) !== loadedSoundfontId) {
      setSoundStatus("악기 음원을 불러오는 중…", true);
      selectedPresets = await loadSoundfontPresets(instrument.soundfont_id);
    }
    if (sequence !== instrumentLoadSequence) return;
    await selectSoundfontPreset(instrument.preset);
    if (sequence !== instrumentLoadSequence) return;
    setSoundStatus(`${instrument.display_name} 음색 준비 완료`, true);
  } catch (error) {
    if (sequence !== instrumentLoadSequence) return;
    loadedSoundfontId = null;
    setSoundStatus(`음원 준비 실패: ${error.message}`);
  }
}

function stopActiveNote() {
  if (activeNoteSource === "soundfont") {
    activeMidiNote.forEach(releaseMidiNote);
    silenceAllNotes();
  } else if (activeVoice.length && audioContext) {
    const now = audioContext.currentTime;
    for (const voice of activeVoice) {
    const gain = voice.gain;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
    gain.gain.linearRampToValueAtTime(0, now + 0.005);
    try { voice.oscillator.stop(now + 0.006); } catch { /* 이미 종료된 음 */ }
    }
  }
  activeVoice = [];
  activeMidiNote = [];
  activeNoteSource = null;
}

function releaseSongPreviewNote(run) {
  if (run.activeMidi !== null) {
    releaseMidiNote(run.activeMidi);
    run.activeMidi = null;
  }
  if (run.activeOscillator && audioContext) {
    const now = audioContext.currentTime;
    run.activeGain.gain.cancelScheduledValues(now);
    run.activeGain.gain.setValueAtTime(Math.max(run.activeGain.gain.value, 0.0001), now);
    run.activeGain.gain.linearRampToValueAtTime(0, now + 0.06);
    try { run.activeOscillator.stop(now + 0.07); } catch { /* 이미 종료된 미리 듣기 음 */ }
    run.activeOscillator = null;
    run.activeGain = null;
  }
}

function stopSongPreview(message = "미리 재생을 정지했어요.") {
  const run = songPreviewRun;
  if (run) {
    window.clearTimeout(run.releaseTimer);
    window.clearTimeout(run.nextTimer);
    releaseSongPreviewNote(run);
  }
  songPreviewRun = null;
  previewSongButton.disabled = false;
  previewSongButton.textContent = "▶ 곡 미리 듣기";
  stopPreviewSongButton.disabled = true;
  if (message !== null && run) {
    songPreviewFeedback.dataset.state = "";
    songPreviewFeedback.textContent = message;
  }
}

function playNextSongPreviewNote(run) {
  if (songPreviewRun !== run) return;
  if (run.index >= run.notes.length) {
    stopSongPreview("곡 미리 듣기를 마쳤어요.");
    songPreviewFeedback.dataset.state = "success";
    return;
  }

  const note = run.notes[run.index];
  const midiNote = pitchToMidi(note.pitch);
  const instrument = loadedInstruments.find((item) => String(item.id) === instrumentSelect.value);
  const usesSoundfont = Boolean(
    instrument?.soundfont_id
    && instrument.preset
    && String(instrument.soundfont_id) === loadedSoundfontId,
  );
  const durationMs = Number(note.beats) * (60000 / run.bpm);
  const holdMs = durationMs * 0.88;

  if (note.pitch === "R") {
    // A rest advances the same clock without creating a voice.
  } else if (usesSoundfont) {
    run.activeMidi = midiNote;
    playMidiNote(midiNote).catch((error) => {
      if (songPreviewRun === run) {
        songPreviewFeedback.dataset.state = "error";
        songPreviewFeedback.textContent = `음 재생 실패: ${error.message}`;
        stopSongPreview(null);
      }
    });
  } else {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(440 * 2 ** ((midiNote - 69) / 12), now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    run.activeOscillator = oscillator;
    run.activeGain = gain;
  }

  songPreviewFeedback.textContent = `재생 중 · ${run.index + 1}/${run.notes.length} · ${note.pitch}`;
  run.releaseTimer = window.setTimeout(() => releaseSongPreviewNote(run), holdMs);
  run.nextTimer = window.setTimeout(() => {
    releaseSongPreviewNote(run);
    run.index += 1;
    playNextSongPreviewNote(run);
  }, durationMs);
}

async function startSongPreview() {
  stopSongPreview(null);
  songPreviewFeedback.dataset.state = "";
  try {
    const song = collectSongPayload();
    if (latestButtonMask !== 0) throw new Error("키캡 버튼에서 손을 뗀 뒤 미리 듣기를 시작해 주세요.");
    if (!audioEnabled || !audioContext || audioContext.state !== "running") await enableAudio();
    if (!audioEnabled || !audioContext || audioContext.state !== "running") {
      throw new Error("소리를 켤 수 없어요. 브라우저의 소리 설정을 확인해 주세요.");
    }
    await activateSelectedInstrumentSound();
    stopActiveNote();
    soundingMask = 0;
    songPreviewRun = { notes: song.notes, bpm: song.bpm, index: 0, activeMidi: null, activeOscillator: null, activeGain: null };
    previewSongButton.disabled = true;
    previewSongButton.textContent = "재생 중…";
    stopPreviewSongButton.disabled = false;
    playNextSongPreviewNote(songPreviewRun);
  } catch (error) {
    songPreviewFeedback.dataset.state = "error";
    songPreviewFeedback.textContent = error.message;
    previewSongButton.disabled = false;
    previewSongButton.textContent = "▶ 곡 미리 듣기";
    stopPreviewSongButton.disabled = true;
  }
}

function syncAudioNote(mask) {
  latestButtonMask = mask;
  if (songPreviewRun) stopSongPreview("키캡 입력이 시작되어 미리 재생을 멈췄어요.");
  if (!audioEnabled || !audioContext || audioContext.state !== "running") return;
  if (mask === 0) {
    stopActiveNote();
    soundingMask = 0;
    return;
  }
  if (mask === soundingMask && (activeVoice.length || activeMidiNote.length)) return;

  const fingering = activeFingeringByMask.get(mask);
  const pitches = fingering ? (fingering.pitch_names ?? [fingering.pitch_name]) : [];
  const midiNotes = pitches.map(pitchToMidi);
  const frequencies = pitches.map(pitchToFrequency);
  stopActiveNote();
  soundingMask = mask;
  if (!pitches.length || midiNotes.some((note) => note === null) || frequencies.some((frequency) => !frequency)) {
    setSoundStatus(
      instrumentSelect.value ? "이 버튼 조합은 선택한 악기 운지표에 없어요." : "먼저 교사 설정에서 악기를 등록하고 선택해 주세요.",
      true,
    );
    return;
  }

  const selected = loadedInstruments.find((item) => String(item.id) === instrumentSelect.value);
  if (selected?.soundfont_id && selected.preset) {
    if (String(selected.soundfont_id) === loadedSoundfontId) {
      activeMidiNote = midiNotes;
      activeNoteSource = "soundfont";
      midiNotes.forEach((note) => playMidiNote(note, Math.round(96 / Math.sqrt(midiNotes.length))).catch((error) => setSoundStatus(`음 재생 실패: ${error.message}`)));
      return;
    }
    setSoundStatus("음원을 준비 중이에요. 준비되는 동안 기본 전자음으로 연주해요.", true);
  }

  for (const frequency of frequencies) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.12 / frequencies.length, now + 0.003);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  activeVoice.push({ oscillator, gain });
  }
  activeNoteSource = "oscillator";
}

function setConnection(state, label) {
  connectionPill.dataset.state = state;
  connectionLabel.textContent = label;
}

function getSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function connectSocket() {
  socket = new WebSocket(getSocketUrl());
  setConnection("connecting", "서버 연결 중");

  socket.addEventListener("open", () => setConnection("connected", "서버 연결됨"));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "input_state") {
      if (message.last_event === "device_timeout") resetPractice();
      renderInputState(message.held_buttons, message.button_mask, message.last_event, message.key_id);
    }
  });
  socket.addEventListener("close", () => {
    localHeldButtons.clear();
    resetPractice();
    renderInputState([], 0, "disconnected", null);
    setConnection("disconnected", "연결 끊김 · 다시 연결 중");
    window.setTimeout(connectSocket, 1500);
  });
  socket.addEventListener("error", () => socket.close());
}

function sendButtonEvent(type, keyId) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    inputFeedback.textContent = "서버에 연결되면 버튼 입력을 보낼 수 있어요.";
    return;
  }
  socket.send(JSON.stringify({ type, key_id: keyId }));
}

function renderInputState(heldButtons, mask, eventType, keyId) {
  const pressed = new Set(heldButtons);
  arcadeButtons.forEach((button) => {
    const isPressed = pressed.has(button.dataset.keyId);
    button.classList.toggle("is-pressed", isPressed);
    button.setAttribute("aria-pressed", String(isPressed));
  });

  const numericMask = Number(mask);
  syncAudioNote(numericMask);
  handlePracticeInput(numericMask);
  const numbers = [...pressed].map((id) => buttonNumbers.get(id)).sort();
  const fingering = activeFingeringByMask.get(numericMask);
  if (numericMask === 0) {
    combinationValue.textContent = "쉼";
  } else if (fingering) {
    combinationValue.textContent = `${fingering.solfege} · ${(fingering.pitch_names ?? [fingering.pitch_name]).join(" + ")}`;
  } else {
    combinationValue.textContent = `버튼 ${numbers.join(" + ")}`;
  }
  combinationMask.textContent = numericMask.toString(2).padStart(4, "0");
  const eventLabel = eventType === "key_down" ? "눌림" : "뗌";
  const keyLabel = buttonNumbers.get(keyId) ?? "?";
  inputFeedback.textContent = eventType === "device_state"
    ? `물리 버튼 입력 반영 · ${numbers.length ? numbers.join(" + ") : "모두 뗌"}`
    : eventType === "device_timeout" ? "물리 버튼 연결이 끊겨 입력을 해제했어요."
    : eventType === "disconnected" ? "서버 연결이 끊겨 입력을 해제했어요."
    : `서버가 버튼 ${keyLabel} ${eventLabel} 입력을 받았어요.`;
}

function practiceFingeringFor(step) {
  if (!step) return null;
  const instrument = loadedInstruments.find((item) => String(item.id) === instrumentSelect.value);
  const targetMidi = pitchToMidi(step.pitch);
  return instrument?.fingerings.find((item) => (item.pitch_names ?? [item.pitch_name]).length === 1 && pitchToMidi(item.pitch_name) === targetMidi) ?? null;
}

function beatLabel(beats) {
  if (beats === 0.5) return "0.5박";
  return `${beats}박`;
}

function updatePracticeDisplay() {
  const instrument = loadedInstruments.find((item) => String(item.id) === instrumentSelect.value);
  const song = activePracticeSong;
  const run = practiceRun;
  const finished = Boolean(run?.finished);
  const countingDown = run?.phase === "countdown";
  practiceCurrentNote.dataset.phase = run?.phase ?? "idle";
  practiceTitle.textContent = song?.title ?? "연습곡이 없습니다";
  if (!song) {
    practiceDescription.textContent = "교사 설정의 연습곡 관리에서 곡을 등록해 주세요.";
    practiceProgress.textContent = "곡을 등록해요";
    practiceNoteName.textContent = "♪";
    practiceNoteDetail.textContent = "연습곡이 등록되면 계이름을 보여줘요.";
    practiceNextNote.textContent = "다음 음: -";
    practiceSequence.replaceChildren();
    practiceStaff.replaceChildren();
    practiceStartButton.disabled = true;
    practiceStartButton.textContent = "연습 시작";
    return;
  }
  practiceDescription.textContent = `${song.description ? `${song.description} · ` : ""}${song.notes.length}개 음 · ${song.bpm} BPM`;
  const noteCount = song.notes.length;
  const stepIndex = Math.min(run?.index ?? 0, noteCount - 1);
  const step = song.notes[stepIndex];
  const fingering = instrument && !finished ? practiceFingeringFor(step) : null;

  practiceProgress.textContent = finished
    ? "연주 완료!"
    : countingDown
      ? "곧 시작해요!"
    : run
      ? `${stepIndex + 1} / ${noteCount}번째 음`
      : instrument ? `${noteCount}개 음 · ${song.bpm} BPM` : "악기를 선택해요";
  if (finished) {
    const stars = run.score >= 90 ? "⭐⭐⭐" : run.score >= 70 ? "⭐⭐" : "⭐";
    practiceNoteName.textContent = `${stars} ${run.score}점`;
  } else {
    practiceNoteName.textContent = countingDown
      ? String(run.countIn)
      : fingering?.solfege ?? step.pitch;
  }
  if (finished) {
    practiceNoteDetail.textContent = `음정 ${run.pitchHits}/${noteCount} · 박자 ${run.rhythmHits}/${noteCount}`;
  } else if (countingDown) {
    practiceNoteDetail.textContent = "키캡을 잡고 준비하세요!";
  } else if (!instrument) {
    practiceNoteDetail.textContent = "악기를 선택하면 연주할 음을 보여줘요.";
  } else if (!fingering) {
    practiceNoteDetail.textContent = `${step.pitch} 음이 이 악기의 운지표에 없어요.`;
  } else {
    const buttons = [1, 2, 3, 4].filter((button) =>
      (Number(fingering.button_mask) & (1 << (button - 1))) !== 0,
    ).join("+");
    const length = `${step.beats <= 1 ? "짧게" : "길게"} · ${beatLabel(step.beats)}`;
    practiceNoteDetail.textContent = `${step.pitch} · 버튼 ${buttons} · ${length}`;
  }

  const nextStep = song.notes[stepIndex + 1];
  const nextFingering = instrument && nextStep ? practiceFingeringFor(nextStep) : null;
  practiceNextNote.textContent = finished
    ? "곡을 다시 시작해 보세요!"
    : nextStep
      ? `다음 음: ${nextFingering?.solfege ?? nextStep.pitch} · ${beatLabel(nextStep.beats)}`
      : "마지막 음이에요!";

  renderScoreStaff(song.notes, {svg: practiceStaff, container: practiceStaffScroll, clef: song.clef ?? "treble", meter: song.time_signature ?? "4/4"});
  practiceSequence.replaceChildren();
  song.notes.forEach((songStep, index) => {
    const tile = document.createElement("span");
    tile.className = "practice-sequence-note";
    tile.textContent = practiceFingeringFor(songStep)?.solfege ?? songStep.pitch;
    if (run && index < run.index) tile.classList.add("is-done");
    if (run && !finished && index === run.index) tile.classList.add("is-current");
    practiceSequence.append(tile);
  });
  practiceStartButton.disabled = !instrument;
  practiceStartButton.textContent = countingDown ? "시작 준비 중…" : run && !finished ? "다시 시작" : finished ? "다시 연습" : "연습 시작";
}

function clearPracticeTimers(run) {
  if (run.wrongTimer) window.clearTimeout(run.wrongTimer);
  if (run.advanceTimer) window.clearTimeout(run.advanceTimer);
  if (run.countdownTimer) window.clearInterval(run.countdownTimer);
}

function resetPractice() {
  if (practiceRun) clearPracticeTimers(practiceRun);
  practiceRun = null;
  practiceStatus.textContent = "준비되면 시작을 눌러요.";
  updatePracticeDisplay();
}

function startPractice() {
  const song = activePracticeSong;
  const instrument = loadedInstruments.find((item) => String(item.id) === instrumentSelect.value);
  if (!song) {
    practiceStatus.textContent = "먼저 교사 설정에서 연습곡을 등록해 주세요.";
    return;
  }
  if (!instrument) {
    practiceStatus.textContent = "먼저 악기를 선택해 주세요.";
    return;
  }
  if (latestButtonMask !== 0) {
    practiceStatus.textContent = "버튼을 모두 놓은 뒤 시작해 주세요.";
    return;
  }
  const missingPitches = [...new Set(song.notes
    .filter((step) => !practiceFingeringFor(step))
    .map((step) => step.pitch))];
  if (missingPitches.length) {
    practiceStatus.textContent = `운지표에 ${missingPitches.join(", ")} 음을 추가해 주세요.`;
    updatePracticeDisplay();
    return;
  }

  if (practiceRun) clearPracticeTimers(practiceRun);
  practiceRun = {
    phase: "countdown",
    song,
    index: 0,
    countIn: 3,
    heldAt: null,
    wrongTimer: null,
    advanceTimer: null,
    countdownTimer: null,
    wrongMask: null,
    pitchHits: 0,
    rhythmHits: 0,
    score: 0,
    finished: false,
  };
  const run = practiceRun;
  practiceStatus.textContent = "3초 뒤 시작해요! 키캡을 잡고 준비하세요.";
  updatePracticeDisplay();
  run.countdownTimer = window.setInterval(() => {
    if (practiceRun !== run) {
      window.clearInterval(run.countdownTimer);
      return;
    }
    run.countIn -= 1;
    if (run.countIn <= 0) {
      window.clearInterval(run.countdownTimer);
      run.countdownTimer = null;
      run.phase = "playing";
      practiceStatus.textContent = "시작! 첫 음을 연주해요.";
    } else {
      practiceStatus.textContent = `${run.countIn}초 뒤 시작해요!`;
    }
    updatePracticeDisplay();
  }, 1000);
}

function handlePracticeInput(mask) {
  const run = practiceRun;
  if (!run || run.phase !== "playing" || run.finished || run.advanceTimer) return;
  const step = run.song.notes[run.index];
  const fingering = practiceFingeringFor(step);
  if (!fingering) return;
  const expectedMask = Number(fingering.button_mask);

  if (run.heldAt !== null) {
    if (mask === expectedMask) return;
    if (run.wrongTimer) window.clearTimeout(run.wrongTimer);
    const heldMilliseconds = performance.now() - run.heldAt;
    run.heldAt = null;
    run.pitchHits += 1;
    const beatMilliseconds = 60000 / run.song.bpm;
    const expectedMilliseconds = step.beats * beatMilliseconds;
    const tolerance = Math.max(180, expectedMilliseconds * 0.3);
    const rhythmMatched = Math.abs(heldMilliseconds - expectedMilliseconds) <= tolerance;
    if (rhythmMatched) run.rhythmHits += 1;
    run.phase = "judging";
    practiceStatus.textContent = rhythmMatched
      ? "좋아요! 음정과 박자가 맞았어요."
      : `계이름은 맞았어요. ${step.beats}박 동안 눌러 보세요.`;
    run.advanceTimer = window.setTimeout(() => {
      run.advanceTimer = null;
      run.index += 1;
      if (run.index >= run.song.notes.length) {
        run.finished = true;
        run.phase = "finished";
        run.score = Math.round(((run.pitchHits + run.rhythmHits) / (run.song.notes.length * 2)) * 100);
        practiceStatus.textContent = `완주했어요! ${run.score}점 · 음정 ${run.pitchHits}/${run.song.notes.length} · 박자 ${run.rhythmHits}/${run.song.notes.length}`;
      } else {
        run.phase = "playing";
        practiceStatus.textContent = "다음 음을 연주해요.";
      }
      updatePracticeDisplay();
    }, 450);
    return;
  }

  if (mask === expectedMask) {
    if (run.wrongTimer) window.clearTimeout(run.wrongTimer);
    run.wrongTimer = null;
    run.wrongMask = null;
    run.heldAt = performance.now();
    practiceStatus.textContent = `좋아요! ${beatLabel(step.beats)} 동안 눌러요.`;
    return;
  }

  if (mask === 0) {
    if (run.wrongTimer) window.clearTimeout(run.wrongTimer);
    run.wrongTimer = null;
    run.wrongMask = null;
    return;
  }

  if (run.wrongTimer) window.clearTimeout(run.wrongTimer);
  run.wrongMask = mask;
  run.wrongTimer = window.setTimeout(() => {
    if (practiceRun === run && run.heldAt === null && run.wrongMask === mask) {
      practiceStatus.textContent = "버튼 조합이 달라요. 표시된 번호를 확인해요.";
    }
  }, 300);
}

function pressButton(keyId) {
  if (localHeldButtons.has(keyId)) return;
  localHeldButtons.add(keyId);
  if (!audioEnabled && !audioHasBeenEnabled) enableAudio();
  else if (audioEnabled && audioContext?.state === "suspended") audioContext.resume();
  sendButtonEvent("key_down", keyId);
}

function releaseButton(keyId) {
  if (!localHeldButtons.has(keyId)) return;
  localHeldButtons.delete(keyId);
  sendButtonEvent("key_up", keyId);
}

arcadeButtons.forEach((button) => {
  const keyId = button.dataset.keyId;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pressButton(keyId);
  });
  button.addEventListener("pointerup", () => releaseButton(keyId));
  button.addEventListener("pointercancel", () => releaseButton(keyId));
  button.addEventListener("lostpointercapture", () => releaseButton(keyId));
  button.addEventListener("contextmenu", (event) => event.preventDefault());
});

window.addEventListener("blur", () => [...localHeldButtons].forEach(releaseButton));

function applySelectedInstrument() {
  const selected = loadedInstruments.find((item) => String(item.id) === instrumentSelect.value);
  activeFingeringByMask = new Map(
    (selected?.fingerings ?? []).map((item) => [Number(item.button_mask), item]),
  );
  if (selected) {
    instrumentHelp.textContent = selected.preset
      ? `${selected.display_name} · ${selected.preset.name} 음색을 적용했어요.`
      : `${selected.display_name} 운지표를 적용했어요. 기본 전자음을 사용합니다.`;
  } else if (loadedInstruments.length === 0) {
    instrumentHelp.textContent = "교사 설정에서 악기와 운지표를 등록하면 이 목록에 나타나요.";
  } else {
    instrumentHelp.textContent = "악기를 선택하면 해당 악기의 운지표를 적용해요.";
  }
  stopActiveNote();
  soundingMask = -1;
  if (audioEnabled && selected?.soundfont_id) {
    activateSelectedInstrumentSound().then(() => {
      if (audioEnabled) {
        soundingMask = -1;
        syncAudioNote(latestButtonMask);
      }
    });
  } else {
    syncAudioNote(latestButtonMask);
  }
  updatePracticeDisplay();
}

async function loadInstruments() {
  try {
    const response = await fetch("/api/instruments");
    const instruments = await response.json();
    if (!response.ok) throw new Error(instruments.detail ?? "악기 목록을 불러오지 못했습니다.");
    const previousValue = instrumentSelect.value;
    loadedInstruments = instruments;
    instrumentSelect.replaceChildren();

    if (instruments.length === 0) {
      instrumentSelect.add(new Option("등록된 악기가 없어요", ""));
      instrumentSelect.disabled = true;
    } else {
      instrumentSelect.disabled = false;
      instrumentSelect.add(new Option("악기를 골라요", ""));
      instruments.forEach((instrument) => {
        const family = instrument.family ? ` · ${instrument.family}` : "";
        instrumentSelect.add(new Option(`${instrument.icon} ${instrument.display_name}${family}`, instrument.id));
      });
      if (instruments.some((item) => String(item.id) === previousValue)) {
        instrumentSelect.value = previousValue;
      } else {
        instrumentSelect.value = String(instruments[0].id);
      }
    }
    applySelectedInstrument();
    renderAdminInstrumentList();
  } catch (error) {
    instrumentSelect.replaceChildren(new Option("서버 연결을 확인해 주세요", ""));
    instrumentSelect.disabled = true;
    instrumentHelp.textContent = error.message;
  }
}

async function loadSongs(preferredId = null) {
  try {
    const response = await fetch("/api/songs");
    const songs = await response.json();
    if (!response.ok) throw new Error(songs.detail ?? "연습곡을 불러오지 못했습니다.");
    const previousId = preferredId ?? practiceSongSelect.value;
    loadedSongs = songs;
    practiceSongSelect.replaceChildren();
    if (songs.length === 0) {
      practiceSongSelect.add(new Option("등록된 연습곡이 없어요", ""));
      practiceSongSelect.disabled = true;
      activePracticeSong = null;
    } else {
      practiceSongSelect.disabled = false;
      for (const [origin, label] of [["teacher", "교사 작곡"], ["student", "학생 작곡"]]) {
        const group = document.createElement("optgroup");
        group.label = label;
        songs.filter((song) => song.composer_type === origin).forEach((song) => {
          group.append(new Option(`${song.title}${song.author_name ? ` · 작곡: ${song.author_name}` : ""} · ${song.bpm} BPM`, String(song.id)));
        });
        if (group.children.length) practiceSongSelect.append(group);
      }
      practiceSongSelect.value = songs.some((song) => String(song.id) === String(previousId))
        ? String(previousId)
        : String(songs[0].id);
      activePracticeSong = songs.find((song) => String(song.id) === practiceSongSelect.value) ?? null;
    }
    updatePracticeDisplay();
  } catch (error) {
    loadedSongs = [];
    activePracticeSong = null;
    practiceSongSelect.replaceChildren(new Option("서버 연결을 확인해 주세요", ""));
    practiceSongSelect.disabled = true;
    practiceStatus.textContent = error.message;
    updatePracticeDisplay();
  }
}

async function loadTeacherSongs() {
  try {
    const response = await fetch("/api/teacher/songs");
    const songs = await response.json();
    if (!response.ok) throw new Error(songs.detail ?? "교사용 곡 목록을 불러오지 못했습니다.");
    teacherSongs = songs;
  } catch (error) {
    teacherSongs = [];
    songFormFeedback.dataset.state = "error";
    songFormFeedback.textContent = error.message;
  }
  renderAdminSongList();
}

async function loadStudentWorks() {
  try {
    const response = await fetch("/api/student/songs", { headers: { "X-Owner-Token": studentOwnerToken } });
    const works = await response.json();
    if (!response.ok) throw new Error(works.detail ?? "내 작품을 불러오지 못했습니다.");
    studentWorks = works;
  } catch (error) {
    studentWorks = [];
    studentSongList.replaceChildren();
    const message = document.createElement("p");
    message.className = "empty-instrument-list";
    message.textContent = error.message;
    studentSongList.append(message);
    return;
  }
  renderStudentWorks();
}

function studentStatusLabel(status) {
  return ({ draft: "임시 저장", submitted: "검토 중", changes_requested: "수정 요청", published: "공개됨" })[status] ?? status;
}

function renderStudentWorks() {
  studentSongList.replaceChildren();
  if (!studentWorks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-instrument-list";
    empty.textContent = "아직 작품이 없어요. 오선지에서 첫 곡을 만들어 보세요.";
    studentSongList.append(empty);
    return;
  }
  studentWorks.forEach((song) => {
    const item = document.createElement("article");
    item.className = "student-work-item";
    const title = document.createElement("strong");
    title.textContent = song.title;
    const state = document.createElement("span");
    state.className = `student-work-status status-${song.status}`;
    state.textContent = studentStatusLabel(song.status);
    const meta = document.createElement("small");
    meta.textContent = `작곡: ${song.author_name} · ${song.notes.length}개 음 · ${song.bpm} BPM · ${song.time_signature}`;
    item.append(title, state, meta);
    if (song.review_note) {
      const review = document.createElement("p");
      review.className = "student-review-note";
      review.textContent = `선생님 의견: ${song.review_note}`;
      item.append(review);
    }
    if (["draft", "changes_requested"].includes(song.status)) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "icon-action";
      edit.textContent = "계속 만들기";
      edit.addEventListener("click", () => editStudentWork(song.id));
      item.append(edit);
    }
    studentSongList.append(item);
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function presetMatches(left, right) {
  return left && right
    && Number(left.program) === Number(right.program)
    && Number(left.bankMSB ?? 0) === Number(right.bankMSB ?? 0)
    && Number(left.bankLSB ?? 0) === Number(right.bankLSB ?? 0);
}

async function loadPresetsForForm(soundfontId, preferredPreset = null) {
  presetSelect.replaceChildren();
  if (!soundfontId) {
    presetSelect.add(new Option("기본 전자음 사용", ""));
    presetSelect.disabled = true;
    return;
  }

  presetSelect.add(new Option("음색을 불러오는 중…", ""));
  presetSelect.disabled = true;
  try {
    const presets = String(soundfontId) === loadedSoundfontId
      ? selectedPresets
      : await loadSoundfontPresets(soundfontId);
    selectedPresets = presets;
    presetSelect.replaceChildren();
    if (presets.length === 0) {
      presetSelect.add(new Option("사용 가능한 음색이 없습니다", ""));
      return;
    }
    presets.forEach((preset, index) => {
      const option = new Option(preset.name, String(index));
      option.dataset.preset = JSON.stringify(preset);
      presetSelect.add(option);
    });
    presetSelect.disabled = false;
    const matchingIndex = preferredPreset
      ? presets.findIndex((preset) => presetMatches(preset, preferredPreset))
      : 0;
    presetSelect.selectedIndex = Math.max(0, matchingIndex);
    const chosenPreset = presets[presetSelect.selectedIndex];
    if (chosenPreset) await selectSoundfontPreset(chosenPreset);
  } catch (error) {
    presetSelect.replaceChildren(new Option("음색을 읽을 수 없습니다", ""));
    presetSelect.disabled = true;
    soundfontFeedback.dataset.state = "error";
    soundfontFeedback.textContent = error.message;
  }
}

async function loadSoundfonts() {
  try {
    const response = await fetch("/api/soundfonts");
    const soundfonts = await response.json();
    if (!response.ok) throw new Error(soundfonts.detail ?? "음원 목록을 불러오지 못했습니다.");
    const previousId = soundfontSelect.value;
    loadedSoundfonts = soundfonts;
    soundfontSelect.replaceChildren(new Option("기본 전자음 사용", ""));
    soundfonts.forEach((soundfont) => {
      soundfontSelect.add(new Option(soundfont.display_name, soundfont.id));
    });
    if (soundfonts.some((soundfont) => String(soundfont.id) === previousId)) {
      soundfontSelect.value = previousId;
    }
    renderSoundfontList();
  } catch (error) {
    soundfontFeedback.dataset.state = "error";
    soundfontFeedback.textContent = error.message;
  }
}

function renderSoundfontList() {
  soundfontList.replaceChildren();
  if (loadedSoundfonts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "small-help";
    empty.textContent = "등록된 음원 파일이 없어요.";
    soundfontList.append(empty);
    return;
  }
  loadedSoundfonts.forEach((soundfont) => {
    const item = document.createElement("div");
    item.className = "soundfont-item";
    const name = document.createElement("span");
    name.className = "soundfont-item-name";
    name.textContent = soundfont.display_name;
    name.title = soundfont.display_name;
    const size = document.createElement("span");
    size.className = "soundfont-item-size";
    size.textContent = formatFileSize(soundfont.size_bytes);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-action delete-action";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => removeSoundfont(soundfont.id, soundfont.display_name));
    item.append(name, size, remove);
    soundfontList.append(item);
  });
}

async function uploadSoundfont() {
  const file = soundfontFileInput.files[0];
  if (!file) {
    soundfontFeedback.dataset.state = "error";
    soundfontFeedback.textContent = "먼저 SF2 또는 DLS 파일을 선택해 주세요.";
    return;
  }
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["sf2", "dls"].includes(extension)) {
    soundfontFeedback.dataset.state = "error";
    soundfontFeedback.textContent = "SF2 또는 DLS 파일만 등록할 수 있어요.";
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    soundfontFeedback.dataset.state = "error";
    soundfontFeedback.textContent = "파일 크기는 100MB 이하여야 합니다.";
    return;
  }

  uploadSoundfontButton.disabled = true;
  soundfontFeedback.dataset.state = "";
  soundfontFeedback.textContent = "파일을 저장하고 음색을 읽는 중…";
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/teacher/soundfonts", { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "음원 파일을 등록하지 못했습니다.");
    await loadSoundfonts();
    soundfontSelect.value = String(result.id);
    await loadPresetsForForm(result.id);
    soundfontFeedback.dataset.state = "success";
    soundfontFeedback.textContent = `${result.display_name} 등록 완료 · 음색을 선택해 주세요.`;
    soundfontFileInput.value = "";
  } catch (error) {
    soundfontFeedback.dataset.state = "error";
    soundfontFeedback.textContent = error.message;
  } finally {
    uploadSoundfontButton.disabled = false;
  }
}

async function removeSoundfont(soundfontId, displayName) {
  if (!window.confirm(`“${displayName}” 음원 파일을 삭제할까요? 이 음원을 사용 중인 악기에서는 음색 설정이 해제됩니다.`)) return;
  try {
    const response = await fetch(`/api/teacher/soundfonts/${soundfontId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "음원 파일을 삭제하지 못했습니다.");
    await loadSoundfonts();
    await loadInstruments();
    resetInstrumentForm();
    soundfontFeedback.dataset.state = "success";
    soundfontFeedback.textContent = result.message;
  } catch (error) {
    soundfontFeedback.dataset.state = "error";
    soundfontFeedback.textContent = error.message;
  }
}

instrumentSelect.addEventListener("change", () => {
  stopSongPreview("악기가 바뀌어 미리 재생을 멈췄어요.");
  applySelectedInstrument();
});
practiceSongSelect.addEventListener("change", () => {
  activePracticeSong = loadedSongs.find((song) => String(song.id) === practiceSongSelect.value) ?? null;
  resetPractice();
});
soundfontSelect.addEventListener("change", () => loadPresetsForForm(soundfontSelect.value));
uploadSoundfontButton.addEventListener("click", uploadSoundfont);
teacherTabInstruments.addEventListener("click", () => setTeacherView("instruments"));
teacherTabSongs.addEventListener("click", () => setTeacherView("songs"));
newSongButton.addEventListener("click", () => {
  resetSongForm();
  songTitleInput.focus();
});
songForm.addEventListener("submit", saveSong);
previewSongButton.addEventListener("click", startSongPreview);
stopPreviewSongButton.addEventListener("click", () => stopSongPreview());
addSongNoteButton.addEventListener("click", addSongNoteRow);
resetSongFormButton.addEventListener("click", resetSongForm);
songNoteRows.addEventListener("change", () => {
  stopSongPreview("음표가 바뀌어 미리 재생을 멈췄어요.");
  renderScoreStaff(getSongNoteValues());
});
toggleNoteListButton.addEventListener("click", () => {
  const opening = songListEditor.hidden;
  songListEditor.hidden = !opening;
  songListEditorHeading.hidden = !opening;
  toggleNoteListButton.setAttribute("aria-expanded", String(opening));
  toggleNoteListButton.textContent = opening ? "목록 편집 닫기" : "목록으로 편집";
});
noteToolButtons.forEach((button) => {
  button.addEventListener("click", () => chooseScoreDuration(Number(button.dataset.beats), button.dataset.rest === "true"));
});
// Both hover and click use this conversion, including wrapped staff rows.
function staffPointerTarget(event) {
  const rect = scoreStaff.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const width = Number(scoreStaff.getAttribute("width"));
  const x = (event.clientX - rect.left) * width / rect.width;
  const svgY = (event.clientY - rect.top) * scoreStaffViewHeight / rect.height;
  if (x < 70 || x > width - 20 || svgY < 0 || svgY >= scoreStaffViewHeight) return null;
  const row = Math.floor(svgY / scoreStaffRowHeight);
  const pitch = pitchFromStaffY(svgY - row * scoreStaffRowHeight);
  if (!pitch) return null;
  const appliedPitch = applySelectedAccidental(pitch);
  return {x, row, pitch: appliedPitch, y: scoreStaffBottomY + row * scoreStaffRowHeight - pitchToStaffStep(appliedPitch) * 10};
}
function clearStaffPitchPreview() {
  scoreStaff.querySelector(".staff-pitch-preview")?.remove();
}
scoreStaff.addEventListener("pointerleave", clearStaffPitchPreview);
scoreStaff.addEventListener("pointermove", (event) => {
  clearStaffPitchPreview();
  if (songTitleInput.disabled || selectedScoreNoteIndex === null || !songNoteRows.children[selectedScoreNoteIndex] || event.target.closest?.("[data-note-index]")) return;
  const target = staffPointerTarget(event);
  if (!target) return;
  const ns = "http://www.w3.org/2000/svg";
  const group = document.createElementNS(ns, "g");
  group.setAttribute("class", "staff-pitch-preview");
  group.setAttribute("data-pitch", target.pitch);
  group.setAttribute("aria-hidden", "true");
  const draw = (tag, attrs) => {
    const element = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    group.append(element);
    return element;
  };
  const {x, y, row, pitch} = target;
  const bottom = scoreStaffBottomY + row * scoreStaffRowHeight;
  const step = pitchToStaffStep(pitch);
  for (let ledger = -2; ledger >= step; ledger -= 2) draw("line", {x1: x - 13, x2: x + 13, y1: bottom - ledger * 10, y2: bottom - ledger * 10});
  for (let ledger = 10; ledger <= step; ledger += 2) draw("line", {x1: x - 13, x2: x + 13, y1: bottom - ledger * 10, y2: bottom - ledger * 10});
  const source = getSongNoteValues()[selectedScoreNoteIndex];
  group.setAttribute("data-source-pitch", source.pitch);
  group.setAttribute("data-note-index-preview", selectedScoreNoteIndex);
  group.setAttribute("data-beats", source.beats);
  const icon = createNoteToolIcon(Number(source.beats), false);
  icon.setAttribute("x", x - 17);
  icon.setAttribute("y", y - 34);
  icon.setAttribute("width", 44);
  icon.setAttribute("height", 48);
  icon.setAttribute("class", "staff-preview-symbol");
  group.append(icon);
  const labelX = Math.max(72, Math.min(Number(scoreStaff.getAttribute("width")) - 280, x + 14));
  const labelY = Math.max(row * scoreStaffRowHeight + 8, y - 55);
  draw("rect", {x: labelX, y: labelY, width: 270, height: 29, rx: 7});
  const label = draw("text", {x: labelX + 9, y: labelY + 20});
  const names = {C: "\ub3c4", D: "\ub808", E: "\ubbf8", F: "\ud30c", G: "\uc194", A: "\ub77c", B: "\uc2dc"};
  const nameFor = (value) => value === "R" ? "\uc27c\ud45c" : `${names[value[0]]}${value.includes("#") ? "\u266f" : value.includes("b") ? "\u266d" : ""} (${value})`;
  label.textContent = `${selectedScoreNoteIndex + 1}\ubc88: ${nameFor(source.pitch)} \u2192 ${nameFor(pitch)}`;
  scoreStaff.append(group);
});
scoreStaff.addEventListener("click", (event) => {
  const noteGroup = event.target.closest?.("[data-note-index]");
  if (noteGroup) {
    const clickedIndex = Number(noteGroup.dataset.noteIndex);
    if (songTitleInput.disabled) return;
    selectedScoreNoteIndex = clickedIndex;
    if (selectedScoreNoteIndex !== null) {
      selectedScoreAccidental = /([#b])/.exec(getSongNoteValues()[selectedScoreNoteIndex]?.pitch ?? "")?.[1] ?? "";
      accidentalToolButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.accidental === selectedScoreAccidental));
    }
    songListEditor.hidden = false;
    songListEditorHeading.hidden = false;
    toggleNoteListButton.setAttribute("aria-expanded", "true");
    toggleNoteListButton.textContent = "\ubaa9\ub85d \ud3b8\uc9d1 \ub2eb\uae30";
    renderSongNoteRows(getSongNoteValues());
    const row = songNoteRows.children[clickedIndex];
    row?.scrollIntoView({block: "nearest", behavior: "smooth"});
    row?.querySelector(".song-note-pitch")?.focus({preventScroll: true});
    scoreEditorFeedback.textContent = selectedScoreNoteIndex === null
      ? "음표 메뉴를 클릭하면 곡 끝에 추가돼요."
      : `선택한 음: ${getSongNoteValues()[selectedScoreNoteIndex]?.pitch}. 음을 삭제하거나 길이를 바꿀 수 있어요.`;
    return;
  }
  if (songTitleInput.disabled) return;
  const target = staffPointerTarget(event);
  const pitch = target?.pitch;
  if (!pitch) {
    scoreEditorFeedback.textContent = "오선지 안쪽의 음높이를 골라 주세요. 현재 범위는 C3~B5예요.";
    return;
  }
  const notes = getSongNoteValues();
  if (selectedScoreNoteIndex !== null && notes[selectedScoreNoteIndex]) {
    notes[selectedScoreNoteIndex].pitch = pitch;
    renderSongNoteRows(notes);
    renderScoreStaff(notes);
    scoreEditorFeedback.textContent = `선택한 음을 ${applySelectedAccidental(pitch)}로 바꿨어요.`;
  } else {
    scoreEditorFeedback.textContent = "\uc74c\ud45c \uba54\ub274\ub97c \ud074\ub9ad\ud558\uba74 \uace1 \ub05d\uc5d0 \ucd94\uac00\ub3fc\uc694.";
  }
});
songClefInput.addEventListener("change", () => {
  stopSongPreview("음자리표가 바뀌어 미리 재생을 멈췄어요.");
  renderScoreStaff(getSongNoteValues());
});
songMeterInput.addEventListener("change", () => {
  stopSongPreview("박자표가 바뀌어 미리 재생을 멈췄어요.");
  renderScoreStaff(getSongNoteValues());
});
songBpmInput.addEventListener("input", () => {
  if (songPreviewRun) stopSongPreview("빠르기가 바뀌어 미리 재생을 멈췄어요.");
});
studentAuthorNameInput.addEventListener("change", () => {
  const value = studentAuthorNameInput.value.trim();
  if (value) localStorage.setItem("keycap-orchestra-author-name", value);
});
studentComposeOpenButton.addEventListener("click", openStudentComposer);
closeStudentComposerButton.addEventListener("click", closeStudentComposer);
studentComposerModal.addEventListener("click", (event) => {
  if (event.target === studentComposerModal) closeStudentComposer();
});
submitStudentSongButton.addEventListener("click", submitStudentSong);
removeScoreNoteButton.addEventListener("click", () => {
  if (selectedScoreNoteIndex === null) return;
  const notes = getSongNoteValues();
  notes.splice(selectedScoreNoteIndex, 1);
  if (notes.length === 0) notes.push({ pitch: "C4", beats: 1 });
  selectedScoreNoteIndex = null;
  renderSongNoteRows(notes);
  renderScoreStaff(notes);
  scoreEditorFeedback.textContent = "선택한 음을 삭제했어요.";
});
newScoreNoteButton.addEventListener("click", () => {
  chooseScoreDuration(selectedScoreDuration, selectedScoreRest);
});
accidentalToolButtons.forEach((button) => {
  button.addEventListener("click", () => chooseScoreAccidental(button.dataset.accidental));
});

function chooseScoreDuration(beats, rest = false) {
  if (!availableDurations().some(([value]) => value === beats) || songTitleInput.disabled) return;
  const notes = getSongNoteValues();
  const sourcePitch = notes[selectedScoreNoteIndex]?.pitch !== "R"
    ? notes[selectedScoreNoteIndex]?.pitch
    : null;
  const pitch = sourcePitch ?? notes.findLast((note) => note.pitch !== "R")?.pitch ?? "C4";
  selectedScoreRest = rest;
  selectedScoreDuration = beats;
  noteToolButtons.forEach((button) => button.classList.toggle("is-selected", Number(button.dataset.beats) === beats && (button.dataset.rest === "true") === rest));
  addScoreNote(rest ? "R" : applySelectedAccidental(pitch.replace(/[#b]/g, "")), beats);
}

function applySelectedAccidental(pitch) {
  return pitch ? `${pitch[0]}${selectedScoreAccidental}${pitch.slice(1)}` : pitch;
}

function chooseScoreAccidental(accidental) {
  selectedScoreAccidental = accidental;
  accidentalToolButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.accidental === accidental));
  const notes = getSongNoteValues();
  if (selectedScoreNoteIndex !== null && notes[selectedScoreNoteIndex] && notes[selectedScoreNoteIndex].pitch !== "R") {
    const pitch = notes[selectedScoreNoteIndex].pitch;
    notes[selectedScoreNoteIndex].pitch = `${pitch[0]}${accidental}${pitch.replace(/^[A-G][#b]?/, "")}`;
    renderSongNoteRows(notes);
    scoreEditorFeedback.textContent = `선택한 음에 ${accidental === "#" ? "샵" : accidental === "b" ? "플랫" : "제자리표"}을 적용했어요.`;
  } else {
    scoreEditorFeedback.textContent = `다음에 추가할 음에 ${accidental === "#" ? "샵" : accidental === "b" ? "플랫" : "제자리표"}을 적용해요.`;
  }
}

function addScoreNote(pitch, beats, insertIndex = null) {
  if (!pitch || !availableDurations().some(([value]) => value === beats)) return;
  const notes = getSongNoteValues();
  if (notes.length >= 64) {
    scoreEditorFeedback.textContent = "연습곡은 최대 64개 음까지 추가할 수 있어요.";
    return;
  }
  const position = insertIndex === null ? notes.length : Math.max(0, Math.min(insertIndex, notes.length));
  notes.splice(position, 0, { pitch, beats });
  selectedScoreNoteIndex = position;
  renderSongNoteRows(notes);
  renderScoreStaff(notes);
  scoreEditorFeedback.textContent = `${pitch} · ${beatLabel(beats)} 음을 ${position + 1}번째에 추가했어요.`;
}

function pitchToStaffStep(pitch, clef = songClefInput.value) {
  const match = /^([A-G])(?:[#b]?)([3-5])$/.exec(pitch);
  if (!match) return null;
  const letter = "CDEFGAB".indexOf(match[1]);
  const referenceOctave = clef === "bass" ? 2 : 4;
  const referenceLetter = clef === "bass" ? 4 : 2;
  return (Number(match[2]) - referenceOctave) * 7 + letter - referenceLetter;
}

function pitchFromStaffY(y, bottomY = scoreStaffBottomY, clef = scoreStaffClef) {
  const step = Math.round((bottomY - y) / 10);
  const referenceOctave = clef === "bass" ? 2 : 4;
  const referenceLetter = clef === "bass" ? 4 : 2;
  const absolute = step + referenceLetter;
  const octave = referenceOctave + Math.floor(absolute / 7);
  const letter = "CDEFGAB"[((absolute % 7) + 7) % 7];
  if (octave < 3 || octave > 5) return null;
  return `${letter}${octave}`;
}

// Split only the notation, preserving the original events for saving and playback.
function measureNotation(notes, meterValue) {
  const [numerator, denominator] = meterValue.split("/").map(Number);
  const capacity = numerator * 4 / denominator * 16;
  const durations = [64, 48, 32, 24, 16, 12, 8, 4, 2, 1];
  const fragments = [];
  let elapsed = 0;
  notes.forEach((note, sourceIndex) => {
    let remaining = Math.round(Number(note.beats) * 16);
    while (remaining > 0) {
      const room = capacity - elapsed % capacity;
      const ticks = durations.find((value) => value <= Math.min(room, remaining));
      fragments.push({pitch: note.pitch, beats: ticks / 16, sourceIndex, startTick: elapsed,
        measure: Math.floor(elapsed / capacity), ticks});
      elapsed += ticks;
      remaining -= ticks;
    }
  });
  return {fragments, capacity, totalTicks: elapsed};
}

function renderScoreStaff(notes = getSongNoteValues(), config = {}) {
  const practice = Boolean(config.svg);
  const staffSvg = config.svg ?? scoreStaff;
  const container = config.container ?? scoreStaffScroll;
  const clefValue = config.clef ?? songClefInput.value;
  const meterValue = config.meter ?? songMeterInput.value;
  const selectedIndex = practice ? null : selectedScoreNoteIndex;
  let staffClef, staffBottomY, staffRowHeight, staffViewHeight;
  const svgNS = "http://www.w3.org/2000/svg";
  const viewportWidth = Math.max(360, Math.floor(container.clientWidth || 680));
  const {fragments, capacity: measureTicks, totalTicks} = measureNotation(notes, meterValue);
  const groups = [];
  let measure = [];
  fragments.forEach((note, index) => {
    measure.push({index, width: Math.max(54, Number(note.beats) * 43)});
    if ((note.startTick + note.ticks) % measureTicks === 0) {
      groups.push(measure);
      measure = [];
    }
  });
  if (measure.length) groups.push(measure);
  // Never squeeze noteheads, accidentals and bar lines into overlapping slots.
  const widestGroup = Math.max(0, ...groups.map((group) => group.reduce((sum, item) => sum + item.width, 0)));
  const width = Math.max(viewportWidth, widestGroup + 140);
  const positions = [];
  let layoutX = 120;
  let rowIndex = 0;
  const availableWidth = width - 140;
  groups.forEach((group) => {
    const naturalWidth = group.reduce((sum, item) => sum + item.width, 0);
    const groupWidth = Math.min(naturalWidth, availableWidth);
    if (layoutX > 120 && layoutX + groupWidth > width - 20) {
      rowIndex += 1;
      layoutX = 120;
    }
    const scale = groupWidth / naturalWidth;
    group.forEach((item) => {
      const noteWidth = item.width * scale;
      positions[item.index] = {x: layoutX, row: rowIndex, width: noteWidth};
      layoutX += noteWidth;
    });
  });
  const rowCount = rowIndex + 1;
  staffClef = clefValue;
  // Fixed supported pitch range keeps every staff row steady while editing.
  const highestStep = Math.max(8, pitchToStaffStep("B5", clefValue));
  const lowestStep = Math.min(0, pitchToStaffStep("C3", clefValue));
  staffBottomY = Math.max(190, 100 + highestStep * 10);
  staffRowHeight = Math.max(staffBottomY + 85, staffBottomY - lowestStep * 10 + 75);
  staffViewHeight = staffRowHeight * rowCount;
  staffSvg.setAttribute("viewBox", `0 0 ${width} ${staffViewHeight}`);
  staffSvg.setAttribute("width", String(width));
  staffSvg.setAttribute("height", String(staffViewHeight));
  staffSvg.replaceChildren();
  const add = (tag, attrs, parent = staffSvg) => {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    parent.append(element);
    return element;
  };
  add("rect", { x: 0, y: 0, width, height: staffViewHeight, class: "score-paper" });
  const meter = meterValue.split("/");
  for (let row = 0; row < rowCount; row += 1) {
    const bottomY = staffBottomY + row * staffRowHeight;
    const topY = bottomY - 80;
  [0, 1, 2, 3, 4].forEach((line) => add("line", { x1: 70, y1: topY + line * 20, x2: width - 20, y2: topY + line * 20, class: "staff-line" }));
  const clef = add("text", { x: 10, y: bottomY - 12, class: "score-clef" });
  clef.textContent = staffClef === "bass" ? "𝄢" : "𝄞";
  const meterTop = add("text", { x: 54, y: topY + 26, class: "score-meter" });
  meterTop.textContent = meter[0];
  const meterBottom = add("text", { x: 54, y: topY + 48, class: "score-meter" });
  meterBottom.textContent = meter[1];
  }
  if (!practice) {
    const used = totalTicks % measureTicks;
    fillMeasureRestsButton.disabled = songTitleInput.disabled || used === 0;
    scoreEditorSummary.textContent = `${staffClef === "bass" ? "낮은음자리표" : "높은음자리표"} · ${meterValue}박자 · 한 마디 ${measureTicks / 16}박 · ${used ? `마지막 마디 ${used / 16}박 입력, ${(measureTicks - used) / 16}박 남음` : "마디 채움"} · 마디를 넘는 음은 붙임줄로 연결해요.`;
  }

  // Sixteenth-of-a-beat ticks also represent legacy 64th notes exactly.
  const ticksPerBeat = 16;
  const ticksPerMeasure = Number(meter[0]) * 4 / Number(meter[1]) * ticksPerBeat;
  let elapsedTicks = 0;
  let nextBarTick = ticksPerMeasure;
  fragments.forEach((note, index) => {
    const {x, row, width: noteWidth} = positions[index];
    const bottomY = staffBottomY + row * staffRowHeight;
    const topY = bottomY - 80;
    const rest = note.pitch === "R";
    const step = rest ? 4 : pitchToStaffStep(note.pitch, clefValue);
    if (step === null) return;
    const y = bottomY - step * 10;
    const group = add("g", { class: `score-note${selectedIndex === note.sourceIndex ? " is-selected" : ""}`, "data-note-index": note.sourceIndex, "data-staff-row": row, "data-measure": note.measure + 1, "data-start-tick": note.startTick, "data-beats": note.beats, tabindex: 0, role: "button", "aria-label": `${note.measure + 1}마디 · ${note.sourceIndex + 1}번째 음 ${note.pitch} ${beatLabel(Number(note.beats))}` });
    if (note.startTick % measureTicks === 0) {
      const label = add("text", {x: x - 8, y: topY - 22, class: "score-measure-number"});
      label.textContent = `${note.measure + 1}마디`;
    }
    for (let ledgerStep = -2; ledgerStep >= step; ledgerStep -= 2) {
      if (step < 0) add("line", { x1: x - 11, y1: bottomY - ledgerStep * 10, x2: x + 12, y2: bottomY - ledgerStep * 10, class: "ledger-line" }, group);
    }
    for (let ledgerStep = 10; ledgerStep <= step; ledgerStep += 2) {
      if (step > 8) add("line", { x1: x - 11, y1: bottomY - ledgerStep * 10, x2: x + 12, y2: bottomY - ledgerStep * 10, class: "ledger-line" }, group);
    }
    const accidental = /([#b])/.exec(note.pitch)?.[1];
    if (accidental) {
      const accidentalText = add("text", { x: x - 21, y: y + 5, class: "score-accidental" }, group);
      accidentalText.textContent = accidental === "#" ? "♯" : "♭";
    }
    const dotted = [3, 1.5, 0.75].includes(Number(note.beats));
    const baseBeats = dotted ? Number(note.beats) / 1.5 : Number(note.beats);
    if (rest) {
      const symbol = add("text", {x: x - 9, y: y + 9, class: "score-rest"}, group);
      symbol.textContent = ({4: "\uD834\uDD3B", 2: "\uD834\uDD3C", 1: "\uD834\uDD3D", 0.5: "\uD834\uDD3E", 0.25: "\uD834\uDD3F", 0.125: "\uD834\uDD40", 0.0625: "\uD834\uDD41", 8: "\uD834\uDD3A"})[baseBeats] ?? "R";
    } else {
    add("ellipse", { cx: x, cy: y, rx: 8, ry: 5.5, class: baseBeats >= 2 ? "notehead notehead-open" : "notehead" }, group);
    if (baseBeats < 4) {
      const stemDown = step >= 4;
      const stemX = x + (stemDown ? -7 : 7);
      const stemEndY = y + (stemDown ? 34 : -34);
      add("line", { x1: stemX, y1: y, x2: stemX, y2: stemEndY, class: "note-stem" }, group);
      for (let flag = 0; flag < Math.max(0, Math.log2(1 / baseBeats)); flag += 1) {
        const flagPath = stemDown
          ? `M ${stemX} ${stemEndY} q -17 -8 -8 -20`
          : `M ${stemX} ${stemEndY} q 17 8 8 20`;
        add("path", { d: flagPath, transform: `translate(0, ${flag * (stemDown ? -7 : 7)})`, class: "note-flag" }, group);
      }
    }
    }
    if (dotted) add("circle", {cx: x + 15, cy: y - 4, r: 2.5}, group);
    const next = fragments[index + 1];
    if (!rest && next?.sourceIndex === note.sourceIndex) {
      const end = positions[index + 1];
      const tieY = y + 17;
      const tie = (startX, endX, baseY) => add("path", {
        d: `M ${startX} ${baseY} Q ${(startX + endX) / 2} ${baseY + 17} ${endX} ${baseY}`,
        class: "note-tie", "data-note-index": note.sourceIndex,
      });
      if (end.row === row) tie(x + 7, end.x - 7, tieY);
      else {
        tie(x + 7, width - 22, tieY);
        tie(78, end.x - 7, tieY + staffRowHeight);
      }
    }
    const pitchLabel = add("text", { x, y: (row + 1) * staffRowHeight - 22, class: "score-pitch-label" }, group);
    pitchLabel.textContent = note.pitch.replace("#", "♯").replace("b", "♭");
    const durationTicks = Math.round(Number(note.beats) * ticksPerBeat);
    const endTick = elapsedTicks + durationTicks;
    // A long note can span more than one boundary. Do not skip those bars.
    while (nextBarTick <= endTick) {
      const fraction = (nextBarTick - elapsedTicks) / durationTicks;
      const barX = Math.max(x + 26, x + noteWidth * fraction - 17);
      add("line", {
        x1: barX, y1: topY, x2: barX, y2: bottomY,
        class: "bar-line",
        "data-beat": nextBarTick / ticksPerBeat,
        "data-measure": nextBarTick / ticksPerMeasure,
      });
      nextBarTick += ticksPerMeasure;
    }
    elapsedTicks = endTick;
  });
  if (!practice) {
    scoreStaffClef = staffClef;
    scoreStaffBottomY = staffBottomY;
    scoreStaffRowHeight = staffRowHeight;
    scoreStaffViewHeight = staffViewHeight;
    removeScoreNoteButton.disabled = selectedScoreNoteIndex === null;
  } else {
    staffSvg.querySelectorAll(".score-note").forEach((element) => {
      const index = Number(element.dataset.noteIndex);
      element.removeAttribute("tabindex");
      element.removeAttribute("role");
      element.classList.toggle("is-done", Boolean(practiceRun && index < practiceRun.index));
      element.classList.toggle("is-current", Boolean(practiceRun && !practiceRun.finished && index === practiceRun.index));
    });
  }
}

function makePitchOptions(selectedPitch) {
  const notes = [
    ["C", "C"], ["C♯", "C#"], ["D♭", "Db"], ["D", "D"],
    ["D♯", "D#"], ["E♭", "Eb"], ["E", "E"], ["F", "F"],
    ["F♯", "F#"], ["G♭", "Gb"], ["G", "G"], ["G♯", "G#"],
    ["A♭", "Ab"], ["A", "A"], ["A♯", "A#"], ["B♭", "Bb"], ["B", "B"],
  ];
  const fragment = document.createDocumentFragment();
  for (let octave = 3; octave <= 5; octave += 1) {
    notes.forEach(([label, note]) => {
      const pitch = `${note}${octave}`;
      fragment.append(new Option(`${label}${octave}`, pitch, false, pitch === selectedPitch));
    });
  }
  return fragment;
}

function renderFingeringRows(values = null) {
  fingeringRows.replaceChildren();
  const rows = values ?? DEFAULT_FINGERING_NAMES.map((solfege, index) => ({
    solfege,
    pitch_name: DEFAULT_PITCHES[index],
    buttons: DEFAULT_BUTTONS[index],
  }));
  rows.forEach((value) => {
    const solfege = value.solfege ?? "";
    const row = document.createElement("div");
    row.className = "fingering-row";

    const noteNameInput = document.createElement("input");
    noteNameInput.className = "note-name";
    noteNameInput.type = "text";
    noteNameInput.maxLength = 20;
    noteNameInput.placeholder = "예: 도♯, 시♭";
    noteNameInput.value = solfege;
    noteNameInput.setAttribute("aria-label", "계이름 이름");

    const pitchGroup = document.createElement("div");
    pitchGroup.className = "fingering-pitches";
    const addPitch = document.createElement("button");
    addPitch.type = "button";
    addPitch.className = "small-add-button add-chord-pitch";
    addPitch.textContent = "＋ 혼합음 추가";
    const renderPitches = (pitches) => {
      pitchGroup.replaceChildren();
      pitches.forEach((pitch, index) => {
        const line = document.createElement("div");
        line.className = "fingering-pitch-line";
        const select = document.createElement("select");
        select.className = "pitch-select";
        select.setAttribute("aria-label", `${solfege || "새 계이름"} ${index + 1}번째 음높이`);
        select.append(makePitchOptions(pitch));
        line.append(select);
        if (index > 0) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.textContent = "−";
          remove.setAttribute("aria-label", "혼합음 제거");
          remove.addEventListener("click", () => renderPitches([...pitchGroup.querySelectorAll("select")].map((item) => item.value).filter((_, i) => i !== index)));
          line.append(remove);
        }
        pitchGroup.append(line);
      });
      addPitch.disabled = pitches.length >= 4;
      pitchGroup.append(addPitch);
    };
    addPitch.addEventListener("click", () => {
      const pitches = [...pitchGroup.querySelectorAll("select")].map((item) => item.value);
      if (pitches.length >= 4) return;
      pitches.push(["E4", "G4", "B4", "C5"].find((pitch) => !pitches.includes(pitch)));
      renderPitches(pitches);
    });
    renderPitches(value.pitch_names ?? [value.pitch_name]);

    const buttonGroup = document.createElement("div");
    buttonGroup.className = "fingering-checks";
    [1, 2, 3, 4].forEach((buttonNumber) => {
      const label = document.createElement("label");
      label.className = "fingering-check";
      label.title = `버튼 ${buttonNumber}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.button = String(buttonNumber);
      checkbox.checked = (value.buttons ?? []).includes(buttonNumber);
      checkbox.setAttribute("aria-label", `버튼 ${buttonNumber} 사용`);
      const visibleNumber = document.createElement("span");
      visibleNumber.textContent = String(buttonNumber);
      label.append(checkbox, visibleNumber);
      buttonGroup.append(label);
    });

    const removeButton = document.createElement("button");
    removeButton.className = "remove-fingering-button";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", "계이름 행 삭제");
    removeButton.addEventListener("click", () => {
      row.remove();
      updateFingeringControls();
    });

    row.append(noteNameInput, pitchGroup, buttonGroup, removeButton);
    fingeringRows.append(row);
  });
  updateFingeringControls();
}

function updateFingeringControls() {
  const count = fingeringRows.querySelectorAll(".fingering-row").length;
  addFingeringRowButton.disabled = count >= 15;
  fingeringRows.querySelectorAll(".remove-fingering-button").forEach((button) => {
    button.disabled = count <= 1;
  });
}

function addFingeringRow() {
  if (fingeringRows.querySelectorAll(".fingering-row").length >= 15) return;
  const rows = [...fingeringRows.querySelectorAll(".fingering-row")].map((row) => ({
    solfege: row.querySelector(".note-name").value,
    pitch_name: row.querySelector(".pitch-select").value,
    pitch_names: [...row.querySelectorAll(".pitch-select")].map((select) => select.value),
    buttons: [...row.querySelectorAll(".fingering-check input:checked")]
      .map((checkbox) => Number(checkbox.dataset.button)),
  }));
  rows.push({ solfege: "", pitch_name: "C4", buttons: [] });
  renderFingeringRows(rows);
  fingeringRows.querySelector(".fingering-row:last-child .note-name").focus();
}

function resetInstrumentForm() {
  instrumentForm.reset();
  editingInstrumentId.value = "";
  soundfontSelect.value = "";
  presetSelect.replaceChildren(new Option("기본 전자음 사용", ""));
  presetSelect.disabled = true;
  instrumentFormTitle.textContent = "새 악기 등록";
  saveInstrumentButton.textContent = "악기 저장";
  formIconPreview.textContent = instrumentIcon.value || "🎵";
  formFeedback.textContent = "";
  formFeedback.dataset.state = "";
  renderFingeringRows();
}

function openTeacherSettings() {
  if (!isTeacherScreen) return;
  teacherSongFormHost.append(songForm);
  songEditorMode = "teacher";
  advancedToggle.closest("label").hidden = false;
  submitStudentSongButton.hidden = true;
  studentComposerModal.hidden = true;
  teacherModal.hidden = false;
  document.body.classList.add("modal-open");
  setTeacherView("instruments");
  resetInstrumentForm();
  loadInstruments();
  loadSoundfonts();
  loadSongs();
  loadTeacherSongs();
  instrumentName.focus();
}

function closeTeacherSettings() {
  if (isTeacherScreen) {
    return;
  }
  stopSongPreview(null);
  teacherModal.hidden = true;
  document.body.classList.remove("modal-open");
  settingsButton.focus();
}

function renderAdminInstrumentList() {
  instrumentAdminList.replaceChildren();
  if (loadedInstruments.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-instrument-list";
    empty.textContent = "아직 등록된 악기가 없어요. 위의 추가 버튼을 눌러 등록해요.";
    instrumentAdminList.append(empty);
    return;
  }

  loadedInstruments.forEach((instrument) => {
    const item = document.createElement("div");
    item.className = "admin-instrument-item";
    const info = document.createElement("div");
    info.className = "admin-instrument-info";
    const icon = document.createElement("span");
    icon.className = "admin-instrument-icon";
    icon.textContent = instrument.icon;
    const name = document.createElement("span");
    name.className = "admin-instrument-name";
    name.textContent = instrument.display_name;
    const family = document.createElement("small");
    family.textContent = instrument.family || "분류 없음";
    const text = document.createElement("span");
    text.className = "admin-instrument-text";
    text.append(name, family);
    info.append(icon, text);

    const actions = document.createElement("div");
    actions.className = "admin-item-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "icon-action";
    editButton.textContent = "수정";
    editButton.addEventListener("click", () => editInstrument(instrument.id));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "icon-action delete-action";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => removeInstrument(instrument.id, instrument.display_name));
    actions.append(editButton, deleteButton);
    item.append(info, actions);
    instrumentAdminList.append(item);
  });
}

function setTeacherView(viewName) {
  const showSongs = viewName === "songs";
  instrumentAdminView.hidden = showSongs;
  songAdminView.hidden = !showSongs;
  teacherTabInstruments.classList.toggle("is-active", !showSongs);
  teacherTabInstruments.setAttribute("aria-selected", String(!showSongs));
  teacherTabSongs.classList.toggle("is-active", showSongs);
  teacherTabSongs.setAttribute("aria-selected", String(showSongs));
  if (showSongs) loadTeacherSongs();
}

function getSongNoteValues() {
  return [...songNoteRows.querySelectorAll(".song-note-row")].map((row) => ({
    pitch: row.querySelector(".song-note-pitch").value,
    beats: Number(row.querySelector(".song-note-beats").value),
  }));
}

function renderSongNoteRows(values = [{ pitch: "C4", beats: 1 }]) {
  stopSongPreview("음표가 바뀌어 미리 재생을 멈췄어요.");
  songNoteRows.replaceChildren();
  values.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = `song-note-row${selectedScoreNoteIndex === index ? " is-selected" : ""}`;

    const order = document.createElement("span");
    order.className = "song-note-order";
    order.textContent = String(index + 1);

    const pitch = document.createElement("select");
    pitch.className = "song-note-pitch";
    pitch.setAttribute("aria-label", `${index + 1}번째 음높이`);
    pitch.add(new Option("쉼표", "R", false, value.pitch === "R"));
    pitch.append(makePitchOptions(value.pitch ?? "C4"));
    if (![...pitch.options].some((option) => option.value === value.pitch)) pitch.add(new Option(value.pitch, value.pitch));
    pitch.value = value.pitch ?? "C4";

    const duration = document.createElement("select");
    duration.className = "song-note-beats";
    duration.setAttribute("aria-label", `${index + 1}번째 음 길이`);
    const choices = [...availableDurations()];
    if (!choices.some(([beats]) => beats === Number(value.beats))) choices.push([Number(value.beats), `기존 길이 ${value.beats}박 (보존)`]);
    choices.forEach(([beats, label]) => duration.add(new Option(label, String(beats), false, Number(value.beats) === beats)));


    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-fingering-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${index + 1}번째 음 삭제`);
    remove.addEventListener("click", () => {
      const current = getSongNoteValues();
      current.splice(index, 1);
      renderSongNoteRows(current.length ? current : [{ pitch: "C4", beats: 1 }]);
    });
    remove.disabled = values.length <= 1;

    row.append(order, pitch, duration, remove);
    songNoteRows.append(row);
  });
  addSongNoteButton.disabled = values.length >= 64;
  renderScoreStaff(getSongNoteValues());
}

function addSongNoteRow() {
  const notes = getSongNoteValues();
  if (notes.length >= 64) return;
  notes.push({ pitch: notes.at(-1)?.pitch ?? "C4", beats: 1 });
  renderSongNoteRows(notes);
  songNoteRows.scrollTop = songNoteRows.scrollHeight;
}

function resetSongForm() {
  stopSongPreview(null);
  songForm.reset();
  advancedToggle.checked = advancedTools;
  advancedToggle.closest("label").hidden = songEditorMode !== "teacher";
  songForm.querySelectorAll("input, select, button").forEach((control) => { control.disabled = false; });
  saveSongButton.hidden = false;
  resetSongFormButton.hidden = false;
  submitStudentSongButton.hidden = songEditorMode !== "student";
  editingSongId.value = "";
  studentSongEditingId = "";
  selectedScoreNoteIndex = null;
  selectedScoreRest = false;
  selectedScoreDuration = 1;
  selectedScoreAccidental = "";
  noteToolButtons.forEach((button) => button.classList.toggle("is-selected", Number(button.dataset.beats) === 1 && button.dataset.rest === "false"));
  accidentalToolButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.accidental === ""));
  songListEditor.hidden = true;
  songListEditorHeading.hidden = true;
  toggleNoteListButton.textContent = "목록으로 편집";
  toggleNoteListButton.setAttribute("aria-expanded", "false");
  songBpmInput.value = "80";
  songFormTitle.textContent = songEditorMode === "student" ? "새 작품 만들기" : "새 연습곡 등록";
  saveSongButton.textContent = songEditorMode === "student" ? "임시 저장" : "곡 저장";
  songFormFeedback.textContent = "";
  songFormFeedback.dataset.state = "";
  renderSongNoteRows();
}

function collectSongPayload() {
  const title = songTitleInput.value.trim();
  const bpm = Number(songBpmInput.value);
  const notes = getSongNoteValues();
  if (!title || title.length > 60) throw new Error("곡 이름을 1~60자로 입력해 주세요.");
  if (!Number.isInteger(bpm) || bpm < 40 || bpm > 200) throw new Error("빠르기는 40~200 BPM으로 입력해 주세요.");
  if (notes.length < 1 || notes.length > 64) throw new Error("곡에는 1~64개의 음을 넣을 수 있어요.");
  return {
    title,
    bpm,
    description: songDescriptionInput.value.trim(),
    clef: songClefInput.value,
    time_signature: songMeterInput.value,
    notes,
  };
}

async function saveSong(event) {
  event.preventDefault();
  stopSongPreview("저장을 시작해 미리 재생을 멈췄어요.");
  songFormFeedback.dataset.state = "";
  saveSongButton.disabled = true;
  try {
    if (songEditorMode === "student") {
      const id = await persistStudentDraft();
      songFormFeedback.dataset.state = "success";
      songFormFeedback.textContent = `내 작품을 임시 저장했어요. 작품 번호 ${id}`;
      return;
    }
    const payload = collectSongPayload();
    const id = editingSongId.value;
    const response = await fetch(id ? `/api/teacher/songs/${id}` : "/api/teacher/songs", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "연습곡을 저장하지 못했습니다.");
    resetPractice();
    await loadSongs(String(result.id ?? id));
    await loadTeacherSongs();
    resetSongForm();
    songFormFeedback.dataset.state = "success";
    songFormFeedback.textContent = result.message;
  } catch (error) {
    songFormFeedback.dataset.state = "error";
    songFormFeedback.textContent = error.message;
  } finally {
    saveSongButton.disabled = false;
  }
}

async function persistStudentDraft() {
  const authorName = studentAuthorNameInput.value.trim();
  if (!authorName || authorName.length > 20) {
    studentAuthorNameInput.focus();
    throw new Error("작곡자 이름 또는 수업용 별명을 1~20자로 입력해 주세요.");
  }
  localStorage.setItem("keycap-orchestra-author-name", authorName);
  const payload = { ...collectSongPayload(), author_name: authorName };
  const id = studentSongEditingId;
  const response = await fetch(id ? `/api/student/songs/${id}` : "/api/student/songs", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", "X-Owner-Token": studentOwnerToken },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail ?? "내 작품을 저장하지 못했습니다.");
  if (result.id) studentSongEditingId = String(result.id);
  await loadStudentWorks();
  return studentSongEditingId;
}

async function submitStudentSong() {
  stopSongPreview("제출을 시작해 미리 재생을 멈췄어요.");
  submitStudentSongButton.disabled = true;
  saveSongButton.disabled = true;
  songFormFeedback.dataset.state = "";
  try {
    const id = await persistStudentDraft();
    const response = await fetch(`/api/student/songs/${id}/submit`, {
      method: "POST",
      headers: { "X-Owner-Token": studentOwnerToken },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "작품을 제출하지 못했습니다.");
    studentSongEditingId = "";
    resetSongForm();
    songFormFeedback.dataset.state = "success";
    songFormFeedback.textContent = result.message;
    await loadStudentWorks();
  } catch (error) {
    songFormFeedback.dataset.state = "error";
    songFormFeedback.textContent = error.message;
  } finally {
    submitStudentSongButton.disabled = false;
    saveSongButton.disabled = false;
  }
}

function editSong(songId) {
  const song = teacherSongs.find((item) => String(item.id) === String(songId));
  if (!song) return;
  resetSongForm();
  editingSongId.value = String(song.id);
  selectedScoreNoteIndex = null;
  selectedScoreRest = false;
  selectedScoreDuration = 1;
  selectedScoreAccidental = "";
  noteToolButtons.forEach((button) => button.classList.toggle("is-selected", Number(button.dataset.beats) === 1 && button.dataset.rest === "false"));
  accidentalToolButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.accidental === ""));
  songTitleInput.value = song.title;
  songBpmInput.value = String(song.bpm);
  songDescriptionInput.value = song.description ?? "";
  songClefInput.value = song.clef ?? "treble";
  songMeterInput.value = song.time_signature ?? "4/4";
  songFormTitle.textContent = "연습곡 수정";
  saveSongButton.textContent = "수정 내용 저장";
  songFormFeedback.textContent = "";
  setTeacherView("songs");
  renderSongNoteRows(song.notes);
  songTitleInput.focus();
}

async function deleteSong(songId, title) {
  if (!window.confirm(`“${title}” 연습곡을 삭제할까요?`)) return;
  try {
    const response = await fetch(`/api/teacher/songs/${songId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "연습곡을 삭제하지 못했습니다.");
    resetPractice();
    await loadSongs();
    await loadTeacherSongs();
    resetSongForm();
    songFormFeedback.dataset.state = "success";
    songFormFeedback.textContent = result.message;
  } catch (error) {
    songFormFeedback.dataset.state = "error";
    songFormFeedback.textContent = error.message;
  }
}

function renderAdminSongList() {
  songAdminList.replaceChildren();
  const visibleSongs = teacherSongs.filter((song) => songOriginFilter.value === "all" || song.composer_type === songOriginFilter.value);
  if (visibleSongs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-instrument-list";
    empty.textContent = "이 보관함에 등록된 작품이 없어요.";
    songAdminList.append(empty);
    return;
  }
  visibleSongs.forEach((song) => {
    const item = document.createElement("div");
    item.className = "song-admin-item";
    const title = document.createElement("strong");
    title.className = "song-admin-title";
    title.textContent = song.title;
    const meta = document.createElement("span");
    meta.className = "song-admin-meta";
    meta.textContent = `${song.composer_type === "student" ? `학생 작곡 · ${song.author_name}` : "교사 작곡"} · ${song.notes.length}개 음 · ${song.bpm} BPM · ${song.time_signature}`;
    const status = document.createElement("span");
    status.className = `student-work-status status-${song.status}`;
    status.textContent = song.status === "published" ? "공용 연습곡" : studentStatusLabel(song.status);
    const actions = document.createElement("div");
    actions.className = "admin-item-actions";
    if (song.status !== "published") {
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "icon-action";
      preview.textContent = "내용 보기";
      preview.addEventListener("click", () => previewStudentSubmission(song.id));
      const publish = document.createElement("button");
      publish.type = "button";
      publish.className = "icon-action publish-action";
      publish.textContent = "공개";
      publish.addEventListener("click", () => reviewStudentSong(song.id, "publish"));
      const requestChanges = document.createElement("button");
      requestChanges.type = "button";
      requestChanges.className = "icon-action";
      requestChanges.textContent = "수정 요청";
      requestChanges.addEventListener("click", () => reviewStudentSong(song.id, "request-changes"));
      actions.append(preview, publish, requestChanges);
    } else {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "icon-action";
    edit.textContent = "수정";
    edit.addEventListener("click", () => editSong(song.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-action delete-action";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => deleteSong(song.id, song.title));
    actions.append(edit, remove);
    }
    item.append(title, status, meta, actions);
    songAdminList.append(item);
  });
}

async function reviewStudentSong(songId, action) {
  let note = "";
  if (action === "request-changes") {
    note = window.prompt("학생에게 전달할 수정 의견을 적어 주세요.", "음표 길이를 다시 확인해 주세요.");
    if (note === null) return;
  }
  try {
    const response = await fetch(`/api/teacher/songs/${songId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "request-changes" ? JSON.stringify({ note }) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "작품을 처리하지 못했습니다.");
    songFormFeedback.dataset.state = "success";
    songFormFeedback.textContent = result.message;
    await Promise.all([loadTeacherSongs(), loadSongs()]);
  } catch (error) {
    songFormFeedback.dataset.state = "error";
    songFormFeedback.textContent = error.message;
  }
}

function editStudentWork(songId) {
  const song = studentWorks.find((item) => String(item.id) === String(songId));
  if (!song) return;
  studentAuthorNameInput.value = song.author_name;
  studentSongEditingId = String(song.id);
  songTitleInput.value = song.title;
  songBpmInput.value = String(song.bpm);
  songDescriptionInput.value = song.description ?? "";
  songClefInput.value = song.clef ?? "treble";
  songMeterInput.value = song.time_signature ?? "4/4";
  songFormTitle.textContent = song.status === "changes_requested" ? "수정 요청 작품 이어 만들기" : "내 작품 이어 만들기";
  saveSongButton.textContent = "임시 저장";
  songFormFeedback.dataset.state = song.review_note ? "error" : "";
  songFormFeedback.textContent = song.review_note ? `선생님 의견: ${song.review_note}` : "";
  renderSongNoteRows(song.notes);
  studentComposerHost.scrollIntoView({ behavior: "smooth", block: "start" });
  songTitleInput.focus();
}

function previewStudentSubmission(songId) {
  const song = teacherSongs.find((item) => String(item.id) === String(songId));
  if (!song) return;
  resetSongForm();
  songTitleInput.value = song.title;
  songBpmInput.value = String(song.bpm);
  songDescriptionInput.value = song.description ?? "";
  songClefInput.value = song.clef ?? "treble";
  songMeterInput.value = song.time_signature ?? "4/4";
  songFormTitle.textContent = `${song.author_name || "학생"}의 작품 미리보기`;
  saveSongButton.hidden = true;
  resetSongFormButton.hidden = true;
  renderSongNoteRows(song.notes);
  songForm.querySelectorAll("input, select, button").forEach((control) => { control.disabled = true; });
  songForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openStudentComposer() {
  if (isTeacherScreen) return;
  if (!isComposeScreen) {
    window.location.assign("/student/compose");
    return;
  }
  songEditorMode = "student";
  studentComposerHost.append(songForm);
  advancedToggle.closest("label").hidden = true;
  studentComposerModal.hidden = false;
  document.body.classList.remove("modal-open");
  submitStudentSongButton.hidden = false;
  studentAuthorNameInput.value = localStorage.getItem("keycap-orchestra-author-name") ?? "";
  resetSongForm();
  songFormTitle.textContent = "새 작품 만들기";
  saveSongButton.textContent = "임시 저장";
  loadStudentWorks();
  studentAuthorNameInput.focus();
}

function closeStudentComposer() {
  if (isComposeScreen) {
    window.location.assign("/student");
    return;
  }
  stopSongPreview(null);
  teacherSongFormHost.append(songForm);
  studentComposerModal.hidden = true;
  document.body.classList.remove("modal-open");
  songEditorMode = "teacher";
  submitStudentSongButton.hidden = true;
  resetSongForm();
  studentComposeOpenButton.focus();
}

async function editInstrument(instrumentId) {
  const instrument = loadedInstruments.find((item) => item.id === instrumentId);
  if (!instrument) return;
  editingInstrumentId.value = String(instrument.id);
  instrumentName.value = instrument.display_name;
  instrumentFamily.value = instrument.family;
  instrumentIcon.value = instrument.icon;
  soundfontSelect.value = instrument.soundfont_id ? String(instrument.soundfont_id) : "";
  await loadPresetsForForm(instrument.soundfont_id, instrument.preset);
  formIconPreview.textContent = instrument.icon;
  instrumentFormTitle.textContent = "악기 정보 수정";
  saveInstrumentButton.textContent = "수정 내용 저장";
  formFeedback.textContent = "";
  renderFingeringRows(instrument.fingerings.map((saved) => ({
    solfege: saved.solfege,
    pitch_name: saved.pitch_name,
    pitch_names: saved.pitch_names,
    buttons: [1, 2, 3, 4].filter((button) => (Number(saved.button_mask) & (1 << (button - 1))) !== 0),
  })));
  instrumentName.focus();
}

function collectInstrumentPayload() {
  const fingerings = [...fingeringRows.querySelectorAll(".fingering-row")].map((row) => {
    const buttons = [...row.querySelectorAll(".fingering-check input:checked")]
      .map((checkbox) => Number(checkbox.dataset.button));
    return {
      solfege: row.querySelector(".note-name").value.trim(),
      pitch_name: row.querySelector(".pitch-select").value,
      pitch_names: [...row.querySelectorAll(".pitch-select")].map((select) => select.value),
      buttons,
    };
  });
  if (fingerings.length === 0) throw new Error("계이름을 하나 이상 추가해 주세요.");
  if (fingerings.some((fingering) => !fingering.solfege)) {
    throw new Error("계이름 이름을 모두 입력해 주세요.");
  }
  if (fingerings.length > 15) throw new Error("네 버튼 운지법은 최대 15개까지 등록할 수 있어요.");
  const names = new Map();
  for (const fingering of fingerings) {
    const nameKey = fingering.solfege.toLocaleLowerCase();
    if (names.has(nameKey)) throw new Error(`계이름 이름이 중복되었습니다: ${names.get(nameKey)}와 ${fingering.solfege}`);
    names.set(nameKey, fingering.solfege);
    if (fingering.buttons.length === 0) throw new Error(`${fingering.solfege}의 버튼 조합을 선택해 주세요.`);
  }
  const maskNames = new Map();
  for (const fingering of fingerings) {
    const mask = fingering.buttons.reduce((value, button) => value | (1 << (button - 1)), 0);
    if (maskNames.has(mask)) {
      const buttonNames = fingering.buttons.join("+");
      throw new Error(`운지법 겹침: ${maskNames.get(mask)}와 ${fingering.solfege}가 버튼 ${buttonNames} 조합으로 겹쳐요.`);
    }
    maskNames.set(mask, fingering.solfege);
  }
  const soundfontId = soundfontSelect.value ? Number(soundfontSelect.value) : null;
  const presetOption = presetSelect.selectedOptions[0];
  const preset = soundfontId && presetOption?.dataset.preset
    ? JSON.parse(presetOption.dataset.preset)
    : null;
  if (soundfontId && !preset) throw new Error("음원 안의 악기 음색을 선택해 주세요.");
  return {
    display_name: instrumentName.value.trim(),
    family: instrumentFamily.value.trim(),
    icon: instrumentIcon.value,
    soundfont_id: soundfontId,
    preset,
    fingerings,
  };
}

async function saveInstrument(event) {
  event.preventDefault();
  formFeedback.dataset.state = "";
  try {
    const payload = collectInstrumentPayload();
    const id = editingInstrumentId.value;
    const response = await fetch(id ? `/api/teacher/instruments/${id}` : "/api/teacher/instruments", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "저장하지 못했습니다.");
    formFeedback.dataset.state = "success";
    formFeedback.textContent = result.message;
    await loadInstruments();
    instrumentSelect.value = String(result.id ?? id);
    applySelectedInstrument();
    if (!id) resetInstrumentForm();
  } catch (error) {
    formFeedback.dataset.state = "error";
    formFeedback.textContent = error.message;
  }
}

async function removeInstrument(instrumentId, displayName) {
  if (!window.confirm(`“${displayName}” 악기를 삭제할까요? 운지표도 함께 삭제됩니다.`)) return;
  try {
    const response = await fetch(`/api/teacher/instruments/${instrumentId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail ?? "삭제하지 못했습니다.");
    if (instrumentSelect.value === String(instrumentId)) instrumentSelect.value = "";
    await loadInstruments();
    resetInstrumentForm();
  } catch (error) {
    formFeedback.dataset.state = "error";
    formFeedback.textContent = error.message;
  }
}

settingsButton.addEventListener("click", openTeacherSettings);
audioEnableButton.addEventListener("click", () => {
  if (audioContext?.state === "running") disableAudio();
  else enableAudio();
});
closeSettingsButton.addEventListener("click", () => {
  if (isTeacherScreen) window.open("/student", "_blank", "noopener,noreferrer");
  else closeTeacherSettings();
});
newInstrumentButton.addEventListener("click", resetInstrumentForm);
resetFormButton.addEventListener("click", resetInstrumentForm);
instrumentForm.addEventListener("submit", saveInstrument);
addFingeringRowButton.addEventListener("click", addFingeringRow);
practiceStartButton.addEventListener("click", startPractice);
practiceResetButton.addEventListener("click", resetPractice);
instrumentIcon.addEventListener("change", () => { formIconPreview.textContent = instrumentIcon.value; });
teacherModal.addEventListener("click", (event) => {
  if (event.target === teacherModal) closeTeacherSettings();
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!studentComposerModal.hidden) closeStudentComposer();
  else if (!teacherModal.hidden) closeTeacherSettings();
});

renderFingeringRows();
resetSongForm();
if (!isTeacherScreen) connectSocket();
loadInstruments();
loadSongs();

if (isTeacherScreen) {
  const workspace = teacherModal.querySelector(".teacher-dialog");
  workspace.removeAttribute("role");
  workspace.removeAttribute("aria-modal");
  openTeacherSettings();
  document.body.classList.remove("modal-open");
}
if (isComposeScreen) {
  document.title = "키캡 오케스트라 · 오선지 작곡";
  const workspace = studentComposerModal.querySelector(".student-composer-dialog");
  workspace.removeAttribute("role");
  workspace.removeAttribute("aria-modal");
  const tabs = document.querySelector(".student-tabs");
  tabs.querySelector("#student-keys-tab").setAttribute("aria-pressed", "false");
  studentComposerModal.prepend(tabs);
  tabs.querySelector('[data-student-tab="compose"]').setAttribute("aria-current", "page");
  openStudentComposer();
}

function selectStudentActivity(activity) {
  if (isTeacherScreen) return;
  if (isComposeScreen) {
    window.location.assign(activity === "play" ? "/student#play" : "/student");
    return;
  }
  const playing = activity === "play";
  [...localHeldButtons].forEach(releaseButton);
  stopActiveNote();
  resetPractice();
  document.querySelector("#student-key-panel").hidden = playing;
  document.querySelector("#student-play-panel").hidden = !playing;
  document.querySelector(".workbench").hidden = playing;
  document.querySelector(".footer-note").hidden = playing;
  document.querySelector("#student-keys-tab").setAttribute("aria-pressed", String(!playing));
  document.querySelector("#student-play-tab").setAttribute("aria-pressed", String(playing));
  document.title = `키캡 오케스트라 · ${playing ? "곡 연주" : "키 누르기 연습"}`;
  history.replaceState(null, "", `${location.pathname}${location.search}${playing ? "#play" : ""}`);
}
document.querySelector("#student-keys-tab").addEventListener("click", () => selectStudentActivity("keys"));
document.querySelector("#student-play-tab").addEventListener("click", () => selectStudentActivity("play"));
if (!isTeacherScreen && !isComposeScreen) selectStudentActivity(location.hash === "#play" ? "play" : "keys");

refreshEditorSettings();

// Reflow when the editor is opened or its available width changes.
let lastStaffContainerWidth = 0;
new ResizeObserver(() => {
  const width = Math.floor(scoreStaffScroll.clientWidth);
  if (width > 0 && width !== lastStaffContainerWidth) {
    lastStaffContainerWidth = width;
    renderScoreStaff(getSongNoteValues());
  }
}).observe(scoreStaffScroll);

let lastPracticeStaffWidth = 0;
new ResizeObserver(() => {
  const width = Math.floor(practiceStaffScroll.clientWidth);
  if (width > 0 && width !== lastPracticeStaffWidth) {
    lastPracticeStaffWidth = width;
    updatePracticeDisplay();
  }
}).observe(practiceStaffScroll);
