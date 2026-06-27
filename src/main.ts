import "./styles.css";
import {
  type NoteInfo,
  type PlayableNoteInfo,
  type ScaleDirection,
  findNote,
  findPlayableNote,
  getJianpuWithOctave,
  getScaleNotes,
  notes,
  playableNotes,
} from "./music";

interface AppState {
  currentNote: PlayableNoteInfo;
  direction: ScaleDirection;
  stepIndex: number;
  starshine: number;
  streak: number;
  feedback: string;
  isComplete: boolean;
}

interface BlackKey {
  label: string;
  noteId: string;
  afterWhiteIndex: number;
}

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing app root");
}

const app: HTMLDivElement = root;

const blackKeys: BlackKey[] = [
  { label: "C#", noteId: "C#4", afterWhiteIndex: 0 },
  { label: "D#", noteId: "D#4", afterWhiteIndex: 1 },
  { label: "F#", noteId: "F#4", afterWhiteIndex: 3 },
  { label: "G#", noteId: "G#4", afterWhiteIndex: 4 },
  { label: "A#", noteId: "A#4", afterWhiteIndex: 5 },
  { label: "C#", noteId: "C#5", afterWhiteIndex: 7 },
  { label: "D#", noteId: "D#5", afterWhiteIndex: 8 },
  { label: "F#", noteId: "F#5", afterWhiteIndex: 10 },
  { label: "G#", noteId: "G#5", afterWhiteIndex: 11 },
  { label: "A#", noteId: "A#5", afterWhiteIndex: 12 },
];

let state: AppState = {
  currentNote: findNote("C4"),
  direction: "up",
  stepIndex: 0,
  starshine: Number(localStorage.getItem("scale-starshine") ?? "0"),
  streak: 0,
  feedback: "按顺序点亮 C 大调星轨：C D E F G A B C。",
  isComplete: false,
};

const notePlayers = new Map<string, HTMLAudioElement>();
const scalePlayers = new Map<ScaleDirection, HTMLAudioElement>();

function getCurrentScale(): NoteInfo[] {
  return getScaleNotes(state.direction);
}

function getTargetNote(): NoteInfo {
  const scale = getCurrentScale();
  return scale[Math.min(state.stepIndex, scale.length - 1)] ?? scale[0] ?? findNote("C4");
}

function noteAudioPath(note: PlayableNoteInfo): string {
  return `./audio/piano/${note.id.replace("#", "s")}.wav`;
}

function scaleAudioPath(direction: ScaleDirection): string {
  return `./audio/scales/c-major-${direction}.wav`;
}

function getNotePlayer(note: PlayableNoteInfo): HTMLAudioElement {
  const existingPlayer = notePlayers.get(note.id);
  if (existingPlayer) {
    return existingPlayer;
  }

  const player = new Audio(noteAudioPath(note));
  player.preload = "auto";
  player.volume = 0.95;
  notePlayers.set(note.id, player);
  return player;
}

function getScalePlayer(direction: ScaleDirection): HTMLAudioElement {
  const existingPlayer = scalePlayers.get(direction);
  if (existingPlayer) {
    return existingPlayer;
  }

  const player = new Audio(scaleAudioPath(direction));
  player.preload = "auto";
  player.volume = 0.9;
  scalePlayers.set(direction, player);
  return player;
}

function preloadAudio(): void {
  playableNotes.forEach(getNotePlayer);
  getScalePlayer("up");
  getScalePlayer("down");
}

function playPlayer(player: HTMLAudioElement): Promise<void> {
  player.pause();
  player.currentTime = 0;
  return player.play();
}

function requestNotePlayback(note: PlayableNoteInfo): void {
  void playPlayer(getNotePlayer(note)).catch(handlePlaybackError);
}

function requestScalePlayback(): void {
  void playPlayer(getScalePlayer(state.direction)).catch(handlePlaybackError);
}

function handlePlaybackError(error: unknown): void {
  console.warn("Audio playback failed", error);
}

function switchDirection(direction: ScaleDirection): void {
  const firstNote = getScaleNotes(direction)[0] ?? findNote("C4");
  state = {
    ...state,
    currentNote: firstNote,
    direction,
    stepIndex: 0,
    streak: 0,
    feedback: direction === "up" ? "上行音阶：C D E F G A B C。" : "下行音阶：C B A G F E D C。",
    isComplete: false,
  };
  render();
}

function resetPractice(): void {
  const firstNote = getScaleNotes(state.direction)[0] ?? findNote("C4");
  state = {
    ...state,
    currentNote: firstNote,
    stepIndex: 0,
    streak: 0,
    feedback: "重新开始，按星轨顺序弹。",
    isComplete: false,
  };
  render();
}

function selectNote(noteId: string): void {
  const note = findPlayableNote(noteId);
  const scale = getCurrentScale();
  const target = getTargetNote();
  const isExpected = note.id === target.id;

  if (!isExpected) {
    const accidentalHint =
      "accidental" in note ? `你点到 ${note.id} 黑键。C 大调音阶先沿白键前进，当前需要 ${target.id}。` : `你点到 ${note.id}。当前星轨需要 ${target.id}。`;

    state = {
      ...state,
      currentNote: note,
      streak: 0,
      feedback: accidentalHint,
    };
    render();
    requestNotePlayback(note);
    return;
  }

  const nextStep = state.stepIndex + 1;
  const complete = nextStep >= scale.length;
  const gained = complete ? 30 : 3;
  const starshine = state.starshine + gained;

  state = {
    ...state,
    currentNote: note,
    stepIndex: nextStep,
    streak: state.streak + 1,
    starshine,
    feedback: complete ? "音阶星轨完成。C 大调已经点亮。" : `正确。下一颗星徽是 ${scale[nextStep]?.id ?? "C5"}。`,
    isComplete: complete,
  };

  localStorage.setItem("scale-starshine", String(starshine));
  render();
  requestNotePlayback(note);
}

function render(): void {
  const scale = getCurrentScale();
  const target = getTargetNote();
  const progress = Math.min(state.stepIndex, scale.length);
  const percent = Math.round((progress / scale.length) * 100);

  app.innerHTML = `
    <main class="voyage-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Piano Star Voyage</p>
          <h1>琴键星旅</h1>
        </div>
        <div class="hud">
          <span>第 1 章：C 大调音阶</span>
          <strong>星辉 ${state.starshine}</strong>
        </div>
      </header>

      <section class="mission-layout">
        <aside class="navigator-panel" aria-label="音符导航员">
          <div class="navigator-portrait" aria-hidden="true">
            <span class="halo"></span>
            <span class="companion">
              <span class="companion-note">♪</span>
            </span>
            <span class="wing wing-left"></span>
            <span class="wing wing-right"></span>
            <span class="spark spark-one"></span>
            <span class="spark spark-two"></span>
            <span class="baton"></span>
          </div>
          <div>
            <p class="eyebrow">Navigator</p>
            <h2>音阶巡航</h2>
            <p>听示范，再按星轨顺序弹。白键推进音阶，黑键可以试听辨音。</p>
          </div>
        </aside>

        <section class="mission-panel" aria-label="音阶任务">
          <div class="mission-header">
            <div>
              <p class="eyebrow">Today Mission</p>
              <h2>${state.isComplete ? "星轨完成" : `找到 ${target.id}`}</h2>
            </div>
            <div class="target-orb">${state.isComplete ? "✓" : target.letter}</div>
          </div>

          <div class="mode-switch" role="group" aria-label="音阶方向">
            <button class="${state.direction === "up" ? "is-active" : ""}" data-direction="up" type="button">上行</button>
            <button class="${state.direction === "down" ? "is-active" : ""}" data-direction="down" type="button">下行</button>
          </div>

          <div class="scale-track" aria-label="音阶进度">
            ${scale
              .map(
                (note, index) => `
                  <span class="scale-node ${index < state.stepIndex ? "is-done" : ""} ${index === state.stepIndex && !state.isComplete ? "is-current" : ""}">
                    <strong>${note.letter}</strong>
                    <em>${note.id}</em>
                  </span>
                `,
              )
              .join("")}
          </div>

          <div class="progress-line">
            <span style="width: ${percent}%"></span>
          </div>

          <p class="feedback">${state.feedback}</p>

          <div class="mission-actions">
            <button data-action="demo" type="button">听完整示范</button>
            <button data-action="target" type="button">听当前音</button>
            <button data-action="reset" type="button">重新开始</button>
          </div>
        </section>
      </section>

      <section class="keyboard-stage" aria-label="钢琴键盘">
        ${renderKeyboard()}
      </section>

      <section class="status-grid" aria-label="当前状态">
        <div>
          <span>当前目标</span>
          <strong>${state.isComplete ? "完成" : target.id}</strong>
        </div>
        <div>
          <span>连续正确</span>
          <strong>${state.streak}</strong>
        </div>
        <div>
          <span>进度</span>
          <strong>${progress}/${scale.length}</strong>
        </div>
        <div>
          <span>简谱</span>
          <strong>${state.isComplete ? "1-1" : getJianpuWithOctave(target)}</strong>
        </div>
      </section>
    </main>
  `;

  bindEvents();
}

function renderKeyboard(): string {
  const scale = getCurrentScale();
  const completedIds = new Set(scale.slice(0, state.stepIndex).map((note) => note.id));
  const target = state.isComplete ? null : getTargetNote();

  return `
    <div class="keyboard">
      <div class="white-keys">
        ${notes
          .map((note) => {
            const classes = [
              "white-key",
              state.currentNote.id === note.id ? "is-active" : "",
              completedIds.has(note.id) ? "is-complete" : "",
              target?.id === note.id ? "is-target" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return `
              <button
                class="${classes}"
                data-note="${note.id}"
                type="button"
                aria-label="${note.id} ${note.solfege}"
              >
                ${note.id === "C4" ? '<span class="middle-c">中央 C</span>' : ""}
                <strong>${note.letter}</strong>
                <em>${note.id}</em>
              </button>
            `;
          })
          .join("")}
      </div>
      ${blackKeys
        .map(
          (key) => `
            <button
              class="black-key ${state.currentNote.id === key.noteId ? "is-active" : ""}"
              data-note="${key.noteId}"
              type="button"
              style="--left: ${((key.afterWhiteIndex + 1) / notes.length) * 100}%"
              aria-label="${key.noteId} 黑键"
            >
              ${key.label}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function bindEvents(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-note]").forEach((button) => {
    button.addEventListener("click", () => {
      const noteId = button.dataset.note;
      if (noteId) {
        selectNote(noteId);
      }
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.direction;
      if (direction === "up" || direction === "down") {
        switchDirection(direction);
      }
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "demo") {
        requestScalePlayback();
      }
      if (button.dataset.action === "target") {
        requestNotePlayback(getTargetNote());
      }
      if (button.dataset.action === "reset") {
        resetPractice();
      }
    });
  });
}

render();
preloadAudio();
