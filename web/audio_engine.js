import { WorkletSynthesizer } from "./vendor/spessasynth_lib.js";

let audioContext = null;
let synthesizer = null;
let outputGain = null;

function gateOutput(value) {
  if (!outputGain) return;
  const now = audioContext.currentTime;
  outputGain.gain.cancelScheduledValues(now);
  outputGain.gain.setValueAtTime(outputGain.gain.value, now);
  outputGain.gain.linearRampToValueAtTime(value, now + 0.005);
}

async function getSynthesizer() {
  if (!audioContext) {
    audioContext = new AudioContext({ latencyHint: "interactive" });
    await audioContext.audioWorklet.addModule("/static/vendor/spessasynth_processor.min.js");
    synthesizer = new WorkletSynthesizer(audioContext);
    outputGain = audioContext.createGain();
    outputGain.gain.value = 0;
    synthesizer.connect(outputGain);
    outputGain.connect(audioContext.destination);
    await synthesizer.isReady;
  }
  if (audioContext.state === "suspended") await audioContext.resume();
  return synthesizer;
}

export async function enableSound() {
  await getSynthesizer();
}

export async function loadSoundfont(_soundfontId, fileBuffer) {
  const synth = await getSynthesizer();
  const bankId = "teacher-active-soundfont";
  await synth.soundBankManager.addSoundBank(fileBuffer, bankId);
  return (synth.presetList ?? synth.soundBankManager.presetList ?? [])
    .filter((preset) => !preset.isDrum)
    .map((preset) => ({
      name: preset.name,
      program: preset.program,
      bankMSB: preset.bankMSB ?? 0,
      bankLSB: preset.bankLSB ?? 0,
      isDrum: Boolean(preset.isDrum),
    }));
}

export async function selectSoundfontPreset(preset) {
  const synth = await getSynthesizer();
  synth.controllerChange(0, 0, Number(preset.bankMSB ?? 0));
  synth.controllerChange(0, 32, Number(preset.bankLSB ?? 0));
  synth.programChange(0, Number(preset.program));
}

export async function playMidiNote(midiNote, velocity = 96) {
  if (!synthesizer) await getSynthesizer();
  gateOutput(1);
  synthesizer.noteOn(0, midiNote, velocity);
}

export function releaseMidiNote(midiNote) {
  if (synthesizer && Number.isInteger(midiNote)) synthesizer.noteOff(0, midiNote);
}

export function silenceAllNotes() {
  gateOutput(0);
  if (synthesizer) synthesizer.stopAll(true);
}

export function suspendSound() {
  if (audioContext) audioContext.suspend();
}

export function soundIsReady() {
  return Boolean(synthesizer && audioContext?.state === "running");
}
