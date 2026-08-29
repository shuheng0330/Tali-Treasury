import { describe, expect, it } from 'vitest';
import { parseTreasuryError, treasuryErrorFromCode } from './errors.js';

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
