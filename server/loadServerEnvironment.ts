import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

export const SERVER_ENV_FILENAMES = ['.env.server', '.env'] as const;

export interface LoadServerEnvironmentOptions {
  projectRoot: string;
  environment?: Record<string, string | undefined>;
}

export interface LoadedServerEnvironment {
  loadedFiles: string[];
  loadedKeys: string[];
}

/**
 * Loads the trusted server environment before server configuration is read.
 *
 * `.env.server` is the primary local source. `.env` remains a fallback for
 * existing deployments. Missing files are ignored, matching dotenv's behavior.
 */
export function loadServerEnvironment({
  projectRoot,
  environment = process.env,
}: LoadServerEnvironmentOptions): LoadedServerEnvironment {
  const loadedFiles: string[] = [];
  const loadedKeys = new Set<string>();

  for (const filename of SERVER_ENV_FILENAMES) {
    const envPath = path.join(projectRoot, filename);
    if (!fs.existsSync(envPath)) continue;

    const result = dotenv.config({
      path: envPath,
      processEnv: environment,
      quiet: true,
    });
    if (result.error) continue;

    loadedFiles.push(envPath);
    for (const key of Object.keys(result.parsed ?? {})) {
      loadedKeys.add(key);
    }
  }

  return {
    loadedFiles,
    loadedKeys: [...loadedKeys],
  };
}
