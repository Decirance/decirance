// SPDX-License-Identifier: Apache-2.0
/**
 * The worked example's timeline, and how to read it on a later day.
 *
 * The example was authored against one day — `EXAMPLE_AUTHORED_AS_OF` — and
 * every other date in it sits at a fixed interval from that day: when each
 * artefact was collected, when the permit was issued, when it expires, when it
 * comes up for review.
 *
 * Written as absolute dates and left alone, the whole case ages. A permit the
 * screen calls active expires. Evidence described as recent turns out to be
 * from last spring. For a product whose subject is whether a decision is still
 * current, a reader's first impression becomes a case nobody has touched in
 * months — and the demonstrator had exactly that defect once before, which is
 * why `fixture.ts` carries a note about a permit that had expired a year ago.
 *
 * So the intervals are authored once and the dates are derived. `exampleShift`
 * says how far the case has to move to be read on a given day, and
 * `shiftExampleDate` moves one date by that amount. Every interval is
 * preserved exactly, so the delta results, the posture series and the
 * days-to-expiry figure are the same numbers they always were; only the
 * calendar moves under them.
 *
 * Two dates deliberately do not move:
 *
 * - The passport's created-at date (`EXAMPLE_PASSPORT_CREATED_AT`) is inside
 *   the passport digest. That digest is published, and every evidence record
 *   names it as the configuration it was collected against, so moving it would
 *   scope the manifest to a passport that does not exist.
 * - The entitlement expiry in the passport is a date in the agent's commercial
 *   terms rather than a date in the assessment, and it is a material-change
 *   input in its own right (`entitlement_expiry`). Shifting it would change
 *   what the delta scenarios mean.
 *
 * The permit reference, DP-2026-014, also keeps its authored year, because it
 * is an identifier rather than a date: it is quoted in the published case, the
 * quick-start assertions and the pack. Read far enough into the future and a
 * permit numbered 2026 will have been issued in a later year, which is the
 * ordinary behaviour of a reference that was allocated once.
 *
 * Anything derived from a shifted date must be derived *after* the shift. In
 * particular, a digest over the evidence manifest has to be taken over the
 * manifest as displayed, or the page prints an integrity check for a document
 * nobody is looking at.
 */

const DAY_MS = 86_400_000;

/**
 * The day the worked example was authored against.
 *
 * The same instant as `EXAMPLE_PASSPORT_CREATED_AT`, deliberately: the case was
 * assembled around that passport.
 */
export const EXAMPLE_AUTHORED_AS_OF = '2026-09-03T00:00:00.000Z';

/**
 * The example permit's dates, as authored.
 *
 * Here rather than in the demonstrator or the example generator because both
 * need them and they were previously written out twice, which is how a permit
 * ends up with one expiry on a page and another in the published file.
 */
export const EXAMPLE_PERMIT_DATES = {
  issuedAt: '2026-06-18T11:05:00.000Z',
  validFrom: '2026-06-18T00:00:00.000Z',
  expiresAt: '2026-09-30T23:59:59.000Z',
  reviewAt: '2026-09-30T00:00:00.000Z',
} as const;

function startOfUtcDay(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
}

function parse(value: Date | string, field: string): Date {
  const at = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(at.getTime())) {
    throw new Error(`${field}: ${String(value)} is not a date.`);
  }
  return at;
}

/**
 * Whole days the example must move forward to be read on `asOf`.
 *
 * Whole UTC days, so a reader in any timezone sees the same case and a date
 * authored as a calendar day stays a calendar day. Never negative: a case
 * dated into the future is a different kind of wrong from one dated into the
 * past, so a clock behind the anchor leaves the example as authored.
 */
export function exampleShift(asOf: Date | string = new Date()): number {
  const read = parse(asOf, 'exampleShift');
  const anchor = parse(EXAMPLE_AUTHORED_AS_OF, 'EXAMPLE_AUTHORED_AS_OF');
  return Math.max(0, Math.round((startOfUtcDay(read) - startOfUtcDay(anchor)) / DAY_MS));
}

/** Move one authored date by a shift from `exampleShift`, keeping its time of day. */
export function shiftExampleDate(authored: Date | string, shiftDays: number): Date {
  if (!Number.isInteger(shiftDays) || shiftDays < 0) {
    throw new Error(`shiftExampleDate: ${String(shiftDays)} is not a whole number of days forward.`);
  }
  return new Date(parse(authored, 'shiftExampleDate').getTime() + shiftDays * DAY_MS);
}

/** As `shiftExampleDate`, returning the calendar day for a date-only field. */
export function shiftExampleDay(authored: Date | string, shiftDays: number): string {
  return shiftExampleDate(authored, shiftDays).toISOString().slice(0, 10);
}

/** The permit dates as read on `asOf`. */
export function examplePermitDates(asOf: Date | string = new Date()): {
  issuedAt: Date;
  validFrom: Date;
  expiresAt: Date;
  reviewAt: Date;
} {
  const shift = exampleShift(asOf);
  return {
    issuedAt: shiftExampleDate(EXAMPLE_PERMIT_DATES.issuedAt, shift),
    validFrom: shiftExampleDate(EXAMPLE_PERMIT_DATES.validFrom, shift),
    expiresAt: shiftExampleDate(EXAMPLE_PERMIT_DATES.expiresAt, shift),
    reviewAt: shiftExampleDate(EXAMPLE_PERMIT_DATES.reviewAt, shift),
  };
}
