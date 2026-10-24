import {
  QUESTION_BANK_SOURCES,
  type QuestionBankSourceDefinition,
  type QuestionBankSourceId,
} from '../src/questionBanks/sourceRegistry';
import { AdminApiError } from './errors';

export const MAIN_PROJECT_URL_ENV = 'OINKIE_MAIN_SUPABASE_URL';
export const MAIN_PROJECT_PUBLISHABLE_KEY_ENV = 'OINKIE_MAIN_SUPABASE_PUBLISHABLE_KEY';

export interface MainProjectServerConfig {
  url: string;
  publishableKey: string;
}

export interface RemoteProjectServerConfig {
  source: QuestionBankSourceDefinition;
  url: string | null;
  serviceRoleKey: string | null;
  error: string | null;
}

export type ServerEnvironment = Record<string, string | undefined>;

function normalizedUrl(
  value: string | undefined,
  urlVariable: string,
  label: string,
): { url: string } | { error: string } {
  const raw = value?.trim();
  if (!raw) {
    return { error: `${label} is not configured. Set ${urlVariable} in the server environment.` };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: `${label} has an invalid project URL in ${urlVariable}.` };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: `${label} project URL must use HTTP or HTTPS.` };
  }
  return { url: parsed.toString().replace(/\/$/, '') };
}

export function getMainProjectServerConfig(
  environment: ServerEnvironment = process.env,
): MainProjectServerConfig {
  const rawUrl = environment[MAIN_PROJECT_URL_ENV]?.trim();
  const publishableKey = environment[MAIN_PROJECT_PUBLISHABLE_KEY_ENV]?.trim();
  const missing = [
    ...(!rawUrl ? [MAIN_PROJECT_URL_ENV] : []),
    ...(!publishableKey ? [MAIN_PROJECT_PUBLISHABLE_KEY_ENV] : []),
  ];
  if (missing.length) {
    throw new AdminApiError(
      503,
      `The main OINKIE Study project is not configured for admin authentication. Set ${missing.join(' and ')} in the server environment.`,
      'main_project_not_configured',
    );
  }

  const urlResult = normalizedUrl(
    rawUrl,
    MAIN_PROJECT_URL_ENV,
    'The main OINKIE Study project',
  );
  if ('error' in urlResult) {
    throw new AdminApiError(503, urlResult.error, 'main_project_not_configured');
  }
  return { url: urlResult.url, publishableKey: publishableKey! };
}

export function getRemoteProjectServerConfig(
  source: QuestionBankSourceDefinition,
  environment: ServerEnvironment = process.env,
): RemoteProjectServerConfig {
  const urlVariable = source.serverEnvironment.url;
  const keyVariable = source.serverEnvironment.serviceRoleKey;
  const rawUrl = environment[urlVariable]?.trim();
  const serviceRoleKey = environment[keyVariable]?.trim() ?? null;

  if (!rawUrl || !serviceRoleKey) {
    const missing = [
      ...(!rawUrl ? [urlVariable] : []),
      ...(!serviceRoleKey ? [keyVariable] : []),
    ];
    return {
      source,
      url: null,
      serviceRoleKey: null,
      error: `${source.label} admin access is not configured. Set ${missing.join(' and ')} in the server environment.`,
    };
  }

  const urlResult = normalizedUrl(rawUrl, urlVariable, `${source.label} admin access`);
  if ('error' in urlResult) {
    return {
      source,
      url: null,
      serviceRoleKey: null,
      error: urlResult.error,
    };
  }
  return {
    source,
    url: urlResult.url,
    serviceRoleKey,
    error: null,
  };
}

export function getConfiguredRemoteProjects(
  environment: ServerEnvironment = process.env,
): Record<QuestionBankSourceId, RemoteProjectServerConfig> {
  return Object.fromEntries(
    QUESTION_BANK_SOURCES.map((source) => [
      source.id,
      getRemoteProjectServerConfig(source, environment),
    ]),
  ) as Record<QuestionBankSourceId, RemoteProjectServerConfig>;
}
