import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@tali/shared', '@tali/treasury-sui'],
};

export default config;
