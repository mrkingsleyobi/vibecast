/**
 * Driftbase Query — Distance Functions
 * Implements cosine, L2, and inner product distance metrics for vector search.
 * ADR-002: Split from monolithic query module into DDD-compliant submodule.
 */
import { Vector, DistanceMetric } from '../common/types.js';

// ─── Helper Functions ────────────────────────────────────────

export function dot(a: Vector, b: Vector): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function norm(v: Vector): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

// ─── Distance Functions ──────────────────────────────────────

export function cosineDistance(a: Vector, b: Vector): number {
  const d = dot(a, b);
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 1;
  return 1 - d / (na * nb);
}

export function l2Distance(a: Vector, b: Vector): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function innerProductDistance(a: Vector, b: Vector): number {
  return -dot(a, b);
}

export function distanceFunction(
  metric: DistanceMetric,
): (a: Vector, b: Vector) => number {
  switch (metric) {
    case DistanceMetric.Cosine: return cosineDistance;
    case DistanceMetric.L2: return l2Distance;
    case DistanceMetric.InnerProduct: return innerProductDistance;
  }
}
