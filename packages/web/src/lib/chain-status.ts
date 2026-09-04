/**
 * How far the payroll deployment has actually got, and the sentence that says
 * so.
 *
 * Three states, not two. Package v2 carrying `payroll` is published on Sui
 * testnet, but no mandate has been funded from it, and the screens used to
 * collapse both of those into "the payroll module is not on chain yet".
 *
 * Understating what is deployed is not the safe error it looks like. A judge
 * who opens the explorer finds the module there and then has to wonder what
 * else the interface is wrong about — and the one thing this product cannot
 * afford is a screen that disagrees with the chain in either direction.
 *
 * Whether a run can actually be *signed* is a different question with more
 * inputs, and it is already answered by `payrollIsLive` in
 * `server/payroll/dependencies`. That rule is not repeated here; callers pass
 * its answer in. Two copies of it would drift, and the copy nobody is looking
 * at is the one that drifts first.
 */

type EnvRecord = Record<string, string | undefined>;

export type PayrollStage = 'unpublished' | 'published' | 'mandated';

function has(env: EnvRecord, ...names: string[]): boolean {
  return names.some((name) => Boolean(env[name]?.trim()));
}

/**
 * Read from configuration alone, so it stays true on a screen that has not
 * talked to the chain. A configured mandate that turns out to be unreadable is
 * still `mandated` — the deployment intends it, and the copy for that case says
 * the mandate could not be read rather than pretending none was set.
 */
export function payrollStage(env: EnvRecord = process.env): PayrollStage {
  if (!has(env, 'PAYROLL_PACKAGE_ID', 'NEXT_PUBLIC_PAYROLL_PACKAGE_ID')) {
    return 'unpublished';
  }
  return has(env, 'PAYROLL_MANDATE_ID', 'NEXT_PUBLIC_PAYROLL_MANDATE_ID')
    ? 'mandated'
    : 'published';
}

/**
 * Why the earnings screen is not showing a real salary stream, phrased to
 * complete the sentence "… fell back because ___." in `DataNotice`.
 *
 * Earnings reads a stream rather than a mandate. A funded mandate with no
 * stream opened against it is the state we expect to be in on the day, and
 * "no mandate" would be the wrong thing to tell that reader.
 */
export function streamFallbackReason(
  stage: PayrollStage,
  env: EnvRecord = process.env,
): string {
  if (stage === 'unpublished') return 'the payroll module is not on chain yet';
  if (!has(env, 'DEMO_STREAM_ID', 'NEXT_PUBLIC_DEMO_STREAM_ID')) {
    return 'the payroll module is on chain but no salary stream has been opened yet';
  }
  return 'the configured salary stream could not be read';
}

/**
 * What pressing Run payroll would actually do. `runsAreLive` is
 * `payrollIsLive()`, which wants a signer and the statutory recipients on top of
 * the objects this module can see, so a deployment can be `mandated` and still
 * unable to sign.
 */
export function payrollRunNote(stage: PayrollStage, runsAreLive: boolean): string {
  if (runsAreLive) return 'Running payroll signs a real transaction on Sui testnet.';
  if (stage === 'unpublished') return 'Paying a run still needs the payroll module on chain.';
  if (stage === 'published') {
    return 'The module is on chain. Paying a run still needs a mandate funded from it.';
  }
  return 'A mandate is configured. Paying a run still needs the signer and statutory recipients set.';
}

/**
 * What an attempt the server would not submit becomes, once the deployment can
 * sign one. Worded as a clause because the screen follows it with the server's
 * own reason for refusing this particular attempt.
 */
export function payrollAttemptNote(stage: PayrollStage): string {
  switch (stage) {
    case 'unpublished':
      return 'This becomes a real testnet transaction once the payroll module is published';
    case 'published':
      return 'This becomes a real testnet transaction once a mandate is funded from the published module';
    case 'mandated':
      return 'This becomes a real testnet transaction once the signer and statutory recipients are configured';
  }
}

/**
 * Why the enforcement screen is quoting the floor the mandate is *created* with
 * rather than one read back off it. Only reached when the chain read did not
 * produce a figure; the caller says the good sentence itself when it did.
 */
export function epfFloorNote(stage: PayrollStage): string {
  switch (stage) {
    case 'unpublished':
      return 'It has not been read off the chain, because the payroll module is not published yet. Both outcomes become real testnet transactions once it is.';
    case 'published':
      return 'It has not been read off the chain, because no mandate has been funded yet — the module itself is published on testnet. Both outcomes become real testnet transactions once a mandate exists.';
    case 'mandated':
      return 'The configured mandate could not be read just now, so this is the floor it was created with rather than one read back from it. Both outcomes are real testnet transactions.';
  }
}
