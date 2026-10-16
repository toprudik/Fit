import { describe, expect, it } from "vitest";
import { changedSections, intakeValues, parseIntake, readIntake, stepOf, toValues } from "./form";

const allNo = { q1: "no", q2: "no", q3: "no", q4: "no", q5: "no", q6: "no", q7: "no" };
const base = { goals: ["strength"], goal_note: "", health: "", injuries: "", contraindications: "", medications: "", ...allNo };

describe("parseIntake", () => {
  it("keeps picked goals in the form's order and empty texts as null", () => {
    const parsed = parseIntake({ ...base, goals: ["health", "muscle"], injuries: "  колено  " });
    expect(parsed).toEqual({
      ok: true,
      answers: { goals: ["muscle", "health"], goal_note: null, health: null, injuries: "колено", contraindications: null, medications: null },
      parq: { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false },
    });
  });

  it("takes a written goal instead of a picked one", () => {
    expect(parseIntake({ ...base, goals: [], goal_note: "Пробежать полумарафон" }).ok).toBe(true);
  });

  it("asks for a goal and an answer to every PAR-Q question", () => {
    expect(parseIntake({ ...base, goals: [], q3: "" })).toEqual({ ok: false, fields: ["q3", "goals"] });
  });

  it("refuses unknown goals and overlong texts", () => {
    expect(parseIntake({ ...base, goals: ["fly"] })).toEqual({ ok: false, fields: ["goals"] });
    expect(parseIntake({ ...base, health: "a".repeat(2001) })).toEqual({ ok: false, fields: ["health"] });
  });

  it("reads yes as true", () => {
    const parsed = parseIntake({ ...base, q5: "yes" });
    expect(parsed.ok && parsed.parq.q5).toBe(true);
  });
});

describe("intakeValues", () => {
  it("reads every picked goal and fills missing fields with empty strings", () => {
    const form = new FormData();
    form.append("goals", "muscle");
    form.append("goals", "health");
    form.set("q1", "yes");
    const values = intakeValues(form);
    expect(values.goals).toEqual(["muscle", "health"]);
    expect(values.q1).toBe("yes");
    expect(values.medications).toBe("");
  });
});

describe("readIntake and toValues", () => {
  it("reads a stored version leniently and back into form values", () => {
    const intake = readIntake({ goals: ["muscle", "fly"], health: 5, injuries: " спина " }, { q1: true, q2: "yes", q9: true });
    expect(intake).toEqual({
      answers: { goals: ["muscle"], goal_note: null, health: null, injuries: "спина", contraindications: null, medications: null },
      parq: { q1: true },
    });
    expect(toValues(intake)).toMatchObject({ goals: ["muscle"], injuries: "спина", q1: "yes", q2: "" });
  });

  it("reads anything that is not an object as empty", () => {
    expect(readIntake(null, [true]).answers.goals).toEqual([]);
  });
});

describe("changedSections", () => {
  it("names the sections that differ", () => {
    const before = readIntake({ goals: ["muscle"], injuries: "колено" }, { q1: false, q2: false });
    const after = readIntake({ goals: ["muscle"], goal_note: "к лету", injuries: "колено" }, { q1: true, q2: false });
    expect([...changedSections(before, after)]).toEqual(["goals", "q1"]);
  });
});

describe("stepOf", () => {
  it("finds the step of a field", () => {
    expect(stepOf("goal_note")).toBe("goals");
    expect(stepOf("medications")).toBe("health");
    expect(stepOf("q7")).toBe("parq");
  });
});
