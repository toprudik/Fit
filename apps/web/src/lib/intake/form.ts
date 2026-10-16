import { z } from "zod";

/**
 * The intake form in code (PRD wave-1 §2.4 rule 2): goals, health, injuries, contraindications, medication and
 * the classic PAR-Q (7 yes/no questions, §6 question 9). Every saved version records which set of questions it
 * answered in intakes.form_version, so the questions can change later without misreading old answers.
 */
export const INTAKE_FORM_VERSION = "v1";

export const INTAKE_GOALS = ["weight_loss", "muscle", "strength", "endurance", "health", "mobility", "rehab"] as const;
export type IntakeGoal = (typeof INTAKE_GOALS)[number];

/** Free-text sections after the goals, in the order the form and the trainer's view show them. */
export const INTAKE_TEXT_FIELDS = ["health", "injuries", "contraindications", "medications"] as const;
export type IntakeTextField = (typeof INTAKE_TEXT_FIELDS)[number];

export const PARQ_QUESTIONS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const;
export type ParqQuestion = (typeof PARQ_QUESTIONS)[number];

export const INTAKE_TEXT_MAX = 2000;

export type IntakeAnswers = { goals: IntakeGoal[]; goal_note: string | null } & Record<IntakeTextField, string | null>;
export type ParqAnswers = Record<ParqQuestion, boolean>;

/** The steps of the form; "Отправить тренеру" is on the last one. */
export const INTAKE_STEPS = ["goals", "health", "parq"] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

/** Which step holds a field, so a rejected form opens where the first problem is. */
export function stepOf(field: string): IntakeStep {
  if (field === "goals" || field === "goal_note") return "goals";
  if ((PARQ_QUESTIONS as readonly string[]).includes(field)) return "parq";
  return "health";
}

const text = z
  .string()
  .trim()
  .max(INTAKE_TEXT_MAX)
  .transform((value) => value || null);

const parqAnswer = z.enum(["yes", "no"]).transform((value) => value === "yes");

const input = z
  .object({
    goals: z.array(z.enum(INTAKE_GOALS)).transform((goals) => INTAKE_GOALS.filter((goal) => goals.includes(goal))),
    goal_note: text,
    ...Object.fromEntries(INTAKE_TEXT_FIELDS.map((field) => [field, text])),
    ...Object.fromEntries(PARQ_QUESTIONS.map((question) => [question, parqAnswer])),
  });

/** What the form sent: a list of picked goals and one string for every other field. */
export type IntakeValues = { goals: string[] } & Record<string, string | string[]>;

/** Reads the posted form into the shape the parser checks. Missing fields are empty strings. */
export function intakeValues(formData: FormData): IntakeValues {
  const values: IntakeValues = { goals: formData.getAll("goals").map(String) };
  for (const field of ["goal_note", ...INTAKE_TEXT_FIELDS, ...PARQ_QUESTIONS]) values[field] = String(formData.get(field) ?? "");
  return values;
}

export type ParsedIntake =
  | { ok: true; answers: IntakeAnswers; parq: ParqAnswers }
  | { ok: false; fields: string[] };

/** Checks one submission: a goal, texts within the limit and an answer to every PAR-Q question. */
export function parseIntake(values: IntakeValues): ParsedIntake {
  const parsed = input.safeParse(values);
  const fields = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => String(issue.path[0] ?? "")));
  // A goal is either picked or written.
  const goals = Array.isArray(values.goals) ? values.goals : [];
  if (goals.length === 0 && !String(values.goal_note ?? "").trim()) fields.add("goals");
  if (!parsed.success || fields.size > 0) return { ok: false, fields: [...fields] };
  const data = parsed.data as Record<string, unknown>;
  const answers = {
    goals: parsed.data.goals,
    goal_note: parsed.data.goal_note,
    ...Object.fromEntries(INTAKE_TEXT_FIELDS.map((field) => [field, data[field] as string | null])),
  } as IntakeAnswers;
  const parq = Object.fromEntries(PARQ_QUESTIONS.map((question) => [question, data[question] as boolean])) as ParqAnswers;
  return { ok: true, answers, parq };
}

/** A stored version read back leniently: unknown keys are dropped, wrong types read as empty. */
export function readIntake(answers: unknown, parq: unknown): { answers: IntakeAnswers; parq: Partial<ParqAnswers> } {
  const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
  const a = record(answers);
  const p = record(parq);
  const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const goals = Array.isArray(a.goals) ? INTAKE_GOALS.filter((goal) => (a.goals as unknown[]).includes(goal)) : [];
  return {
    answers: {
      goals,
      goal_note: str(a.goal_note),
      ...(Object.fromEntries(INTAKE_TEXT_FIELDS.map((field) => [field, str(a[field])])) as Record<IntakeTextField, string | null>),
    },
    parq: Object.fromEntries(
      PARQ_QUESTIONS.filter((question) => typeof p[question] === "boolean").map((question) => [question, p[question] as boolean]),
    ),
  };
}

/** The answers as the form's initial values, for editing the latest version. */
export function toValues(intake: ReturnType<typeof readIntake>): IntakeValues {
  const values: IntakeValues = { goals: [...intake.answers.goals], goal_note: intake.answers.goal_note ?? "" };
  for (const field of INTAKE_TEXT_FIELDS) values[field] = intake.answers[field] ?? "";
  for (const question of PARQ_QUESTIONS) {
    const answer = intake.parq[question];
    values[question] = answer === undefined ? "" : answer ? "yes" : "no";
  }
  return values;
}

/**
 * Sections that differ between two versions (PRD wave-1 §2.4 rule 5): the trainer sees what changed since they
 * last opened the intake. Goals and their note count as one section.
 */
export function changedSections(
  before: ReturnType<typeof readIntake>,
  after: ReturnType<typeof readIntake>,
): Set<"goals" | IntakeTextField | ParqQuestion> {
  const changed = new Set<"goals" | IntakeTextField | ParqQuestion>();
  if (before.answers.goals.join() !== after.answers.goals.join() || before.answers.goal_note !== after.answers.goal_note) {
    changed.add("goals");
  }
  for (const field of INTAKE_TEXT_FIELDS) if (before.answers[field] !== after.answers[field]) changed.add(field);
  for (const question of PARQ_QUESTIONS) if (before.parq[question] !== after.parq[question]) changed.add(question);
  return changed;
}
