import { describe, expect, it } from 'vitest';
import { TaliApiError } from './api/client';
import { safeWalletError } from './wallet-error';

describe('safeWalletError', () => {
  it('asks for a fresh sign-in when the session expired', () => {
    const error = new TaliApiError('Unauthorized', 'authentication_required', 401);
    expect(safeWalletError(error)).toEqual({
      status: 'expired',
      message: 'Your session expired. Sign in again.',
    });
  });

  /* The case that sent us hunting through wallet extensions: the database was
     not running, and the generic line blamed the wallet for it. */
  it('quotes the server when sign-in fails on the backend', () => {
    const error = new TaliApiError('The database operation failed', 'database_failed', 500);
    expect(safeWalletError(error)).toEqual({
      status: 'error',
      message: 'Sign-in could not be completed: the database operation failed',
    });
  });

  it('does not read a server message as a network problem', () => {
    const error = new TaliApiError('The chain configuration failed', 'config_failed', 500);
    expect(safeWalletError(error).status).toBe('error');
  });

  it('names a wrong network from a wallet error', () => {
    expect(safeWalletError(new Error('Unsupported chain requested')).status).toBe(
      'wrong_network',
    );
  });

  it('recognises the reader declining to sign', () => {
    for (const text of ['User rejected the request', 'Request cancelled', 'Access denied']) {
      expect(safeWalletError(new Error(text)).status).toBe('rejected');
    }
  });

  it('falls back only for something it genuinely cannot place', () => {
    expect(safeWalletError(new Error('boom'))).toEqual({
      status: 'error',
      message: 'Wallet sign-in could not be completed.',
    });
    expect(safeWalletError('not an error').status).toBe('error');
  });
});
