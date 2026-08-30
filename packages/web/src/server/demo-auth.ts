import { ServerError } from './errors';

export function requireDemoIdentityEnabled(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.TALI_ALLOW_INSECURE_DEMO_IDENTITY !== 'true') {
    throw new ServerError(
      'authentication_required',
      503,
      'The demo identity API is disabled until wallet authentication is configured',
    );
  }
}
