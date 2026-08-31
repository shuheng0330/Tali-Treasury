import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@tali/shared', '@tali/treasury-sui'],
  // Next scaffolds AGENTS.md and CLAUDE.md into the package on dev start. We
  // keep our own working agreement at the repo root instead.
  agentRules: false,
};

export default config;
