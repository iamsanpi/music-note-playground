export type NoteLetter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export type SoundMode = "piano" | "solfege";

export type LessonTab = "letters" | "staff" | "jianpu" | "ear";

export interface NoteInfo {
  id: string;
  letter: NoteLetter;
  solfege: "Do" | "Re" | "Mi" | "Fa" | "Sol" | "La" | "Si";
  jianpu: "1" | "2" | "3" | "4" | "5" | "6" | "7";
  octave: number;
  midi: number;
  frequency: number;
  staffIndex: number;
  color: string;
}

const baseNotes: Array<Omit<NoteInfo, "id" | "octave" | "midi" | "frequency" | "staffIndex">> = [
  { letter: "C", solfege: "Do", jianpu: "1", color: "#ef5b5b" },
  { letter: "D", solfege: "Re", jianpu: "2", color: "#f28c28" },
  { letter: "E", solfege: "Mi", jianpu: "3", color: "#f2c94c" },
  { letter: "F", solfege: "Fa", jianpu: "4", color: "#3fbf7f" },
  { letter: "G", solfege: "Sol", jianpu: "5", color: "#2f80ed" },
  { letter: "A", solfege: "La", jianpu: "6", color: "#8b5cf6" },
  { letter: "B", solfege: "Si", jianpu: "7", color: "#d946ef" },
];

const letterToSemitone: Record<NoteLetter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const staffLetterOrder: NoteLetter[] = ["C", "D", "E", "F", "G", "A", "B"];

function frequencyFromMidi(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function midiFor(letter: NoteLetter, octave: number): number {
  return 12 * (octave + 1) + letterToSemitone[letter];
}

export function staffIndexFor(letter: NoteLetter, octave: number): number {
  const c4Offset = (octave - 4) * 7 + staffLetterOrder.indexOf(letter);
  return c4Offset - 2;
}

function buildNote(letter: NoteLetter, octave: number): NoteInfo {
  const base = baseNotes.find((note) => note.letter === letter);
  if (!base) {
    throw new Error(`Unsupported note letter: ${letter}`);
  }
  const midi = midiFor(letter, octave);
  return {
    ...base,
    id: `${letter}${octave}`,
    octave,
    midi,
    frequency: Number(frequencyFromMidi(midi).toFixed(3)),
    staffIndex: staffIndexFor(letter, octave),
  };
}

export const notes: NoteInfo[] = [
  buildNote("C", 4),
  buildNote("D", 4),
  buildNote("E", 4),
  buildNote("F", 4),
  buildNote("G", 4),
  buildNote("A", 4),
  buildNote("B", 4),
  buildNote("C", 5),
  buildNote("D", 5),
  buildNote("E", 5),
  buildNote("F", 5),
  buildNote("G", 5),
  buildNote("A", 5),
  buildNote("B", 5),
  buildNote("C", 6),
];

export function findNote(id: string): NoteInfo {
  const note = notes.find((candidate) => candidate.id === id);
  if (!note) {
    throw new Error(`Unknown note id: ${id}`);
  }
  return note;
}

export function rotateNote(currentId: string, direction: -1 | 1): NoteInfo {
  const currentIndex = notes.findIndex((note) => note.id === currentId);
  if (currentIndex < 0) {
    return notes[0] as NoteInfo;
  }
  const nextIndex = (currentIndex + direction + notes.length) % notes.length;
  return notes[nextIndex] as NoteInfo;
}

export function getPracticeOptions(answerId: string, count = 4): NoteInfo[] {
  const answer = findNote(answerId);
  const sameRegister = notes.filter((note) => Math.abs(note.midi - answer.midi) <= 7 && note.id !== answer.id);
  const pool = sameRegister.length >= count - 1 ? sameRegister : notes.filter((note) => note.id !== answer.id);
  const chosen: NoteInfo[] = [answer];

  for (const candidate of pool) {
    if (chosen.length >= count) {
      break;
    }
    if (!chosen.some((note) => note.letter === candidate.letter && note.octave === candidate.octave)) {
      chosen.push(candidate);
    }
  }

  return chosen.sort((left, right) => left.midi - right.midi);
}

export function getJianpuWithOctave(note: NoteInfo): string {
  if (note.octave <= 4) {
    return note.jianpu;
  }
  if (note.octave === 5) {
    return `${note.jianpu}\u0307`;
  }
  return `${note.jianpu}\u0308`;
}

export function getLineSpaceName(staffIndex: number): "line" | "space" {
  return staffIndex % 2 === 0 ? "line" : "space";
}
