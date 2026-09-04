import { TaliApiError } from './api/client';

export type WalletErrorStatus = 'expired' | 'wrong_network' | 'rejected' | 'error';

export interface WalletError {
  status: WalletErrorStatus;
  message: string;
}

/**
 * Turns whatever sign-in threw into something a reader can act on.
 *
 * Server failures are answered first and separately. They used to fall through
 * to the generic line, so a database that was simply not running read as
 * "Wallet sign-in could not be completed" — wording that blames the wallet and
 * sends you to reinstall an extension that was working fine. The server
 * sanitises its own messages, so quoting one is safe.
 *
 * Answering them first also stops the keyword matching below misreading them:
 * a server message containing the word "chain" would otherwise be reported as
 * a wrong network.
 */
export function safeWalletError(error: unknown): WalletError {
  if (error instanceof TaliApiError) {
    if (error.code === 'authentication_required') {
      return { status: 'expired', message: 'Your session expired. Sign in again.' };
    }
    const detail = error.message.charAt(0).toLowerCase() + error.message.slice(1);
    return { status: 'error', message: `Sign-in could not be completed: ${detail}` };
  }

  const name = error instanceof Error ? error.name.toLowerCase() : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (name.includes('chain') || message.includes('network') || message.includes('chain')) {
    return { status: 'wrong_network', message: 'Switch your wallet to Sui Testnet.' };
  }
  if (
    name.includes('reject') ||
    message.includes('reject') ||
    message.includes('cancel') ||
    message.includes('denied')
  ) {
    return { status: 'rejected', message: 'Signature request rejected. Try again when ready.' };
  }

  return { status: 'error', message: 'Wallet sign-in could not be completed.' };
}
