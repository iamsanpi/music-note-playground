import { describe, expect, it } from "vitest";
import {
  findNote,
  findPlayableNote,
  getJianpuWithOctave,
  getLineSpaceName,
  getPracticeOptions,
  getScaleIds,
  notes,
  playableNotes,
  rotateNote,
  staffIndexFor,
} from "./music";

describe("music theory helpers", () => {
  it("keeps the piano white keys in C D E F G A B order", () => {
    expect(notes.map((note) => note.id)).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C5",
      "D5",
      "E5",
      "F5",
      "G5",
      "A5",
      "B5",
      "C6",
    ]);
  });

  it("includes clickable black keys without changing the white-key learning order", () => {
    expect(findPlayableNote("C#4").frequency).toBeCloseTo(277.183, 3);
    expect(playableNotes.some((note) => note.id === "A#5")).toBe(true);
    expect(notes.every((note) => !note.id.includes("#"))).toBe(true);
  });

  it("defines C major scale practice in both directions", () => {
    expect(getScaleIds("up")).toEqual(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]);
    expect(getScaleIds("down")).toEqual(["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"]);
  });

  it("maps treble staff notes from middle C upward", () => {
    expect(staffIndexFor("C", 4)).toBe(-2);
    expect(staffIndexFor("E", 4)).toBe(0);
    expect(staffIndexFor("F", 5)).toBe(8);
    expect(staffIndexFor("C", 6)).toBe(12);
  });

  it("keeps note rotation inside the supported keyboard range", () => {
    expect(rotateNote("C4", -1).id).toBe("C6");
    expect(rotateNote("C6", 1).id).toBe("C4");
  });

  it("formats higher-register jianpu with octave marks", () => {
    expect(getJianpuWithOctave(findNote("C4"))).toBe("1");
    expect(getJianpuWithOctave(findNote("C5"))).toBe("1\u0307");
    expect(getJianpuWithOctave(findNote("C6"))).toBe("1\u0308");
  });

  it("classifies staff positions as lines or spaces", () => {
    expect(getLineSpaceName(0)).toBe("line");
    expect(getLineSpaceName(1)).toBe("space");
  });

  it("builds practice choices with the answer included", () => {
    const options = getPracticeOptions("G4", 4);
    expect(options).toHaveLength(4);
    expect(options.some((note) => note.id === "G4")).toBe(true);
  });
});
