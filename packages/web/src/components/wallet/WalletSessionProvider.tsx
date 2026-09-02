'use client';

import {
  DAppKitProvider,
  useCurrentAccount,
  useCurrentNetwork,
  useDAppKit,
  useWalletConnection,
} from '@mysten/dapp-kit-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  createWalletSession,
  deleteWalletSession,
  getWalletSession,
  issueWalletChallenge,
  TaliApiError,
} from '@/lib/api/client';
import { dAppKit } from '@/lib/wallet/dapp-kit';

export type WalletSessionStatus =
  | 'loading'
  | 'disconnected'
  | 'connected'
  | 'signing'
  | 'authenticated'
  | 'expired'
  | 'wrong_network'
  | 'rejected'
  | 'error';

interface WalletSessionContextValue {
  address: string | null;
  connectedAddress: string | null;
  expiresAt: string | null;
  status: WalletSessionStatus;
  error: string | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const WalletSessionContext = createContext<WalletSessionContextValue | null>(null);

function safeWalletError(error: unknown): {
  status: 'expired' | 'wrong_network' | 'rejected' | 'error';
  message: string;
} {
  if (error instanceof TaliApiError && error.code === 'authentication_required') {
    return { status: 'expired', message: 'Your session expired. Sign in again.' };
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

function SessionController({ children }: { children: React.ReactNode }) {
  const dapp = useDAppKit();
  const account = useCurrentAccount();
  const network = useCurrentNetwork();
  const connection = useWalletConnection();
  const [session, setSession] = useState<{ address: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState<WalletSessionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const previousAccount = useRef<string | null>(null);

  const clearServerSession = useCallback(async () => {
    try {
      await deleteWalletSession();
    } catch {
      // Local state still clears; the fixed-expiry server session cannot be extended.
    }
    setSession(null);
  }, []);

  useEffect(() => {
    let active = true;
    getWalletSession()
      .then((value) => {
        if (!active) return;
        setSession(value);
        setStatus('authenticated');
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof TaliApiError && reason.status === 401) {
          setStatus(account ? 'connected' : 'disconnected');
          return;
        }
        setStatus('error');
        setError('Session status could not be checked.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (connection.status === 'connecting' || connection.status === 'reconnecting') return;
    const current = account?.address ?? null;
    const changed = previousAccount.current !== null && previousAccount.current !== current;
    const mismatchedSession = session && current !== session.address;
    previousAccount.current = current;

    if ((changed || mismatchedSession || (!current && session)) && session) {
      void clearServerSession().then(() => {
        setStatus(current ? 'connected' : 'disconnected');
        setError(current ? 'Wallet account changed. Sign in again.' : null);
      });
      return;
    }
    if (!session && status !== 'loading' && status !== 'signing') {
      setStatus(current ? 'connected' : 'disconnected');
    }
  }, [account?.address, clearServerSession, connection.status, session, status]);

  useEffect(() => {
    if (!session) return;
    const remaining = Date.parse(session.expiresAt) - Date.now();
    if (remaining <= 0) {
      setSession(null);
      setStatus('expired');
      setError('Your session expired. Sign in again.');
      return;
    }
    const timeout = window.setTimeout(() => {
      setSession(null);
      setStatus('expired');
      setError('Your session expired. Sign in again.');
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [session]);

  const signIn = useCallback(async () => {
    if (!account) {
      setStatus('disconnected');
      setError('Connect a Sui wallet first.');
      return;
    }
    if (network !== 'testnet') {
      setStatus('wrong_network');
      setError('Switch your wallet to Sui Testnet.');
      return;
    }
    setStatus('signing');
    setError(null);
    try {
      const challenge = await issueWalletChallenge(account.address);
      const signed = await dapp.signPersonalMessage({
        message: new TextEncoder().encode(challenge.message),
        account,
        network: 'testnet',
      });
      const created = await createWalletSession(challenge.challengeId, signed.signature);
      if (created.address !== account.address) {
        throw new Error('Wallet account changed during sign-in');
      }
      setSession(created);
      setStatus('authenticated');
    } catch (reason) {
      const safe = safeWalletError(reason);
      setSession(null);
      setStatus(safe.status);
      setError(safe.message);
    }
  }, [account, dapp, network]);

  const signOut = useCallback(async () => {
    await clearServerSession();
    setStatus(account ? 'connected' : 'disconnected');
    setError(null);
  }, [account, clearServerSession]);

  const value = useMemo<WalletSessionContextValue>(
    () => ({
      address: session?.address ?? null,
      connectedAddress: account?.address ?? null,
      expiresAt: session?.expiresAt ?? null,
      status,
      error,
      signIn,
      signOut,
    }),
    [account?.address, error, session, signIn, signOut, status],
  );

  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  );
}

export function WalletSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <SessionController>{children}</SessionController>
    </DAppKitProvider>
  );
}

export function useWalletSession(): WalletSessionContextValue {
  const value = useContext(WalletSessionContext);
  if (!value) throw new Error('WalletSessionProvider is missing');
  return value;
}
