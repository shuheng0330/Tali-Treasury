import type { ApiError } from '@tali/shared';

export type ServerErrorCode =
  | 'invalid_request'
  | 'unsupported_receipt'
  | 'event_not_found'
  | 'member_not_found'
  | 'duplicate_receipt'
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
