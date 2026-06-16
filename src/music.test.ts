import { describe, expect, it } from "vitest";
import { findNote, getJianpuWithOctave, getLineSpaceName, getPracticeOptions, rotateNote, staffIndexFor } from "./music";

describe("music theory helpers", () => {
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
