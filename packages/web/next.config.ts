import type { NextConfig } from 'next';

/**
 * Where the screens used to live.
 *
 * Kept because these URLs are in the deployment notes, in the testnet evidence
 * and on at least one QR code that has already been printed. Temporary rather
 * than permanent: a 308 is cached by the browser forever, and a demo is the
 * worst possible place to discover that a stale redirect has been burnt into a
 * judge's machine.
 */
const MOVED: { from: string; to: string }[] = [
  { from: '/claim', to: '/requests/expense' },
  { from: '/overtime', to: '/requests/overtime' },
  { from: '/overtime/approvals', to: '/approvals' },
  { from: '/payroll/proof', to: '/safety/payroll' },
];

const config: NextConfig = {
  transpilePackages: ['@tali/shared', '@tali/treasury-sui'],
  // Next scaffolds AGENTS.md and CLAUDE.md into the package on dev start. We
  // keep our own working agreement at the repo root instead.
  agentRules: false,
  async redirects() {
    return MOVED.map(({ from, to }) => ({
      source: from,
      destination: to,
      permanent: false,
    }));
  },
};

export default config;
