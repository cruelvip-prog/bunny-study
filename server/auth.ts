import type { MainProjectServerConfig } from './config';
import { AdminApiError } from './errors';

export interface MainAdminIdentity {
  userId: string;
}

type FetchImplementation = typeof fetch;

function authorizationHeaders(config: MainProjectServerConfig, accessToken: string): Record<string, string> {
  return {
    apikey: config.publishableKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Verifies the existing main-project session and then asks the main project's
 * database-backed is_admin() RPC whether that user is on the owner allowlist.
 * No browser-supplied role, email, UUID, or admin flag is trusted.
 */
export async function verifyMainAdminSession(
  accessToken: string,
  config: MainProjectServerConfig,
  fetchImplementation: FetchImplementation = fetch,
): Promise<MainAdminIdentity> {
  const token = accessToken.trim();
  if (!token) {
    throw new AdminApiError(401, 'An authenticated OINKIE Study admin session is required.', 'missing_session');
  }

  let userResponse: Response;
  try {
    userResponse = await fetchImplementation(`${config.url}/auth/v1/user`, {
      method: 'GET',
      headers: authorizationHeaders(config, token),
    });
  } catch {
    throw new AdminApiError(
      503,
      'The main OINKIE Study authentication service could not be reached.',
      'auth_unavailable',
    );
  }

  if (userResponse.status === 401 || userResponse.status === 403) {
    throw new AdminApiError(401, 'Your admin session is invalid or has expired. Sign in again.', 'invalid_session');
  }
  if (!userResponse.ok) {
    throw new AdminApiError(
      503,
      'The main OINKIE Study authentication service did not verify the session.',
      'auth_unavailable',
    );
  }

  const user = await responseJson(userResponse);
  const userId = user && typeof user === 'object' && 'id' in user && typeof user.id === 'string'
    ? user.id
    : null;
  if (!userId) {
    throw new AdminApiError(401, 'The authenticated user could not be verified.', 'invalid_session');
  }

  let adminResponse: Response;
  try {
    adminResponse = await fetchImplementation(`${config.url}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: {
        ...authorizationHeaders(config, token),
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
  } catch {
    throw new AdminApiError(
      503,
      'The main OINKIE Study database could not verify admin access.',
      'auth_unavailable',
    );
  }

  if (!adminResponse.ok) {
    if (adminResponse.status === 401 || adminResponse.status === 403) {
      throw new AdminApiError(403, 'This account is not authorized to manage question banks.', 'not_admin');
    }
    throw new AdminApiError(
      503,
      'The main OINKIE Study database did not complete the admin check.',
      'auth_unavailable',
    );
  }

  const isAdmin = await responseJson(adminResponse);
  if (isAdmin !== true) {
    throw new AdminApiError(403, 'This account is not authorized to manage question banks.', 'not_admin');
  }

  return { userId };
}
