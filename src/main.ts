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

function ensureAudioContext(): AudioContext {
  audioContext ??= new AudioContext();
  return audioContext;
}

function playPianoTone(note: NoteInfo): void {
  const context = ensureAudioContext();
  const now = context.currentTime;
  const output = context.createGain();
  const filter = context.createBiquadFilter();

  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(0.7, now + 0.015);
  output.gain.exponentialRampToValueAtTime(0.2, now + 0.32);
  output.gain.exponentialRampToValueAtTime(0.0001, now + 1.18);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3200, now);
  filter.frequency.exponentialRampToValueAtTime(900, now + 0.9);
  filter.Q.setValueAtTime(1.2, now);
  filter.connect(output);
  output.connect(context.destination);

  const partials = [
    { ratio: 1, gain: 0.68, type: "triangle" as OscillatorType, detune: 0 },
    { ratio: 2, gain: 0.2, type: "sine" as OscillatorType, detune: -3 },
    { ratio: 3, gain: 0.11, type: "sine" as OscillatorType, detune: 4 },
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
    oscillator.stop(now + 1.2);
  });
}

function playSolfegeTone(note: NoteInfo): void {
  const context = ensureAudioContext();
  const now = context.currentTime;
  const output = context.createGain();
  const oscillator = context.createOscillator();
  const vibrato = context.createOscillator();
  const vibratoDepth = context.createGain();

  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(0.48, now + 0.08);
  output.gain.setValueAtTime(0.42, now + 0.46);
  output.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
  output.connect(context.destination);

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(note.frequency, now);
  vibrato.frequency.setValueAtTime(5.2, now);
  vibratoDepth.gain.setValueAtTime(8, now);
  vibrato.connect(vibratoDepth);
  vibratoDepth.connect(oscillator.detune);

  const vowelFormants = formantsFor(note.solfege);
  vowelFormants.forEach((formant) => {
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(formant.frequency, now);
    filter.Q.setValueAtTime(formant.q, now);
    gain.gain.setValueAtTime(formant.gain, now);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(output);
  });

  oscillator.start(now);
  vibrato.start(now);
  oscillator.stop(now + 1.08);
  vibrato.stop(now + 1.08);

  speakSolfege(note);
}

function formantsFor(solfege: NoteInfo["solfege"]): Array<{ frequency: number; q: number; gain: number }> {
  const map: Record<NoteInfo["solfege"], Array<{ frequency: number; q: number; gain: number }>> = {
    Do: [
      { frequency: 520, q: 8, gain: 0.72 },
      { frequency: 920, q: 10, gain: 0.38 },
      { frequency: 2400, q: 12, gain: 0.16 },
    ],
    Re: [
      { frequency: 470, q: 8, gain: 0.66 },
      { frequency: 1650, q: 12, gain: 0.32 },
      { frequency: 2600, q: 14, gain: 0.12 },
    ],
    Mi: [
      { frequency: 310, q: 7, gain: 0.62 },
      { frequency: 2200, q: 14, gain: 0.3 },
      { frequency: 3000, q: 16, gain: 0.12 },
    ],
    Fa: [
      { frequency: 610, q: 8, gain: 0.68 },
      { frequency: 1180, q: 12, gain: 0.3 },
      { frequency: 2600, q: 14, gain: 0.12 },
    ],
    Sol: [
      { frequency: 570, q: 8, gain: 0.7 },
      { frequency: 1050, q: 11, gain: 0.34 },
      { frequency: 2350, q: 13, gain: 0.14 },
    ],
    La: [
      { frequency: 730, q: 9, gain: 0.68 },
      { frequency: 1250, q: 11, gain: 0.34 },
      { frequency: 2550, q: 14, gain: 0.13 },
    ],
    Si: [
      { frequency: 300, q: 7, gain: 0.64 },
      { frequency: 2250, q: 14, gain: 0.32 },
      { frequency: 3100, q: 16, gain: 0.12 },
    ],
  };
  return map[solfege];
}

function speakSolfege(note: NoteInfo): void {
  if (!("speechSynthesis" in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(note.solfege);
  utterance.lang = "en-US";
  utterance.pitch = 1.55;
  utterance.rate = 0.72;
  utterance.volume = 0.28;
  window.speechSynthesis.cancel();
  window.setTimeout(() => window.speechSynthesis.speak(utterance), 35);
}

function playNote(note: NoteInfo = state.currentNote): void {
  if (state.soundMode === "piano") {
    playPianoTone(note);
  } else {
    playSolfegeTone(note);
  }
}

function selectNote(noteId: string, shouldPlay = true): void {
  state = { ...state, currentNote: findNote(noteId), feedback: `${noteId} / ${findNote(noteId).solfege} / 简谱 ${getJianpuWithOctave(findNote(noteId))}` };
  render();
  if (shouldPlay) {
    playNote(state.currentNote);
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
  playNote(state.quizNote);
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
      playNote();
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
        playNote();
      }
      if (button.dataset.action === "quiz-tone") {
        playNote(state.quizNote);
      }
    });
  });
}

render();
