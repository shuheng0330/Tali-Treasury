/**
 * Readers for the JSON shape Sui returns for an object's fields.
 *
 * Every value arrives as a string, a number or a nested record, and any of them
 * can be missing on an object that is not what we asked for. These throw rather
 * than coerce: a silent `BigInt(undefined)` further down would report a mandate
 * with a zero budget instead of an unreadable one.
 */

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label} returned by Sui`);
  }
  return value as Record<string, unknown>;
}

export function asBigInt(value: unknown, label: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`Invalid ${label} returned by Sui`);
  }
  return BigInt(value);
}

export function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${label} returned by Sui`);
  }
  return value;
}

export function asStringVector(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`Invalid ${label} returned by Sui`);
  }
  return value as string[];
}

export function asBigIntVector(value: unknown, label: string): bigint[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label} returned by Sui`);
  }
  return value.map((entry) => asBigInt(entry, label));
}

/** A `Balance<T>` is sometimes flattened to its value and sometimes not. */
export function balanceValue(value: unknown, label: string): bigint {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return BigInt(value);
  }
  const balance = asRecord(value, label);
  return asBigInt(balance.value ?? balance.balance, label);
}
