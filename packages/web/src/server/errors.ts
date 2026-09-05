import type { ApiError } from '@tali/shared';

export type ServerErrorCode =
  | 'fx_unavailable'
  | 'fx_quote_invalid'
  | 'authentication_required'
  | 'authentication_failed'
  | 'origin_forbidden'
  | 'forbidden'
  | 'authorization_configuration_failed'
  | 'invalid_request'
  | 'unsupported_receipt'
  | 'event_not_found'
  | 'member_not_found'
  | 'member_already_exists'
  | 'processor_forbidden'
  | 'reviewer_forbidden'
  | 'claim_not_found'
  | 'payroll_run_not_found'
  | 'payroll_not_found'
  | 'payroll_forbidden'
  | 'payroll_registration_pending'
  | 'payroll_registration_conflict'
  | 'payroll_registration_refused'
  | 'payroll_registration_failed'
  | 'payroll_registration_configuration_failed'
  | 'payroll_setup_verification_failed'
  | 'stream_not_found'
  | 'processing_conflict'
  | 'mandate_read_failed'
  | 'payment_configuration_failed'
  | 'payment_submission_uncertain'
  | 'payment_reconciliation_failed'
  | 'payment_reconciliation_unavailable'
  | 'duplicate_receipt'
  | 'analysis_draft_consumed'
  | 'analysis_draft_expired'
  | 'analysis_draft_forbidden'
  | 'analysis_failed'
  | 'storage_failed'
  | 'database_failed';

export class ServerError extends Error {
  readonly code: ServerErrorCode;
  readonly status: number;

  constructor(
    code: ServerErrorCode,
    status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ServerError';
    this.code = code;
    this.status = status;
  }
}

export function isServerError(error: unknown): error is ServerError {
  return error instanceof ServerError;
}

export function toApiError(error: unknown): { body: ApiError; status: number } {
  if (isServerError(error)) {
    return {
      body: { error: error.code, message: error.message },
      status: error.status,
    };
  }

  return {
    body: {
      error: 'database_failed',
      message: 'The server could not complete the request',
    },
    status: 500,
  };
}
