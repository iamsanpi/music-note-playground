import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sampleRate = 44100;
const audioDir = join(rootDir, "public", "audio");
const pianoDir = join(audioDir, "piano");
const scalesDir = join(audioDir, "scales");

const notes = [
  ["C4", 261.626],
  ["C#4", 277.183],
  ["D4", 293.665],
  ["D#4", 311.127],
  ["E4", 329.628],
  ["F4", 349.228],
  ["F#4", 369.994],
  ["G4", 391.995],
  ["G#4", 415.305],
  ["A4", 440],
  ["A#4", 466.164],
  ["B4", 493.883],
  ["C5", 523.251],
  ["C#5", 554.365],
  ["D5", 587.33],
  ["D#5", 622.254],
  ["E5", 659.255],
  ["F5", 698.456],
  ["F#5", 739.989],
  ["G5", 783.991],
  ["G#5", 830.609],
  ["A5", 880],
  ["A#5", 932.328],
  ["B5", 987.767],
  ["C6", 1046.502],
];

rmSync(audioDir, { force: true, recursive: true });
mkdirSync(pianoDir, { recursive: true });
mkdirSync(scalesDir, { recursive: true });

for (const [noteId, frequency] of notes) {
  const samples = renderPiano(frequency);
  writeFileSync(join(pianoDir, `${audioFileName(noteId)}.wav`), makeWav(normalize(samples)));
}

writeFileSync(join(scalesDir, "c-major-up.wav"), makeWav(normalize(renderScale(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]))));
writeFileSync(join(scalesDir, "c-major-down.wav"), makeWav(normalize(renderScale(["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"]))));

console.log(`Generated ${notes.length} piano WAV files and 2 scale WAV files in public/audio`);

function audioFileName(noteId) {
  return noteId.replace("#", "s");
}

function renderPiano(frequency) {
  const duration = 1.35;
  const length = Math.floor(sampleRate * duration);
  const samples = [];

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const strike = time < 0.018 ? (1 - time / 0.018) * 0.04 * seededNoise(time, frequency) : 0;
    const decay = Math.exp(-2.05 * time);
    const release = time > duration - 0.22 ? Math.max(0, (duration - time) / 0.22) : 1;
    const attack = Math.min(1, time / 0.008);
    const envelope = attack * decay * release;
    const tone =
      Math.sin(2 * Math.PI * frequency * time) * 0.78 +
      Math.sin(2 * Math.PI * frequency * 2 * time - 0.12) * 0.25 +
      Math.sin(2 * Math.PI * frequency * 3 * time + 0.08) * 0.11 +
      Math.sin(2 * Math.PI * frequency * 4 * time) * 0.045;

    samples.push((tone + strike) * envelope);
  }

  return samples;
}

function renderScale(noteIds) {
  const noteGap = 0.36;
  const tail = 0.7;
  const duration = noteGap * (noteIds.length - 1) + tail;
  const length = Math.floor(sampleRate * duration);
  const samples = Array.from({ length }, () => 0);

  noteIds.forEach((noteId, noteIndex) => {
    const frequency = notes.find(([id]) => id === noteId)?.[1];
    if (!frequency) {
      throw new Error(`Missing note for scale: ${noteId}`);
    }
    const startSample = Math.floor(noteIndex * noteGap * sampleRate);
    const noteSamples = renderShortPiano(frequency);
    noteSamples.forEach((sample, index) => {
      const targetIndex = startSample + index;
      if (targetIndex < samples.length) {
        samples[targetIndex] += sample * 0.82;
      }
    });
  });

  return samples;
}

function renderShortPiano(frequency) {
  const duration = 0.62;
  const length = Math.floor(sampleRate * duration);
  const samples = [];

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const strike = time < 0.014 ? (1 - time / 0.014) * 0.025 * seededNoise(time, frequency) : 0;
    const decay = Math.exp(-3.3 * time);
    const release = time > duration - 0.18 ? Math.max(0, (duration - time) / 0.18) : 1;
    const attack = Math.min(1, time / 0.006);
    const envelope = attack * decay * release;
    const tone =
      Math.sin(2 * Math.PI * frequency * time) * 0.78 +
      Math.sin(2 * Math.PI * frequency * 2 * time - 0.12) * 0.2 +
      Math.sin(2 * Math.PI * frequency * 3 * time + 0.08) * 0.08;

    samples.push((tone + strike) * envelope);
  }

  return samples;
}

function seededNoise(time, salt) {
  const x = Math.sin(time * 12731.371 + salt * 11.17) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function normalize(samples, peak = 0.88) {
  let max = 0;
  for (const sample of samples) {
    max = Math.max(max, Math.abs(sample));
  }
  const scale = max > 0 ? peak / max : 1;
  return samples.map((sample) => Math.max(-0.98, Math.min(0.98, sample * scale)));
}

function makeWav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  samples.forEach((sample, index) => {
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  });

  return buffer;
}
