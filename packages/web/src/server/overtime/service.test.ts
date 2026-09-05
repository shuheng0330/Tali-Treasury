import { describe, expect, it } from 'vitest';
import type { LeaveRequest, OvertimeClaim } from '@tali/shared';
import { overtimePay, unpaidLeaveDeduction } from '@tali/shared';

import { createOvertimeService } from './service';
import { fallbackStore } from './store';
import type { OvertimeRepository, WageOfRecordPort } from './ports';
import { OvertimeTablesMissingError } from '../supabase/overtime-repository';

const EMPLOYER = `0x${'a'.repeat(64)}`;
const EMPLOYEE = `0x${'b'.repeat(64)}`;
const WAGE = '30000000';

/** 4 September 2026, 08:00 in Kuala Lumpur. */
const NOW = Date.UTC(2026, 8, 4);

const wages: WageOfRecordPort = {
  async resolve() {
    return { mandateId: null, monthlyWage: WAGE };
  },
};

function memoryRepository(): OvertimeRepository {
  const claims = new Map<string, OvertimeClaim>();
  const leave = new Map<string, LeaveRequest>();
  let sequence = 0;

  return {
    async createClaim(input) {
      sequence += 1;
      const claim: OvertimeClaim = {
        ...input,
        id: `claim-${sequence}`,
        status: 'submitted',
        decisionReason: null,
        decidedAtMs: null,
        runId: null,
        createdAtMs: NOW,
      };
      claims.set(claim.id, claim);
      return claim;
    },
    async listClaims(limit) {
      return [...claims.values()].slice(0, limit);
    },
    async findClaim(id) {
      return claims.get(id) ?? null;
    },
    async decideClaim(decision) {
      const existing = claims.get(decision.id);
      if (!existing || existing.status !== 'submitted') return null;
      const decided: OvertimeClaim = {
        ...existing,
        status: decision.status,
        decisionReason: decision.reason,
        decidedAtMs: decision.decidedAtMs,
      };
      claims.set(decided.id, decided);
      return decided;
    },
    async settleClaims({ employee, runId }) {
      const settled: OvertimeClaim[] = [];
      for (const existing of claims.values()) {
        if (existing.status !== 'approved' || existing.employee !== employee) continue;
        const paid: OvertimeClaim = { ...existing, status: 'paid', runId };
        claims.set(paid.id, paid);
        settled.push(paid);
      }
      return settled;
    },
    async createLeave(input) {
      sequence += 1;
      const request: LeaveRequest = {
        ...input,
        id: `leave-${sequence}`,
        status: 'submitted',
        decisionReason: null,
        decidedAtMs: null,
        createdAtMs: NOW,
      };
      leave.set(request.id, request);
      return request;
    },
    async listLeave(limit) {
      return [...leave.values()].slice(0, limit);
    },
    async findLeave(id) {
      return leave.get(id) ?? null;
    },
    async decideLeave(decision) {
      const existing = leave.get(decision.id);
      if (!existing || existing.status !== 'submitted') return null;
      const decided: LeaveRequest = {
        ...existing,
        status: decision.status,
        decisionReason: decision.reason,
        decidedAtMs: decision.decidedAtMs,
      };
      leave.set(decided.id, decided);
      return decided;
    },
  };
}

function missingTables(): OvertimeRepository {
  const fail = async () => {
    throw new OvertimeTablesMissingError();
  };
  return {
    createClaim: fail,
    listClaims: fail,
    findClaim: fail,
    decideClaim: fail,
    settleClaims: fail,
    createLeave: fail,
    listLeave: fail,
    findLeave: fail,
    decideLeave: fail,
  };
}

function service(repository: OvertimeRepository = memoryRepository()) {
  return createOvertimeService({
    repository,
    wages,
    employer: EMPLOYER,
    now: () => NOW,
  });
}

const claim = {
  workedOn: '2026-09-02',
  kind: 'normal_day' as const,
  hours: '2',
  reason: 'Closed the month-end payroll file',
};

const leave = {
  startOn: '2026-09-10',
  endOn: '2026-09-11',
  days: '2',
  kind: 'unpaid' as const,
  reason: 'Family matter',
};

describe('overtime claims', () => {
  it('computes the pay itself and ignores what the client says it is worth', async () => {
    const overtime = service();

    const submitted = await overtime.submitClaim(EMPLOYEE, {
      ...claim,
      pay: '999999999',
      monthlyWage: '999999999999',
    });

    expect(submitted.pay).toBe(overtimePay(WAGE, 'normal_day', '2'));
    expect(submitted.monthlyWage).toBe(WAGE);
    expect(submitted.pay).not.toBe('999999999');
  });

  it('captures the wage of record so a later change cannot restate the claim', async () => {
    let wage = WAGE;
    const overtime = createOvertimeService({
      repository: memoryRepository(),
      wages: { async resolve() { return { mandateId: null, monthlyWage: wage }; } },
      employer: EMPLOYER,
      now: () => NOW,
    });

    const first = await overtime.submitClaim(EMPLOYEE, claim);
    wage = '60000000';
    const second = await overtime.submitClaim(EMPLOYEE, { ...claim, workedOn: '2026-09-03' });

    expect(first.monthlyWage).toBe(WAGE);
    expect(first.pay).toBe(overtimePay(WAGE, 'normal_day', '2'));
    expect(second.monthlyWage).toBe('60000000');
  });

  it('refuses a claim that breaks a rule, and names the rule', async () => {
    const overtime = service();

    await expect(
      overtime.submitClaim(EMPLOYEE, { ...claim, workedOn: '2026-09-30' }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
      message: 'Overtime is claimed after it is worked, not before.',
    });
  });

  it('refuses a second claim for a day already claimed', async () => {
    const overtime = service();
    await overtime.submitClaim(EMPLOYEE, claim);

    await expect(overtime.submitClaim(EMPLOYEE, claim)).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
      message: 'There is already a claim for this day.',
    });
  });

  it('refuses a claim that takes the month past the statutory ceiling', async () => {
    const overtime = service();
    for (let day = 1; day <= 13; day += 1) {
      await overtime.submitClaim(EMPLOYEE, {
        ...claim,
        workedOn: `2026-08-${String(day).padStart(2, '0')}`,
        hours: '8',
      });
    }

    await expect(
      overtime.submitClaim(EMPLOYEE, { ...claim, workedOn: '2026-08-14', hours: '1' }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
      message: 'This takes the month to 105 hours. The statutory limit is 104.',
    });
  });

  /* An employer works late like anybody else. Refusing them left the one
     account that reaches every screen unable to use the thing every employee
     does; deciding the claim is still theirs alone, which is the check that
     matters. */
  it('lets the employer claim their own overtime', async () => {
    const submitted = await service().submitClaim(EMPLOYER, claim);
    expect(submitted.employee).toBe(EMPLOYER);
    expect(submitted.status).toBe('submitted');
  });
});

describe('reviewing an overtime claim', () => {
  it('refuses a rejection that does not say why', async () => {
    const overtime = service();
    const submitted = await overtime.submitClaim(EMPLOYEE, claim);

    await expect(
      overtime.reviewClaim(EMPLOYER, submitted.id, { action: 'reject' }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
      message: 'A rejection has to say why.',
    });
    await expect(
      overtime.reviewClaim(EMPLOYER, submitted.id, { action: 'reject', reason: '   ' }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
  });

  it('approves without a reason', async () => {
    const overtime = service();
    const submitted = await overtime.submitClaim(EMPLOYEE, claim);

    const approved = await overtime.reviewClaim(EMPLOYER, submitted.id, { action: 'approve' });

    expect(approved.status).toBe('approved');
    expect(approved.decisionReason).toBeNull();
    expect(approved.decidedAtMs).toBe(NOW);
  });

  it('refuses a second decision rather than overwriting the first', async () => {
    const overtime = service();
    const submitted = await overtime.submitClaim(EMPLOYEE, claim);
    await overtime.reviewClaim(EMPLOYER, submitted.id, { action: 'approve' });

    await expect(
      overtime.reviewClaim(EMPLOYER, submitted.id, { action: 'reject', reason: 'Changed my mind' }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });

    const stored = await overtime.listClaims(EMPLOYER);
    expect(stored[0]?.status).toBe('approved');
  });

  it('refuses a decision from the employee who made the claim', async () => {
    const overtime = service();
    const submitted = await overtime.submitClaim(EMPLOYEE, claim);

    await expect(
      overtime.reviewClaim(EMPLOYEE, submitted.id, { action: 'approve' }),
    ).rejects.toMatchObject({ code: 'reviewer_forbidden', status: 403 });
  });

  it('answers 404 for a claim that is not there', async () => {
    await expect(
      service().reviewClaim(EMPLOYER, 'claim-404', { action: 'approve' }),
    ).rejects.toMatchObject({ code: 'claim_not_found', status: 404 });
  });
});

describe('leave requests', () => {
  it('deducts only for unpaid leave', async () => {
    const overtime = service();

    const unpaid = await overtime.submitLeave(EMPLOYEE, leave);
    const annual = await overtime.submitLeave(EMPLOYEE, {
      ...leave,
      startOn: '2026-09-20',
      endOn: '2026-09-21',
      kind: 'annual',
    });

    expect(unpaid.deduction).toBe(unpaidLeaveDeduction(WAGE, '2'));
    expect(annual.deduction).toBe('0');
  });

  it('refuses more days than the dates can hold', async () => {
    await expect(
      service().submitLeave(EMPLOYEE, { ...leave, days: '5' }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
  });

  it('refuses a rejection with no reason, and refuses to decide twice', async () => {
    const overtime = service();
    const submitted = await overtime.submitLeave(EMPLOYEE, leave);

    await expect(
      overtime.reviewLeave(EMPLOYER, submitted.id, { action: 'reject' }),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 400 });

    await overtime.reviewLeave(EMPLOYER, submitted.id, { action: 'reject', reason: 'Not this week' });
    await expect(
      overtime.reviewLeave(EMPLOYER, submitted.id, { action: 'approve' }),
    ).rejects.toMatchObject({ code: 'processing_conflict', status: 409 });
  });

  it('lets the employer ask for their own leave', async () => {
    const submitted = await service().submitLeave(EMPLOYER, leave);
    expect(submitted.employee).toBe(EMPLOYER);
    expect(submitted.status).toBe('submitted');
  });

  /* Filing on somebody else's behalf is still impossible, because a request is
     always recorded against the wallet that signed it. */
  it('records a request against the wallet that sent it, never another', async () => {
    const submitted = await service().submitLeave(EMPLOYER, {
      ...leave,
      employee: EMPLOYEE,
    } as never);
    expect(submitted.employee).toBe(EMPLOYER);
  });
});

describe('what the employee and the employer can read', () => {
  it('shows the employee their own claims and the employer everyone', async () => {
    const overtime = service();
    await overtime.submitClaim(EMPLOYEE, claim);

    const other = `0x${'c'.repeat(64)}`;
    await overtime.submitClaim(other, { ...claim, workedOn: '2026-09-03' });

    expect(await overtime.listClaims(EMPLOYER)).toHaveLength(2);
    expect(await overtime.listClaims(EMPLOYEE)).toHaveLength(1);
  });
});

describe('when the tables are not there yet', () => {
  it('keeps the claim and refuses to call it persisted', async () => {
    const store = fallbackStore(missingTables(), memoryRepository());
    const overtime = service(store);

    const submitted = await overtime.submitClaim(EMPLOYEE, claim);

    expect(submitted.pay).toBe(overtimePay(WAGE, 'normal_day', '2'));
    expect(store.persisted()).toBe(false);
    expect(store.reason()).toContain('overtime_claims');
  });
});
