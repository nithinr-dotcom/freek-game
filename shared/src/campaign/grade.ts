/** Stars and grades for a finished chapter (§2). */
export type Grade = "S" | "A" | "B" | "C";
export const GRADE_ORDER: Grade[] = ["C", "B", "A", "S"];

export interface GradeInput { stars: number; elapsedSec: number; parSeconds: number; damagePct: number; assist: boolean }

/** S (3★, under par, ≤10% damage), A (3★), B (2★), C (1★). Assist caps the grade at B. */
export function computeGrade(g: GradeInput): Grade {
  let grade: Grade = g.stars >= 3 ? (g.elapsedSec <= g.parSeconds && g.damagePct <= 0.1 ? "S" : "A") : g.stars === 2 ? "B" : "C";
  if (g.assist && GRADE_ORDER.indexOf(grade) > GRADE_ORDER.indexOf("B")) grade = "B";
  return grade;
}
export function betterGrade(a: Grade | undefined, b: Grade): Grade {
  if (!a) return b;
  return GRADE_ORDER.indexOf(b) > GRADE_ORDER.indexOf(a) ? b : a;
}
export const GRADE_COLOR: Record<Grade, string> = { S: "#ffd24a", A: "#7dff9a", B: "#3fa9ff", C: "#b0b8c0" };
