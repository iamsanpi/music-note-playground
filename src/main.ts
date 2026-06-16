import "./styles.css";
import {
  type LessonTab,
  type NoteInfo,
  type SoundMode,
  findNote,
  getJianpuWithOctave,
  getLineSpaceName,
  getPracticeOptions,
  notes,
  rotateNote,
} from "./music";

const tabLabels: Record<LessonTab, string> = {
  letters: "音名",
  staff: "五线谱",
  jianpu: "简谱",
  ear: "听辨",
};

const soundLabels: Record<SoundMode, string> = {
  piano: "钢琴音",
  solfege: "视唱音",
};

interface AppState {
  activeTab: LessonTab;
  soundMode: SoundMode;
  currentNote: NoteInfo;
  quizNote: NoteInfo;
  options: NoteInfo[];
  stars: number;
  streak: number;
  feedback: string;
}

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing app root");
}

const app: HTMLDivElement = root;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

let state: AppState = {
  activeTab: "letters",
  soundMode: "piano",
  currentNote: findNote("C4"),
  quizNote: findNote("G4"),
  options: getPracticeOptions("G4", 4),
  stars: Number(localStorage.getItem("music-note-stars") ?? "0"),
  streak: 0,
  feedback: "准备开始",
};

let audioContext: AudioContext | null = null;

async function ensureAudioContext(): Promise<AudioContext> {
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error("This browser does not support Web Audio.");
  }

  audioContext ??= new AudioContextConstructor();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  return audioContext;
}

async function playPianoTone(note: NoteInfo): Promise<void> {
  const context = await ensureAudioContext();
  const now = context.currentTime;
  const output = context.createGain();
  const filter = context.createBiquadFilter();
  const body = context.createBiquadFilter();
  const softClip = context.createDynamicsCompressor();

  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(0.82, now + 0.012);
  output.gain.exponentialRampToValueAtTime(0.24, now + 0.32);
  output.gain.exponentialRampToValueAtTime(0.0001, now + 1.26);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3800, now);
  filter.frequency.exponentialRampToValueAtTime(980, now + 1.0);
  filter.Q.setValueAtTime(1.2, now);

  body.type = "peaking";
  body.frequency.setValueAtTime(240, now);
  body.gain.setValueAtTime(3.5, now);
  body.Q.setValueAtTime(0.8, now);

  softClip.threshold.setValueAtTime(-11, now);
  softClip.knee.setValueAtTime(18, now);
  softClip.ratio.setValueAtTime(3, now);
  softClip.attack.setValueAtTime(0.006, now);
  softClip.release.setValueAtTime(0.15, now);

  filter.connect(body);
  body.connect(output);
  output.connect(softClip);
  softClip.connect(context.destination);

  const partials = [
    { ratio: 1, gain: 0.72, type: "triangle" as OscillatorType, detune: 0 },
    { ratio: 2, gain: 0.26, type: "sine" as OscillatorType, detune: -3 },
    { ratio: 3, gain: 0.13, type: "sine" as OscillatorType, detune: 4 },
    { ratio: 4, gain: 0.06, type: "sine" as OscillatorType, detune: 6 },
  ];

  partials.forEach((partial) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = partial.type;
    oscillator.frequency.setValueAtTime(note.frequency * partial.ratio, now);
    oscillator.detune.setValueAtTime(partial.detune, now);
    gain.gain.setValueAtTime(partial.gain, now);
    oscillator.connect(gain);
    gain.connect(filter);
    oscillator.start(now);
    oscillator.stop(now + 1.3);
  });
}

async function playSolfegeTone(note: NoteInfo): Promise<void> {
  const context = await ensureAudioContext();
  const now = context.currentTime;
  const output = context.createGain();
  const vibrato = context.createOscillator();
  const vibratoDepth = context.createGain();
  const sourceMix = context.createGain();
  const singer = singerProfileFor(note.solfege);

  output.gain.setValueAtTime(0.0001, now);
  output.gain.linearRampToValueAtTime(0.34, now + 0.08);
  output.gain.setValueAtTime(0.34, now + 0.78);
  output.gain.linearRampToValueAtTime(0.0001, now + 1.22);
  output.connect(context.destination);

  sourceMix.gain.setValueAtTime(0.22, now);

  vibrato.frequency.setValueAtTime(5.8, now);
  vibratoDepth.gain.setValueAtTime(0, now);
  vibratoDepth.gain.linearRampToValueAtTime(6, now + 0.34);
  vibrato.connect(vibratoDepth);

  const harmonics = [
    { ratio: 1, gain: 0.72, type: "sawtooth" as OscillatorType },
    { ratio: 2, gain: 0.2, type: "triangle" as OscillatorType },
    { ratio: 3, gain: 0.1, type: "sine" as OscillatorType },
  ];

  harmonics.forEach((harmonic) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = harmonic.type;
    oscillator.frequency.setValueAtTime(note.frequency * harmonic.ratio, now);
    oscillator.detune.setValueAtTime(singer.glideCents, now);
    oscillator.detune.linearRampToValueAtTime(0, now + 0.16);
    vibratoDepth.connect(oscillator.detune);
    gain.gain.setValueAtTime(harmonic.gain, now);
    oscillator.connect(gain);
    gain.connect(sourceMix);
    oscillator.start(now);
    oscillator.stop(now + 1.24);
  });

  singer.formants.forEach((formant) => {
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(formant.frequency, now);
    filter.Q.setValueAtTime(formant.q, now);
    gain.gain.setValueAtTime(formant.gain, now);
    sourceMix.connect(filter);
    filter.connect(gain);
    gain.connect(output);
  });

  if (singer.noiseGain > 0) {
    playConsonantNoise(context, output, now, singer.noiseGain, singer.noiseFrequency);
  }

  vibrato.start(now);
  vibrato.stop(now + 1.24);
}

function singerProfileFor(solfege: NoteInfo["solfege"]): {
  formants: Array<{ frequency: number; q: number; gain: number }>;
  glideCents: number;
  noiseFrequency: number;
  noiseGain: number;
} {
  const map: Record<NoteInfo["solfege"], {
    formants: Array<{ frequency: number; q: number; gain: number }>;
    glideCents: number;
    noiseFrequency: number;
    noiseGain: number;
  }> = {
    Do: {
      formants: [
        { frequency: 520, q: 7, gain: 0.72 },
        { frequency: 900, q: 9, gain: 0.42 },
        { frequency: 2380, q: 12, gain: 0.18 },
      ],
      glideCents: -18,
      noiseFrequency: 1700,
      noiseGain: 0.018,
    },
    Re: {
      formants: [
        { frequency: 470, q: 7, gain: 0.66 },
        { frequency: 1600, q: 10, gain: 0.34 },
        { frequency: 2550, q: 13, gain: 0.13 },
      ],
      glideCents: -15,
      noiseFrequency: 2100,
      noiseGain: 0.024,
    },
    Mi: {
      formants: [
        { frequency: 320, q: 7, gain: 0.62 },
        { frequency: 2180, q: 12, gain: 0.32 },
        { frequency: 3060, q: 15, gain: 0.14 },
      ],
      glideCents: -12,
      noiseFrequency: 2600,
      noiseGain: 0.012,
    },
    Fa: {
      formants: [
        { frequency: 610, q: 7, gain: 0.7 },
        { frequency: 1200, q: 10, gain: 0.33 },
        { frequency: 2580, q: 13, gain: 0.13 },
      ],
      glideCents: -20,
      noiseFrequency: 3200,
      noiseGain: 0.055,
    },
    Sol: {
      formants: [
        { frequency: 570, q: 7, gain: 0.7 },
        { frequency: 1040, q: 10, gain: 0.36 },
        { frequency: 2320, q: 12, gain: 0.15 },
      ],
      glideCents: -17,
      noiseFrequency: 2400,
      noiseGain: 0.038,
    },
    La: {
      formants: [
        { frequency: 730, q: 8, gain: 0.72 },
        { frequency: 1240, q: 10, gain: 0.36 },
        { frequency: 2540, q: 13, gain: 0.14 },
      ],
      glideCents: -14,
      noiseFrequency: 1700,
      noiseGain: 0.008,
    },
    Si: {
      formants: [
        { frequency: 310, q: 7, gain: 0.64 },
        { frequency: 2240, q: 12, gain: 0.34 },
        { frequency: 3080, q: 15, gain: 0.14 },
      ],
      glideCents: -10,
      noiseFrequency: 3800,
      noiseGain: 0.04,
    },
  };
  return map[solfege];
}

function playConsonantNoise(
  context: AudioContext,
  output: AudioNode,
  startTime: number,
  amount: number,
  frequency: number,
): void {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.09), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(frequency, startTime);
  filter.Q.setValueAtTime(0.85, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(amount, startTime + 0.012);
  gain.gain.linearRampToValueAtTime(0.0001, startTime + 0.09);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(startTime);
  source.stop(startTime + 0.1);
}

async function playNote(note: NoteInfo = state.currentNote): Promise<void> {
  if (state.soundMode === "piano") {
    await playPianoTone(note);
  } else {
    await playSolfegeTone(note);
  }
}

function requestNotePlayback(note: NoteInfo = state.currentNote): void {
  void playNote(note).catch(() => {
    state = { ...state, feedback: "请再点一次开启声音" };
    render();
  });
}

function selectNote(noteId: string, shouldPlay = true): void {
  state = { ...state, currentNote: findNote(noteId), feedback: `${noteId} / ${findNote(noteId).solfege} / 简谱 ${getJianpuWithOctave(findNote(noteId))}` };
  render();
  if (shouldPlay) {
    requestNotePlayback(state.currentNote);
  }
}

function nextQuiz(): void {
  const index = Math.floor(Math.random() * notes.length);
  const quizNote = notes[index] as NoteInfo;
  state = {
    ...state,
    quizNote,
    options: getPracticeOptions(quizNote.id, 4),
    feedback: "新的题目",
  };
  render();
}

function answerQuiz(noteId: string): void {
  const correct = noteId === state.quizNote.id;
  const stars = correct ? state.stars + 1 : Math.max(0, state.stars - 1);
  const streak = correct ? state.streak + 1 : 0;
  state = {
    ...state,
    currentNote: state.quizNote,
    stars,
    streak,
    feedback: correct ? "答对了" : `再听一次：${state.quizNote.id}`,
  };
  localStorage.setItem("music-note-stars", String(stars));
  render();
  requestNotePlayback(state.quizNote);
  if (correct) {
    window.setTimeout(nextQuiz, 680);
  }
}

function render(): void {
  app.innerHTML = `
    <main class="app-shell">
      <section class="top-band">
        <div class="brand-lockup">
          ${renderMascot()}
          <div>
            <p class="eyebrow">Music Note Playground</p>
            <h1>小小音符实验室</h1>
          </div>
        </div>
        <div class="toolbar" aria-label="声音设置">
          <div class="segmented" role="group" aria-label="声音模式">
            ${(["piano", "solfege"] as SoundMode[])
              .map(
                (mode) => `
                  <button class="segment ${state.soundMode === mode ? "is-active" : ""}" data-sound="${mode}" type="button">
                    ${soundLabels[mode]}
                  </button>
                `,
              )
              .join("")}
          </div>
          <button class="icon-button" data-action="replay" type="button" aria-label="重播当前音">
            <span aria-hidden="true">♪</span>
          </button>
        </div>
      </section>

      <section class="learning-grid">
        <article class="score-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Treble Staff</p>
              <h2>${state.currentNote.id}</h2>
            </div>
            <div class="note-badge" style="--note-color: ${state.currentNote.color}">
              <span>${state.currentNote.solfege}</span>
              <strong>${getJianpuWithOctave(state.currentNote)}</strong>
            </div>
          </div>
          ${renderStaff(state.currentNote)}
          <div class="note-triad" aria-label="当前音信息">
            <div>
              <span>音名</span>
              <strong>${state.currentNote.letter}</strong>
            </div>
            <div>
              <span>视唱</span>
              <strong>${state.currentNote.solfege}</strong>
            </div>
            <div>
              <span>简谱</span>
              <strong>${getJianpuWithOctave(state.currentNote)}</strong>
            </div>
          </div>
          <div class="direction-strip">
            <button data-step="-1" type="button">向左更低</button>
            <div class="alphabet-line">
              <span>C</span><span>D</span><span>E</span><span>F</span><span>G</span><span>A</span><span>B</span>
            </div>
            <button data-step="1" type="button">向右更高</button>
          </div>
        </article>

        <aside class="practice-panel">
          <div class="progress-row">
            <div>
              <span class="metric-label">星星</span>
              <strong>${state.stars}</strong>
            </div>
            <div>
              <span class="metric-label">连续</span>
              <strong>${state.streak}</strong>
            </div>
            <div>
              <span class="metric-label">状态</span>
              <strong>${state.feedback}</strong>
            </div>
          </div>
          <div class="tab-list" role="tablist" aria-label="学习内容">
            ${(["letters", "staff", "jianpu", "ear"] as LessonTab[])
              .map(
                (tab) => `
                  <button class="tab-button ${state.activeTab === tab ? "is-active" : ""}" data-tab="${tab}" type="button" role="tab">
                    ${tabLabels[tab]}
                  </button>
                `,
              )
              .join("")}
          </div>
          ${renderLesson()}
        </aside>
      </section>

      <section class="keyboard-panel" aria-label="钢琴键盘">
        <div class="keyboard-heading">
          <div>
            <p class="eyebrow">Keyboard</p>
            <h2>白键音名地图</h2>
          </div>
          <button class="primary-button" data-action="quiz-tone" type="button">播放题目音</button>
        </div>
        ${renderKeyboard()}
      </section>
    </main>
  `;

  bindEvents();
}

function renderMascot(): string {
  return `
    <svg class="mascot" viewBox="0 0 120 120" role="img" aria-label="音符伙伴">
      <rect x="18" y="22" width="70" height="78" rx="28" fill="#fff7d6" stroke="#20242a" stroke-width="4"/>
      <circle cx="45" cy="54" r="6" fill="#20242a"/>
      <circle cx="70" cy="54" r="6" fill="#20242a"/>
      <path d="M43 75c8 7 22 7 30 0" fill="none" stroke="#20242a" stroke-width="5" stroke-linecap="round"/>
      <path d="M82 28v48" stroke="#ef5b5b" stroke-width="8" stroke-linecap="round"/>
      <path d="M82 27c18 4 18 18 3 24" fill="none" stroke="#ef5b5b" stroke-width="8" stroke-linecap="round"/>
      <circle cx="82" cy="82" r="14" fill="#ef5b5b" stroke="#20242a" stroke-width="4"/>
      <path d="M19 37c-7 4-10 10-8 18" stroke="#2f80ed" stroke-width="7" stroke-linecap="round" fill="none"/>
      <path d="M26 29c-5-8-2-16 8-18" stroke="#3fbf7f" stroke-width="7" stroke-linecap="round" fill="none"/>
    </svg>
  `;
}

function renderStaff(note: NoteInfo): string {
  const width = 520;
  const height = 250;
  const left = 54;
  const right = 476;
  const bottomLineY = 166;
  const step = 13;
  const noteY = bottomLineY - note.staffIndex * step;
  const noteX = 280;
  const stemUp = note.staffIndex < 4;
  const stemX = stemUp ? noteX + 18 : noteX - 18;
  const stemEndY = stemUp ? noteY - 76 : noteY + 76;

  const lineYs = [0, 2, 4, 6, 8].map((index) => bottomLineY - index * step);
  const ledgerLines: number[] = [];
  for (let index = -2; index <= 12; index += 2) {
    if (index < 0 || index > 8) {
      if (Math.abs(index - note.staffIndex) <= 1) {
        ledgerLines.push(bottomLineY - index * step);
      }
    }
  }

  return `
    <svg class="staff-board" viewBox="0 0 ${width} ${height}" role="img" aria-label="${note.id} 在高音谱表上的位置">
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="#fffdf6"/>
      <path d="M94 49c-32 20-26 69 16 62c30-5 37-40 9-48c-23-7-43 11-33 35c8 20 39 19 48 4c13-22-11-55-41-42c-23 10-29 48-6 72c22 23 64 13 69-22"
        fill="none" stroke="#20242a" stroke-width="6" stroke-linecap="round"/>
      <path d="M105 40c21 64 9 114-22 163" fill="none" stroke="#20242a" stroke-width="5" stroke-linecap="round"/>
      ${lineYs.map((y) => `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="staff-line"/>`).join("")}
      ${ledgerLines.map((y) => `<line x1="${noteX - 46}" y1="${y}" x2="${noteX + 46}" y2="${y}" class="ledger-line"/>`).join("")}
      <ellipse cx="${noteX}" cy="${noteY}" rx="24" ry="16" transform="rotate(-18 ${noteX} ${noteY})" fill="${note.color}" stroke="#20242a" stroke-width="5"/>
      <line x1="${stemX}" y1="${noteY}" x2="${stemX}" y2="${stemEndY}" stroke="#20242a" stroke-width="5" stroke-linecap="round"/>
      <text x="${noteX}" y="222" text-anchor="middle" class="staff-caption">
        ${note.id} · ${getLineSpaceName(note.staffIndex) === "line" ? "线" : "间"} · ${note.frequency.toFixed(1)} Hz
      </text>
    </svg>
  `;
}

function renderLesson(): string {
  if (state.activeTab === "letters") {
    return `
      <div class="lesson-block">
        <div class="lesson-title">
          <p class="eyebrow">Music Alphabet</p>
          <h3>七个音名循环</h3>
        </div>
        <div class="note-card-grid">
          ${notes
            .slice(0, 7)
            .map(
              (note) => `
                <button class="note-card ${state.currentNote.letter === note.letter ? "is-active" : ""}" data-note="${note.id}" type="button" style="--note-color: ${note.color}">
                  <strong>${note.letter}</strong>
                  <span>${note.solfege}</span>
                  <em>${note.jianpu}</em>
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  if (state.activeTab === "staff") {
    return `
      <div class="lesson-block">
        <div class="lesson-title">
          <p class="eyebrow">Treble Clef</p>
          <h3>高音谱表</h3>
        </div>
        <div class="staff-facts">
          <div><span>线</span><strong>E G B D F</strong></div>
          <div><span>间</span><strong>F A C E</strong></div>
          <div><span>中央 C</span><strong>下加一线</strong></div>
        </div>
        ${renderQuizChoices("letter")}
      </div>
    `;
  }

  if (state.activeTab === "jianpu") {
    return `
      <div class="lesson-block">
        <div class="lesson-title">
          <p class="eyebrow">Numbered Notation</p>
          <h3>1=C 固定唱名</h3>
        </div>
        <div class="jianpu-row">
          ${notes
            .slice(0, 7)
            .map((note) => `<button data-note="${note.id}" type="button" style="--note-color: ${note.color}"><strong>${note.jianpu}</strong><span>${note.solfege}</span></button>`)
            .join("")}
        </div>
        ${renderQuizChoices("jianpu")}
      </div>
    `;
  }

  return `
    <div class="lesson-block">
      <div class="lesson-title">
        <p class="eyebrow">Ear Training</p>
        <h3>听音辨认</h3>
      </div>
      <button class="listen-button" data-action="quiz-tone" type="button">听</button>
      ${renderQuizChoices("mixed")}
    </div>
  `;
}

function renderQuizChoices(kind: "letter" | "jianpu" | "mixed"): string {
  return `
    <div class="quiz-box">
      ${renderMiniStaff(state.quizNote)}
      <div class="quiz-options">
        ${state.options
          .map((note) => {
            const label = kind === "jianpu" ? getJianpuWithOctave(note) : kind === "mixed" ? `${note.letter} · ${note.solfege}` : note.id;
            return `<button data-answer="${note.id}" type="button" style="--note-color: ${note.color}">${label}</button>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderMiniStaff(note: NoteInfo): string {
  const bottomLineY = 76;
  const step = 7;
  const y = bottomLineY - note.staffIndex * step;
  return `
    <svg class="mini-staff" viewBox="0 0 210 116" aria-label="练习题谱例">
      ${[0, 2, 4, 6, 8].map((index) => `<line x1="20" y1="${bottomLineY - index * step}" x2="190" y2="${bottomLineY - index * step}"/>`).join("")}
      ${note.staffIndex < 0 || note.staffIndex > 8 ? `<line x1="84" y1="${y}" x2="128" y2="${y}" class="ledger-line"/>` : ""}
      <ellipse cx="106" cy="${y}" rx="13" ry="9" transform="rotate(-18 106 ${y})" fill="${note.color}"/>
      <line x1="118" y1="${y}" x2="118" y2="${y - 44}" />
    </svg>
  `;
}

function renderKeyboard(): string {
  const whiteKeys = notes;
  const blackKeyPattern = [
    { after: 0, label: "C#" },
    { after: 1, label: "D#" },
    { after: 3, label: "F#" },
    { after: 4, label: "G#" },
    { after: 5, label: "A#" },
    { after: 7, label: "C#" },
    { after: 8, label: "D#" },
    { after: 10, label: "F#" },
    { after: 11, label: "G#" },
    { after: 12, label: "A#" },
  ];

  return `
    <div class="keyboard">
      <div class="keyboard-surface">
        <div class="white-keys">
          ${whiteKeys
            .map(
              (note) => `
                <button class="white-key ${state.currentNote.id === note.id ? "is-active" : ""}" data-note="${note.id}" type="button" style="--note-color: ${note.color}">
                  <span>${note.letter}</span>
                  <strong>${getJianpuWithOctave(note)}</strong>
                  <em>${note.solfege}</em>
                </button>
              `,
            )
            .join("")}
        </div>
        ${blackKeyPattern
          .map(
            (key) => `
              <span class="black-key" style="--key-left: ${((key.after + 1) / whiteKeys.length) * 100}%">
                ${key.label}
              </span>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function bindEvents(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-sound]").forEach((button) => {
    button.addEventListener("click", () => {
      state = { ...state, soundMode: button.dataset.sound as SoundMode };
      render();
      requestNotePlayback();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state = { ...state, activeTab: button.dataset.tab as LessonTab };
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-note]").forEach((button) => {
    button.addEventListener("click", () => {
      const noteId = button.dataset.note;
      if (noteId) {
        selectNote(noteId);
      }
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      const noteId = button.dataset.answer;
      if (noteId) {
        answerQuiz(noteId);
      }
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.step === "-1" ? -1 : 1;
      const next = rotateNote(state.currentNote.id, direction);
      selectNote(next.id);
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "replay") {
        requestNotePlayback();
      }
      if (button.dataset.action === "quiz-tone") {
        requestNotePlayback(state.quizNote);
      }
    });
  });
}

render();
