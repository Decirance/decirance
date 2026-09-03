// SPDX-License-Identifier: Apache-2.0
/**
 * UK AISI Inspect evaluation adapter.
 *
 * Converts an Inspect eval log into an evidence record and the graph edge that
 * attaches it to a claim. Decirance does not build an evaluation framework;
 * this reads the output of one.
 *
 * Three decisions in here matter more than the parsing:
 *
 * 1. A failing evaluation produces a `challenges` edge, not a missing
 *    `supports` edge. An eval demonstrating that an agent *can* be injected is
 *    evidence against the claim, not an absence of evidence for it. Modelling
 *    it as absence would let a bad result be silently replaced by a good one.
 *
 * 2. The model in the log must match the model in the Passport. Assurance rests
 *    on the evaluated system being the deployed system, so a log produced
 *    against a different model is rejected rather than downgraded.
 *
 * 3. Only the quality dimensions a log can actually evidence are derived.
 *    Coverage, repeatability and provenance are observable; construct validity
 *    and ecological validity are human judgements about whether the task
 *    measures the claim and whether the environment resembled production. The
 *    adapter requires those to be supplied and will not invent them, because a
 *    fabricated quality score is worse than an absent one.
 */

import type { GraphEdge } from './invalidation';
import type { MaterialChangeKind } from './material-change';

/**
 * Structural subset of Inspect's `EvalLog` (log format version 2). Extra
 * fields are ignored rather than rejected so that a newer Inspect release does
 * not break ingestion.
 */
export interface InspectEvalLog {
  version?: number;
  status: 'started' | 'success' | 'error' | (string & {});
  eval: {
    run_id?: string;
    eval_id?: string;
    created?: string;
    task: string;
    task_id?: string;
    task_version?: string | number;
    model: string;
    dataset?: { name?: string; location?: string; samples?: number };
    revision?: { type?: string; origin?: string; commit?: string };
    packages?: Record<string, string>;
    scorers?: unknown[];
  };
  results?: {
    total_samples?: number;
    completed_samples?: number;
    scores?: Array<{
      name: string;
      scorer: string;
      reducer?: string | null;
      scored_samples?: number;
      unscored_samples?: number;
      metrics?: Record<string, { name: string; value: number }>;
    }>;
    headline?: { name?: string; value?: number } | null;
  };
  error?: { message?: string } | null;
}

export interface InspectAdapterOptions {
  /** Claim this evaluation speaks to. */
  claimRef: string;
  evidenceRef: string;
  /** Passport and contract the run was executed against. */
  scopePassportHash: string;
  scopeContractHash: string;
  /** Model the Passport records. A mismatch rejects the log. */
  expectedModel: string;
  /** Metric value at or above which the claim is supported, 0-1. */
  passThreshold: number;
  /** Metric to read. Defaults to the log's headline metric. */
  metricName?: string;
  /**
   * Human judgements, 0-100. Required because no log can evidence them.
   * `constructValidity`: does this task actually measure the claim?
   * `ecologicalValidity`: did the environment resemble production?
   */
  constructValidity: number;
  ecologicalValidity: number;
  /** Material changes that sever the resulting edge. */
  severedBy: MaterialChangeKind[];
  owner: string;
}

export interface AdaptedEvidence {
  ref: string;
  title: string;
  detail: string;
  sourceKind: 'inspect_eval';
  sourceUri?: string;
  scopePassportHash: string;
  scopeContractHash: string;
  collectedAt?: string;
  owner: string;
  metricName: string;
  metricValue: number;
  passed: boolean;
  quality: {
    provenance: number;
    coverage: number;
    constructValidity: number;
    ecologicalValidity: number;
    repeatability: number;
  };
}

export type InspectAdapterResult =
  | { accepted: true; evidence: AdaptedEvidence; edge: GraphEdge; warnings: string[] }
  | { accepted: false; reason: string; warnings: string[] };

function pickMetric(
  log: InspectEvalLog,
  metricName?: string,
): { name: string; value: number } | null {
  const scores = log.results?.scores ?? [];
  if (metricName) {
    for (const score of scores) {
      const hit = Object.values(score.metrics ?? {}).find((m) => m.name === metricName);
      if (hit) return { name: hit.name, value: hit.value };
    }
    return null;
  }
  const headline = log.results?.headline;
  if (headline?.name && typeof headline.value === 'number') {
    return { name: headline.name, value: headline.value };
  }
  // Fall back to the first metric of the first score.
  for (const score of scores) {
    const first = Object.values(score.metrics ?? {})[0];
    if (first) return { name: first.name, value: first.value };
  }
  return null;
}

export function evidenceFromInspectLog(
  log: InspectEvalLog,
  options: InspectAdapterOptions,
): InspectAdapterResult {
  const warnings: string[] = [];

  if (log.status !== 'success') {
    return {
      accepted: false,
      reason: `Eval status is "${log.status}"${log.error?.message ? `: ${log.error.message}` : ''}. Only a completed run is evidence.`,
      warnings,
    };
  }

  if (log.eval.model !== options.expectedModel) {
    return {
      accepted: false,
      reason: `Log was produced against model "${log.eval.model}" but the Passport records "${options.expectedModel}". Evidence must be bound to the evaluated configuration.`,
      warnings,
    };
  }

  const metric = pickMetric(log, options.metricName);
  if (!metric) {
    return {
      accepted: false,
      reason: options.metricName
        ? `Metric "${options.metricName}" is not present in the log.`
        : 'The log carries no headline metric and no scores to fall back on.',
      warnings,
    };
  }

  const total = log.results?.total_samples ?? log.eval.dataset?.samples ?? 0;
  const completed = log.results?.completed_samples ?? total;
  if (total === 0) warnings.push('Sample count is unknown; coverage recorded as 0.');
  if (completed < total) {
    warnings.push(`${total - completed} of ${total} samples did not complete.`);
  }

  // Coverage is the share of the dataset actually scored.
  const coverage = total === 0 ? 0 : Math.round((completed / total) * 100);

  // Repeatability: a reducer means the task ran multiple epochs per sample and
  // the result is aggregated rather than a single draw, which is materially
  // more reproducible. Values are conservative because a log cannot show
  // variance across independent runs.
  const reducer = log.results?.scores?.find((s) => s.reducer)?.reducer;
  const repeatability = reducer ? 80 : 55;
  if (!reducer) {
    warnings.push('No epoch reducer recorded; result is a single draw per sample.');
  }

  // Provenance: a log pinned to a commit and package set can be traced back to
  // the code that produced it.
  const hasCommit = Boolean(log.eval.revision?.commit);
  const hasPackages = Object.keys(log.eval.packages ?? {}).length > 0;
  const provenance = hasCommit && hasPackages ? 95 : hasCommit || hasPackages ? 75 : 50;
  if (!hasCommit) warnings.push('No source revision recorded; the run cannot be traced to a commit.');

  const passed = metric.value >= options.passThreshold;
  if (!passed) {
    warnings.push(
      `Metric ${metric.name}=${metric.value} is below the ${options.passThreshold} threshold; recorded as evidence challenging ${options.claimRef}.`,
    );
  }

  const evidence: AdaptedEvidence = {
    ref: options.evidenceRef,
    title: log.eval.task,
    detail: `${completed}/${total} samples · ${metric.name} ${metric.value}${log.eval.dataset?.name ? ` · ${log.eval.dataset.name}` : ''}`,
    sourceKind: 'inspect_eval',
    sourceUri: log.eval.run_id ? `inspect://${log.eval.run_id}` : undefined,
    scopePassportHash: options.scopePassportHash,
    scopeContractHash: options.scopeContractHash,
    collectedAt: log.eval.created,
    owner: options.owner,
    metricName: metric.name,
    metricValue: metric.value,
    passed,
    quality: {
      provenance,
      coverage,
      constructValidity: options.constructValidity,
      ecologicalValidity: options.ecologicalValidity,
      repeatability,
    },
  };

  const edge: GraphEdge = {
    // A result below threshold contradicts the claim rather than failing to
    // support it. See the note at the top of this file.
    kind: passed ? 'supports' : 'challenges',
    sourceRef: options.evidenceRef,
    targetRef: options.claimRef,
    severedBy: options.severedBy,
  };

  return { accepted: true, evidence, edge, warnings };
}
