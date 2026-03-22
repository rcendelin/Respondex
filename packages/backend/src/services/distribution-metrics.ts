/**
 * Distribution comparison metrics for A/B testing and DLCE calibration.
 *
 * Provides: JSD, EMD, variance ratio, MAE, subgroup correlation.
 */

/**
 * Jensen-Shannon Divergence between two categorical distributions.
 * Symmetric, bounded [0, 1] (using log base 2).
 * Both arrays must sum to ~1.0 and have the same length.
 */
export function jensenShannonDivergence(p: number[], q: number[]): number {
  if (p.length !== q.length || p.length === 0) return 1.0
  const m = p.map((pi, i) => ((pi + (q[i] ?? 0)) / 2))
  return (klDivergence(p, m) + klDivergence(q, m)) / 2
}

function klDivergence(p: number[], q: number[]): number {
  let sum = 0
  for (let i = 0; i < p.length; i++) {
    const pi = p[i] ?? 0
    const qi = q[i] ?? 0
    if (pi > 0 && qi > 0) {
      sum += pi * Math.log2(pi / qi)
    }
  }
  return sum
}

/**
 * Earth Mover's Distance (Wasserstein-1) for ordinal distributions.
 * Better than JSD for ordered categories (Likert, NPS) because it
 * penalizes "close but wrong" less than "far wrong".
 * Both arrays must sum to ~1.0 and have the same length.
 */
export function earthMoversDistance(p: number[], q: number[]): number {
  if (p.length !== q.length || p.length === 0) return 0
  let emd = 0
  let cumDiff = 0
  for (let i = 0; i < p.length; i++) {
    cumDiff += (p[i] ?? 0) - (q[i] ?? 0)
    emd += Math.abs(cumDiff)
  }
  return emd
}

/**
 * Variance ratio: SD_simulated / SD_reference.
 * Target: 1.0. LLMs typically produce 0.3–0.6.
 */
export function varianceRatio(sdSimulated: number, sdReference: number): number {
  if (sdReference === 0) return sdSimulated === 0 ? 1.0 : Infinity
  return sdSimulated / sdReference
}

/**
 * Mean Absolute Error between two same-length arrays of proportions.
 */
export function meanAbsoluteError(simulated: number[], reference: number[]): number {
  if (simulated.length !== reference.length || simulated.length === 0) return 0
  let sum = 0
  for (let i = 0; i < simulated.length; i++) {
    sum += Math.abs((simulated[i] ?? 0) - (reference[i] ?? 0))
  }
  return sum / simulated.length
}

/**
 * Pearson correlation between two arrays.
 * Used for subgroup difference correlation: do simulated subgroup means
 * correlate with reference subgroup means?
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0
  const n = x.length
  const meanX = x.reduce((s, v) => s + v, 0) / n
  const meanY = y.reduce((s, v) => s + v, 0) / n

  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    const dx = (x[i] ?? 0) - meanX
    const dy = (y[i] ?? 0) - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }

  const den = Math.sqrt(denX * denY)
  return den === 0 ? 0 : num / den
}

/**
 * Compute composite fidelity score (0–100).
 * Formula: 100 × (1 - 0.5×JSD - 0.2×MAE - 0.2×|1 - VR| - 0.1×(1 - SGC))
 */
export function compositeFidelityScore(
  jsd: number,
  mae: number,
  varianceRatio: number,
  subgroupCorrelation: number
): number {
  const raw = 1 - 0.5 * jsd - 0.2 * mae - 0.2 * Math.abs(1 - varianceRatio) - 0.1 * (1 - subgroupCorrelation)
  return Math.max(0, Math.min(100, Math.round(raw * 1000) / 10))
}
