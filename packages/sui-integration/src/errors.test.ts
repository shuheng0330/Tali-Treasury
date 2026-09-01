import { describe, expect, it } from 'vitest';
import { PAYROLL_ABORT_CODE, parseTreasuryError, treasuryErrorFromCode } from './errors.js';

describe('treasury error mapping', () => {
  it('maps every published Move abort code', () => {
    for (let code = 0; code <= 11; code += 1) {
      const error = treasuryErrorFromCode(code);
      expect(error.code).toBe(code);
      expect(error.key).not.toBe('UNKNOWN_MOVE_ABORT');
      expect(error.message.length).toBeGreaterThan(10);
    }
  });

  it('parses the CLI MoveAbort format', () => {
    const error = parseTreasuryError(
      "MoveAbort(MoveLocation { function_name: Some('spend') }, 5) in command 0",
    );
    expect(error).toMatchObject({
      code: 5,
      key: 'AMOUNT_ABOVE_LIMIT',
      retryable: false,
    });
  });

  it('parses structured gRPC abort details', () => {
    const error = parseTreasuryError({
      abortError: { function: 'spend', error_code: 7 },
    });
    expect(error).toMatchObject({ code: 7, key: 'RECIPIENT_NOT_APPROVED' });
  });

  it('returns a safe fallback without hiding the raw message', () => {
    const error = parseTreasuryError(new Error('network unavailable'));
    expect(error).toMatchObject({
      code: null,
      key: 'TRANSACTION_FAILED',
      retryable: true,
      rawMessage: 'network unavailable',
    });
  });
});

describe('payroll error mapping', () => {
  it('maps every payroll abort code the module can raise', () => {
    for (let code = 20; code <= 30; code += 1) {
      const error = treasuryErrorFromCode(code);
      expect(error.code).toBe(code);
      expect(error.key).not.toBe('UNKNOWN_MOVE_ABORT');
      expect(error.message.length).toBeGreaterThan(10);
    }
  });

  it('leaves the gap between the two modules unclaimed', () => {
    // Payroll starts at 20 so that one table can serve both modules. Codes 12
    // to 19 belong to neither, and claiming them would put a confident wrong
    // message on a refusal we do not understand.
    for (let code = 12; code <= 19; code += 1) {
      expect(treasuryErrorFromCode(code).key).toBe('UNKNOWN_MOVE_ABORT');
    }
  });

  it('explains an underpaid contribution as nobody being paid', () => {
    const error = parseTreasuryError(
      "MoveAbort(MoveLocation { function_name: Some('run_payroll') }, 24) in command 0",
    );
    expect(error).toMatchObject({
      code: PAYROLL_ABORT_CODE.STATUTORY_SHORT,
      key: 'STATUTORY_SHORT',
      retryable: false,
    });
    expect(error.message).toContain('Nobody was paid');
  });

  it('does not invite a retry after a refusal, however it arrives', () => {
    const codes = Object.values(PAYROLL_ABORT_CODE);
    for (const code of codes) {
      expect(treasuryErrorFromCode(code).retryable).toBe(false);
    }
  });
});
