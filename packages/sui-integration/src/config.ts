import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import type { TreasuryConfig } from './types.js';

export const SUI_CLOCK_ID = '0x6';
export const SUI_COIN_TYPE = '0x2::sui::SUI';

export const TALI_TESTNET_PACKAGE_ID =
  '0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523';

export const taliTestnetSuiConfig: Readonly<TreasuryConfig> = {
  packageId: TALI_TESTNET_PACKAGE_ID,
  coinType: SUI_COIN_TYPE,
  clockId: SUI_CLOCK_ID,
};

export function normalizeAddress(value: string, label = 'address'): string {
  let normalized: string;
  try {
    normalized = normalizeSuiAddress(value);
  } catch {
    throw new Error(`Invalid Sui ${label}: ${value}`);
  }

  if (!isValidSuiAddress(normalized)) {
    throw new Error(`Invalid Sui ${label}: ${value}`);
  }

  return normalized;
}

export function normalizeConfig(config: TreasuryConfig): Required<TreasuryConfig> {
  if (!config.coinType.includes('::')) {
    throw new Error(`Invalid Move coin type: ${config.coinType}`);
  }

  return {
    packageId: normalizeAddress(config.packageId, 'package ID'),
    coinType: config.coinType,
    clockId: normalizeAddress(config.clockId ?? SUI_CLOCK_ID, 'clock ID'),
  };
}
