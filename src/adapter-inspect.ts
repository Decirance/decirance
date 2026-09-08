// SPDX-License-Identifier: Apache-2.0
/**
 * Adapter for Inspect evaluation logs.
 *
 * One adapter, not five. The contract in `evidence-ingest.ts` is the deliverable;
 * this exists to prove the contract survives contact with a real format and to
 * give a partner a worked example to copy. Adapters written speculatively
 * against tools nobody in the pilot runs are maintenance with no reader.
 *
 * Inspect is the right first one: it is open, it is the UK AI Safety
 * Institute's framework, and the reference case already cites `inspect_eval` as
 * a source kind — so this replaces a fixture value with a real reading of a
 * real file rather than adding a new claim.
 *
 * ## What this adapter will not do
 *
 * **It will not guess the scope.** An Inspect log records the model and the
 * task; it does not record the agent's tool permissions, guardrails or data
 * sources. The passport digest therefore comes from the caller, and a run
 * submitted without one is refused. Deriving a scope from the model name alone
 * would produce evidence that looks scoped and is not, which is worse than
 * evidence that is obviously unscoped.
 *
 * **It will not score construct validity.** Whether a task measures the thing a
 * claim asserts is an assessor's judgement about the *design* of the
 * evaluation. A pass rate cannot contain it, and a number derived from one
 * would be a judgement nobody made wearing the authority of a measurement.
 *
 * **It will not map tasks to claims.** The caller supplies `claimForTest`,
 * because "this eval bears on that claim" is the same class of judgement as the
 * severedBy dependencies — the one currently out for independent review. An
 * adapter inventing it would bury the most contestable step of the whole
 * pipeline inside a file format parser.
 *
 * What it *can* defend is provenance and repeatability, and only under stated
 * conditions. Both are recorded with the reason.
 */

import type {
  AdapterContext,
  EvidenceAdapter,
  EvidenceSubmission,
  IngestResult,
} from './evidence-ingest';
import { validateSubmission } from './evidence-ingest';

/** The subset of an Inspect log this adapter reads. */
interface InspectLog {
  eval?: {
    task?: string;
    task_version?: number | string;
    model?: string;
    created?: string;
    run_id?: string;
    task_id?: string;
    /** Present when the run pinned a seed; absent otherwise. */
    config?: { seed?: number | null; [k: string]: unknown };
    revision?: { type?: string; origin?: string; commit?: string };
  };
  results?: {
    total_samples?: number;
    completed_samples?: number;
    scores?: Array<{
      name?: string;
      scorer?: string;
      metrics?: Record<string, { name?: string; value?: number }>;
    }>;
  };
  status?: string;
}

/**
 * Provenance, judged from what the log can prove about itself.
 *
 * A run pinned to a commit and naming its model is traceable; one missing
 * either is not, and the difference is exactly what provenance means. Bands
 * rather than a formula, because a continuous score here would imply a
 * precision the inputs do not have.
 */
function provenanceScore(log: InspectLog): { value: number; because: string } {
  const hasCommit = Boolean(log.eval?.revision?.commit);
  const hasRunId = Boolean(log.eval?.run_id);
  const hasModel = Boolean(log.eval?.model);

  if (hasCommit && hasRunId && hasModel) {
    return { value: 95, because: 'Run id, task commit and model are all recorded, so the execution can be located and repeated.' };
  }
  if (hasRunId && hasModel) {
    return { value: 75, because: 'Run id and model recorded, but the task revision is not, so the exact task definition cannot be recovered.' };
  }
  return { value: 50, because: 'The log does not identify the run or the task revision; it cannot be traced to a specific execution.' };
}

/**
 * Repeatability, which an Inspect log can only sometimes support.
 *
 * A pinned seed makes a run reproducible; an unpinned one does not, and saying
 * so is more useful than a number that averages the two.
 */
function repeatabilityScore(log: InspectLog): { value: number; because: string } | null {
  const seed = log.eval?.config?.seed;
  if (typeof seed === 'number') {
    return { value: 90, because: `Run pinned to seed ${seed}, so the same inputs produce the same samples.` };
  }
  return null;
}

export const inspectAdapter: EvidenceAdapter = {
  id: 'inspect',
  describes: 'Inspect evaluation logs (UK AI Safety Institute), read from the JSON a completed run writes.',
  assessableDimensions: {
    provenance: 'Derived from whether the log identifies its run, task revision and model.',
    repeatability: 'Recorded only when the run pinned a seed. Absent otherwise rather than estimated.',
  },

  parse(raw: unknown, context: AdapterContext): IngestResult[] {
    if (typeof raw !== 'object' || raw === null) {
      return [{ ok: false, issues: [{ severity: 'reject', field: '(root)', message: 'An Inspect log must be a JSON object.' }] }];
    }
    const log = raw as InspectLog;

    if (!context.scopePassportHash) {
      return [{
        ok: false,
        issues: [{
          severity: 'reject',
          field: 'scopePassportHash',
          message:
            'The caller must supply the passport digest this run was executed against. An '
            + 'Inspect log records the model and task but not the agent\'s permissions, tools '
            + 'or data sources, so the adapter cannot determine the scope and will not guess it.',
        }],
      }];
    }

    if (log.status && log.status !== 'success') {
      return [{
        ok: false,
        issues: [{
          severity: 'reject',
          field: 'status',
          message:
            `The run finished with status "${log.status}". An incomplete evaluation is not a `
            + 'result, and admitting one would let a failed run read as an absence of findings.',
        }],
      }];
    }

    const task = log.eval?.task;
    if (!task) {
      return [{ ok: false, issues: [{ severity: 'reject', field: 'eval.task', message: 'The log names no task, so nothing identifies what was evaluated.' }] }];
    }

    const claimRef = context.claimForTest(task);
    if (!claimRef) {
      return [{
        ok: false,
        issues: [{
          severity: 'reject',
          field: 'claimsSupported',
          message:
            `No claim is mapped to task "${task}". Which claim an evaluation bears on is an `
            + 'assurance judgement, supplied by the caller — an adapter inventing it would '
            + 'bury the most contestable step of the pipeline inside a file parser.',
        }],
      }];
    }

    const prov = provenanceScore(log);
    const repeat = repeatabilityScore(log);

    const total = log.results?.total_samples;
    const completed = log.results?.completed_samples;
    const metric = log.results?.scores?.[0]?.metrics
      ? Object.values(log.results.scores[0].metrics)[0]
      : undefined;

    const limitations: string[] = [];
    if (!repeat) {
      limitations.push('The run did not pin a seed, so repeating it may not reproduce these samples.');
    }
    if (typeof total === 'number' && typeof completed === 'number' && completed < total) {
      limitations.push(`${completed} of ${total} samples completed; the result covers less than the task defines.`);
    }
    limitations.push(
      'Construct validity is not assessed by this adapter: whether the task measures what the '
      + 'claim asserts is a judgement about the evaluation\'s design, and a pass rate cannot contain it.',
    );

    const submission: EvidenceSubmission = {
      ref: `E-INSPECT-${(log.eval?.task_id ?? log.eval?.run_id ?? task).toString().slice(0, 12)}`,
      title: `Inspect: ${task}`,
      detail: metric
        ? `${metric.name ?? 'score'} ${metric.value ?? '(no value)'} over ${completed ?? total ?? '?'} samples, model ${log.eval?.model ?? 'unrecorded'}.`
        : `Completed run over ${completed ?? total ?? '?'} samples, model ${log.eval?.model ?? 'unrecorded'}.`,
      sourceKind: 'inspect_eval',
      route: 'adapter',
      scopePassportHash: context.scopePassportHash,
      collectedAt: log.eval?.created ?? new Date().toISOString(),
      owner: context.owner,
      claimsSupported: [claimRef],
      quality: {
        provenance: prov.value,
        ...(repeat ? { repeatability: repeat.value } : {}),
      },
      limitations,
      provenanceRefs: {
        adapter: 'inspect',
        provenanceRationale: prov.because,
        ...(repeat ? { repeatabilityRationale: repeat.because } : {}),
        ...(log.eval?.run_id ? { runId: log.eval.run_id } : {}),
        ...(log.eval?.task_id ? { taskId: log.eval.task_id } : {}),
        ...(log.eval?.model ? { model: log.eval.model } : {}),
        ...(log.eval?.revision?.commit ? { taskCommit: log.eval.revision.commit } : {}),
        ...(log.eval?.task_version !== undefined ? { taskVersion: String(log.eval.task_version) } : {}),
      },
    };

    return [validateSubmission(submission)];
  },
};
