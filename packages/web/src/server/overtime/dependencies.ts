import { randomUUID } from 'node:crypto';
import type { LeaveRequest, OvertimeClaim } from '@tali/shared';

import { requireEmployerWallet } from '../auth/authorization';
import { createPayrollConfigurationService } from '../payroll/configurations';
import { createServerSupabaseClient } from '../supabase/client';
import { createSupabaseOvertimeRepository } from '../supabase/overtime-repository';
import { createSupabasePayrollConfigurationRepository } from '../supabase/payroll-configuration-repository';
import { createOvertimeService, type OvertimeService } from './service';
import { fallbackStore, memoryOnlyStore, type OvertimeStore } from './store';
import type { OvertimeRepository, WageOfRecordPort } from './ports';

/**
 * RM30 a month, the wage `payroll/setup.ts` registers the demo mandate for.
 *
 * The mandate holds a few USDC of budget and the contract has no top-up, so
 * the whole demo runs at that scale. The figure is copied onto every claim at
 * submission, so raising it later cannot restate what an approved claim was
 * worth.
 */
const DEMO_MONTHLY_WAGE_MYR = '30000000';

/**
 * Held on `globalThis` rather than in a module variable.
 *
 * A route handler and a page are separate module instances under Turbopack, so
 * a plain module-level Map gave the API one set of claims and the screen an
 * empty one. Anything reached from both has to outlive the module.
 */
const MEMORY_OVERTIME = Symbol.for('tali.overtime.memory');

interface MemoryState {
  claims: Map<string, OvertimeClaim>;
  leave: Map<string, LeaveRequest>;
}

function memoryState(): MemoryState {
  const host = globalThis as unknown as Record<symbol, MemoryState | undefined>;
  host[MEMORY_OVERTIME] ??= { claims: new Map(), leave: new Map() };
  return host[MEMORY_OVERTIME];
}

/**
 * Where a claim lives when the database cannot take it. Survives a page
 * navigation, not a restart, and the screen says so.
 */
function memoryRepository(): OvertimeRepository {
  const state = memoryState();

  return {
    async createClaim(input) {
      const claim: OvertimeClaim = {
        id: randomUUID(),
        mandateId: input.mandateId,
        employee: input.employee,
        workedOn: input.workedOn,
        kind: input.kind,
        hours: input.hours,
        reason: input.reason,
        status: 'submitted',
        monthlyWage: input.monthlyWage,
        pay: input.pay,
        decisionReason: null,
        decidedAtMs: null,
        runId: null,
        createdAtMs: Date.now(),
      };
      state.claims.set(claim.id, claim);
      return claim;
    },

    async listClaims(limit) {
      return [...state.claims.values()]
        .sort(
          (a, b) => b.workedOn.localeCompare(a.workedOn) || b.createdAtMs - a.createdAtMs,
        )
        .slice(0, limit);
    },

    async findClaim(id) {
      return state.claims.get(id) ?? null;
    },

    async decideClaim(decision) {
      const existing = state.claims.get(decision.id);
      if (!existing || existing.status !== 'submitted') return null;
      const decided: OvertimeClaim = {
        ...existing,
        status: decision.status,
        decisionReason: decision.reason,
        decidedAtMs: decision.decidedAtMs,
      };
      state.claims.set(decided.id, decided);
      return decided;
    },

    async settleClaims({ employee, runId }) {
      const settled: OvertimeClaim[] = [];
      for (const existing of state.claims.values()) {
        if (existing.status !== 'approved' || existing.employee !== employee) continue;
        const paid: OvertimeClaim = { ...existing, status: 'paid', runId };
        state.claims.set(paid.id, paid);
        settled.push(paid);
      }
      return settled;
    },

    async createLeave(input) {
      const request: LeaveRequest = {
        id: randomUUID(),
        employee: input.employee,
        startOn: input.startOn,
        endOn: input.endOn,
        days: input.days,
        kind: input.kind,
        reason: input.reason,
        status: 'submitted',
        monthlyWage: input.monthlyWage,
        deduction: input.deduction,
        decisionReason: null,
        decidedAtMs: null,
        createdAtMs: Date.now(),
      };
      state.leave.set(request.id, request);
      return request;
    },

    async listLeave(limit) {
      return [...state.leave.values()]
        .sort((a, b) => b.startOn.localeCompare(a.startOn) || b.createdAtMs - a.createdAtMs)
        .slice(0, limit);
    },

    async findLeave(id) {
      return state.leave.get(id) ?? null;
    },

    async decideLeave(decision) {
      const existing = state.leave.get(decision.id);
      if (!existing || existing.status !== 'submitted') return null;
      const decided: LeaveRequest = {
        ...existing,
        status: decision.status,
        decisionReason: decision.reason,
        decidedAtMs: decision.decidedAtMs,
      };
      state.leave.set(decided.id, decided);
      return decided;
    },
  };
}

/**
 * The registry says which mandate an employee's claims belong to. It does not
 * record a wage, so the wage of record is the one the demo mandate was sized
 * for; an unregistered employee still gets a claim, bound to no mandate.
 */
function wageOfRecord(): WageOfRecordPort {
  let configurations: ReturnType<typeof createPayrollConfigurationService> | undefined;
  try {
    configurations = createPayrollConfigurationService({
      configurations: createSupabasePayrollConfigurationRepository(
        createServerSupabaseClient() as never,
      ),
      employer: requireEmployerWallet(),
    });
  } catch {
    configurations = undefined;
  }

  return {
    async resolve(employee) {
      const wage = { mandateId: null as string | null, monthlyWage: DEMO_MONTHLY_WAGE_MYR };
      if (!configurations) return wage;
      try {
        const registered = await configurations.list(employee);
        return { ...wage, mandateId: registered[0]?.mandateId ?? null };
      } catch {
        /* Overtime worked before payroll was registered is still overtime. */
        return wage;
      }
    },
  };
}

function overtimeStore(): OvertimeStore {
  const memory = memoryRepository();
  try {
    return fallbackStore(
      createSupabaseOvertimeRepository(createServerSupabaseClient() as never),
      memory,
    );
  } catch {
    return memoryOnlyStore(memory, 'Supabase is not configured');
  }
}

let service: OvertimeService | undefined;
let store: OvertimeStore | undefined;

export function getOvertimeService(): OvertimeService {
  if (!service) {
    store = overtimeStore();
    service = createOvertimeService({
      repository: store,
      wages: wageOfRecord(),
      employer: requireEmployerWallet(),
    });
  }
  return service;
}

/** Whether the claims just read or written will outlive the process. */
export function overtimeIsPersisted(): { persisted: boolean; reason: string | null } {
  getOvertimeService();
  return { persisted: store?.persisted() ?? false, reason: store?.reason() ?? null };
}
