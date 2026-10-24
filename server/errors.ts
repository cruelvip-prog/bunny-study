export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: string[];

  constructor(status: number, message: string, code = 'admin_api_error', issues?: string[]) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export function isAdminApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'The request failed.';
}
