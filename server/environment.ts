import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerEnvironment } from './loadServerEnvironment';

export const APPLICATION_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

// This module must be imported before any server module that reads configuration.
export const SERVER_ENVIRONMENT = loadServerEnvironment({
  projectRoot: APPLICATION_ROOT,
});
