/** Anything that answers a name with a value, including `process.env`. */
export type EnvLike = Record<string, string | undefined>;

export function requireAppOrigin(env: EnvLike = process.env): string {
  const value = env.TALI_APP_ORIGIN?.trim();
  if (!value) throw new Error('TALI_APP_ORIGIN is required');
  const url = new URL(value);
  if (url.origin !== value || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error('TALI_APP_ORIGIN must be an exact HTTP(S) origin');
  }
  return value;
}
