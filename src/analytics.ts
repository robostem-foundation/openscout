// Per-event OPR / DPR / CCWM, computed from qualification match scores.
//
// OPR (Offensive Power Rating) is the least-squares solution to "what does each
// team contribute to its alliance's score", solved via the normal equations
// AᵀA·x = Aᵀb where A is the match-by-team incidence matrix. DPR (Defensive
// Power Rating) is the same solve with each alliance's target set to the
// opposing alliance's score. CCWM = OPR − DPR.

import type { Match } from "./types";

export type TeamOpr = { opr: number; dpr: number; ccwm: number };

// Small ridge term keeps AᵀA invertible when a team's schedule is collinear
// (e.g. always paired with the same partner) or it played very few matches.
const RIDGE = 1e-6;

/**
 * Compute OPR/DPR/CCWM for every team appearing in scored qual matches.
 * For VEX IQ (cooperative teamwork, no opposing alliance) only `opr` is
 * meaningful; `dpr`/`ccwm` are still returned but should not be surfaced.
 */
export function computeEventOpr(matches: Match[]): Map<number, TeamOpr> {
  const result = new Map<number, TeamOpr>();

  // Collect scored qual matches where both alliances have a numeric score.
  const quals = matches.filter((m) => {
    if (m.round !== 2) return false;
    if (m.alliances.length < 2) return false;
    return m.alliances.every((a) => typeof a.score === "number");
  });
  if (!quals.length) return result;

  // Index every participating team → column.
  const index = new Map<number, number>();
  for (const m of quals) {
    for (const a of m.alliances) {
      for (const t of a.teams) {
        if (!index.has(t.team.id)) index.set(t.team.id, index.size);
      }
    }
  }
  const n = index.size;
  if (!n) return result;

  // Build AᵀA (co-appearance matrix) once — shared by OPR and DPR solves.
  // Build Aᵀb_off (own alliance scores) and Aᵀb_def (opponent scores).
  const ata: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const atbOff = new Array(n).fill(0);
  const atbDef = new Array(n).fill(0);

  for (const m of quals) {
    for (let ai = 0; ai < m.alliances.length; ai++) {
      const alliance = m.alliances[ai];
      const opponent = m.alliances[ai === 0 ? 1 : 0];
      const own = alliance.score as number;
      const opp = (opponent?.score as number) ?? 0;
      const cols = alliance.teams.map((t) => index.get(t.team.id)!);
      // AᵀA: every pair of teammates (incl. self) co-appears in this row.
      for (const r of cols) {
        atbOff[r] += own;
        atbDef[r] += opp;
        for (const c of cols) ata[r][c] += 1;
      }
    }
  }
  for (let i = 0; i < n; i++) ata[i][i] += RIDGE;

  const opr = solve(ata, atbOff);
  const dpr = solve(ata, atbDef);

  for (const [teamId, col] of index) {
    const o = opr[col];
    const d = dpr[col];
    result.set(teamId, { opr: o, dpr: d, ccwm: o - d });
  }
  return result;
}

/**
 * Solve A·x = b for a symmetric positive-definite A via Gaussian elimination
 * with partial pivoting. `a` is mutated; pass a fresh copy per call by cloning.
 */
function solve(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  // Clone so OPR and DPR solves don't corrupt the shared AᵀA.
  const a = aIn.map((row) => row.slice());
  const b = bIn.slice();

  for (let col = 0; col < n; col++) {
    // Partial pivot: find the row with the largest magnitude in this column.
    let pivot = col;
    let max = Math.abs(a[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r][col]);
      if (v > max) {
        max = v;
        pivot = r;
      }
    }
    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }
    const diag = a[col][col];
    if (Math.abs(diag) < 1e-12) continue; // singular column; leave as 0
    for (let r = col + 1; r < n; r++) {
      const factor = a[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) a[r][c] -= factor * a[col][c];
      b[r] -= factor * b[col];
    }
  }

  // Back-substitution.
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let c = row + 1; c < n; c++) sum -= a[row][c] * x[c];
    const diag = a[row][row];
    x[row] = Math.abs(diag) < 1e-12 ? 0 : sum / diag;
  }
  return x;
}
