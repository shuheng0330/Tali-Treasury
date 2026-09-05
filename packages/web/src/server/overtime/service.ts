import type { Address, LeaveRequest, OvertimeClaim } from '@tali/shared';
import {
  checkOvertimeClaim,
  fromCentihours,
  overtimePay,
  toCentihours,
  unpaidLeaveDeduction,
} from '@tali/shared';
import { z } from 'zod';

import { suiAddressSchema } from '../claims/validation';
import { ServerError } from '../errors';
import type { OvertimeRepository, WageOfRecordPort } from './ports';

/** One employee's year of claims, which is more than any screen shows. */
const LIST_LIMIT = 400;

const DAY_MS = 86_400_000;

/**
 * Kuala Lumpur is UTC+8 all year, with no daylight saving.
 *
 * The day matters here: overtime worked on the 5th and claimed at half past
 * midnight on the 6th is still in the past, and a server reading UTC would
 * call it a future date and refuse it.
 */
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

const MAX_LEAVE_SPAN_DAYS = 366;

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

const isoDate = z.string().refine(isValidIsoDate, 'expected a date as YYYY-MM-DD');

const freeText = (maximum: number, message: string) =>
  z.string().max(maximum).refine((value) => value.trim().length > 0, message);

const submitOvertimeSchema = z.object({
  workedOn: isoDate,
  kind: z.enum(['normal_day', 'rest_day', 'public_holiday']),
  hours: z
    .string()
    .regex(/^\d{1,2}(?:\.\d{1,2})?$/, 'hours must be a number to at most two decimals'),
  reason: freeText(500, 'say what the overtime was for'),
});

const submitLeaveSchema = z.object({
  startOn: isoDate,
  endOn: isoDate,
  days: z
    .string()
    .regex(/^\d{1,3}(?:\.\d{1,2})?$/, 'days must be a number to at most two decimals'),
  kind: z.enum(['annual', 'sick', 'unpaid']),
  reason: freeText(500, 'say what the leave is for'),
});

const reviewSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.action === 'reject' && !value.reason?.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A rejection has to say why.',
      });
    }
  });

const settleSchema = z.object({
  employee: suiAddressSchema,
  runId: z.string().min(1).max(128),
});

export interface OvertimeService {
  listClaims(actor: string): Promise<OvertimeClaim[]>;
  submitClaim(actor: string, input: unknown): Promise<OvertimeClaim>;
  reviewClaim(actor: string, claimId: string, input: unknown): Promise<OvertimeClaim>;
  /** Called by payroll once a run has paid what the approved claims added. */
  settleClaims(actor: string, input: unknown): Promise<OvertimeClaim[]>;
  listLeave(actor: string): Promise<LeaveRequest[]>;
  submitLeave(actor: string, input: unknown): Promise<LeaveRequest>;
  reviewLeave(actor: string, requestId: string, input: unknown): Promise<LeaveRequest>;
}

function parse<T>(schema: z.ZodType<T>, input: unknown, fallback: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ServerError(
      'invalid_request',
      400,
      result.error.issues[0]?.message ?? fallback,
    );
  }
  return result.data;
}

function sameWallet(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function todayInMalaysia(nowMs: number): string {
  return new Date(nowMs + MALAYSIA_OFFSET_MS).toISOString().slice(0, 10);
}

function spanInDays(startOn: string, endOn: string): number {
  return (Date.parse(endOn) - Date.parse(startOn)) / DAY_MS + 1;
}

/** The days of an approved leave request that fall inside one calendar month. */
function leaveDatesInMonth(request: LeaveRequest, month: string): string[] {
  const dates: string[] = [];
  const last = Date.parse(request.endOn);
  for (let ms = Date.parse(request.startOn); ms <= last; ms += DAY_MS) {
    const day = new Date(ms).toISOString().slice(0, 10);
    if (day.startsWith(month)) dates.push(day);
  }
  return dates;
}

export function createOvertimeService(deps: {
  repository: OvertimeRepository;
  wages: WageOfRecordPort;
  employer: string;
  now?: () => number;
}): OvertimeService {
  const now = deps.now ?? Date.now;

  function actor(value: string): Address {
    const parsed = suiAddressSchema.safeParse(value);
    if (!parsed.success) {
      throw new ServerError('authentication_required', 401, 'Sign in with your wallet');
    }
    return parsed.data;
  }

  /**
   * Anyone signed in may ask for overtime or leave, the employer included.
   *
   * This used to refuse the employer on the grounds that overtime is claimed by
   * the person who worked it. True, and beside the point: an employer works
   * late and takes days off like anybody else, and refusing them left the one
   * account that can reach every screen unable to use the one thing every
   * employee does. Deciding a request is still the employer's alone — see
   * `employer` below, which is the check that matters.
   */
  function claimant(value: string): Address {
    return actor(value);
  }

  function employer(value: string): Address {
    const address = actor(value);
    if (!sameWallet(address, deps.employer)) {
      throw new ServerError('reviewer_forbidden', 403, 'Only the employer can decide this');
    }
    return address;
  }

  const conflict = (message: string) =>
    new ServerError('processing_conflict', 409, message);

  async function claimsFor(address: Address): Promise<OvertimeClaim[]> {
    const claims = await deps.repository.listClaims(LIST_LIMIT);
    return claims.filter((claim) => sameWallet(claim.employee, address));
  }

  async function leaveFor(address: Address): Promise<LeaveRequest[]> {
    const requests = await deps.repository.listLeave(LIST_LIMIT);
    return requests.filter((request) => sameWallet(request.employee, address));
  }

  return {
    async listClaims(actorValue) {
      const address = actor(actorValue);
      if (sameWallet(address, deps.employer)) {
        return deps.repository.listClaims(LIST_LIMIT);
      }
      return claimsFor(address);
    },

    async submitClaim(actorValue, input) {
      const address = claimant(actorValue);
      const request = parse(submitOvertimeSchema, input, 'Invalid overtime claim');
      const wage = await deps.wages.resolve(address);

      const month = request.workedOn.slice(0, 7);
      /* A rejected claim is not a claim. Leaving it in the month total would
         bill its hours against the statutory ceiling, and leaving its date in
         the list would refuse the corrected claim as a duplicate. */
      const live = (await claimsFor(address)).filter(
        (claim) => claim.status !== 'rejected' && claim.workedOn.startsWith(month),
      );
      const approvedLeave = (await leaveFor(address)).filter(
        (leave) => leave.status === 'approved',
      );

      /* The same rules the form runs before the round trip. Run here as well
         because the form is a convenience and this is the gate. */
      const issues = checkOvertimeClaim({
        workedOn: request.workedOn,
        hours: request.hours,
        todayIso: todayInMalaysia(now()),
        monthHoursClaimed: fromCentihours(
          live.reduce((total, claim) => total + toCentihours(claim.hours), 0n),
        ),
        claimedDates: live.map((claim) => claim.workedOn),
        leaveDates: approvedLeave.flatMap((leave) => leaveDatesInMonth(leave, month)),
      });
      const blocking = issues.find((issue) => issue.blocking);
      if (blocking) throw new ServerError('invalid_request', 400, blocking.message);

      return deps.repository.createClaim({
        mandateId: wage.mandateId,
        employee: address,
        workedOn: request.workedOn,
        kind: request.kind,
        hours: request.hours,
        reason: request.reason.trim(),
        monthlyWage: wage.monthlyWage,
        /* Never read from the request. The multiplier, the divisor of 26 and
           the wage of record are all the server's, so what the employer sees
           is what the statute says and not what the browser sent. */
        pay: overtimePay(wage.monthlyWage, request.kind, request.hours),
      });
    },

    async reviewClaim(actorValue, claimId, input) {
      employer(actorValue);
      const request = parse(reviewSchema, input, 'Invalid review');

      const claim = await deps.repository.findClaim(claimId);
      if (!claim) throw new ServerError('claim_not_found', 404, 'Overtime claim not found');
      if (claim.status !== 'submitted') {
        throw conflict(`This claim was already ${claim.status}.`);
      }

      const decided = await deps.repository.decideClaim({
        id: claim.id,
        status: request.action === 'approve' ? 'approved' : 'rejected',
        reason: request.reason?.trim() || null,
        decidedAtMs: now(),
      });
      if (!decided) throw conflict('This claim was decided before yours landed.');
      return decided;
    },

    async settleClaims(actorValue, input) {
      employer(actorValue);
      const request = parse(settleSchema, input, 'Invalid settlement');
      return deps.repository.settleClaims(request);
    },

    async listLeave(actorValue) {
      const address = actor(actorValue);
      if (sameWallet(address, deps.employer)) {
        return deps.repository.listLeave(LIST_LIMIT);
      }
      return leaveFor(address);
    },

    async submitLeave(actorValue, input) {
      const address = claimant(actorValue);
      const request = parse(submitLeaveSchema, input, 'Invalid leave request');

      const span = spanInDays(request.startOn, request.endOn);
      if (span < 1) {
        throw new ServerError('invalid_request', 400, 'Leave cannot end before it starts.');
      }
      if (span > MAX_LEAVE_SPAN_DAYS) {
        throw new ServerError('invalid_request', 400, 'Ask for one year of leave at a time.');
      }
      const days = toCentihours(request.days);
      if (days <= 0n) {
        throw new ServerError('invalid_request', 400, 'Enter the days of leave taken.');
      }
      if (days > BigInt(span) * 100n) {
        throw new ServerError(
          'invalid_request',
          400,
          `Those dates cover ${span} days, so ${request.days} cannot be taken in them.`,
        );
      }

      const wage = await deps.wages.resolve(address);
      return deps.repository.createLeave({
        employee: address,
        startOn: request.startOn,
        endOn: request.endOn,
        days: request.days,
        kind: request.kind,
        reason: request.reason.trim(),
        monthlyWage: wage.monthlyWage,
        /* Annual and sick leave are ordinary wages and take nothing off. Only
           unpaid leave reduces the base, and it reduces it for all three
           statutory bodies alike. */
        deduction:
          request.kind === 'unpaid'
            ? unpaidLeaveDeduction(wage.monthlyWage, request.days)
            : '0',
      });
    },

    async reviewLeave(actorValue, requestId, input) {
      employer(actorValue);
      const request = parse(reviewSchema, input, 'Invalid review');

      const leave = await deps.repository.findLeave(requestId);
      if (!leave) throw new ServerError('claim_not_found', 404, 'Leave request not found');
      if (leave.status !== 'submitted') {
        throw conflict(`This request was already ${leave.status}.`);
      }

      const decided = await deps.repository.decideLeave({
        id: leave.id,
        status: request.action === 'approve' ? 'approved' : 'rejected',
        reason: request.reason?.trim() || null,
        decidedAtMs: now(),
      });
      if (!decided) throw conflict('This request was decided before yours landed.');
      return decided;
    },
  };
}
