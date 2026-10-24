import { Router, type NextFunction, type Request, type Response } from 'express';
import type { QuestionBankAdminService } from './questionBankService';
import { AdminApiError, isAdminApiError } from './errors';
import { extractBearerToken, type MainAdminIdentity } from './auth';

export interface AdminQuestionRouterDependencies {
  service: QuestionBankAdminService;
  authorize: (accessToken: string) => Promise<MainAdminIdentity>;
}

function queryText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function sendError(response: Response, error: unknown): void {
  const apiError = isAdminApiError(error)
    ? error
    : new AdminApiError(
        500,
        'The trusted admin API could not complete this request. No credentials were exposed.',
        'internal_error',
      );
  response.status(apiError.status).json({
    error: {
      message: apiError.message,
      code: apiError.code,
      ...(apiError.issues?.length ? { issues: apiError.issues } : {}),
    },
  });
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

/**
 * Routes receive only a source ID. The table is always resolved from the
 * centralized registry; a client-supplied table is checked for drift and is
 * never used to choose a query destination.
 */
export function createAdminQuestionBankRouter(
  dependencies: AdminQuestionRouterDependencies,
): Router {
  const { service, authorize } = dependencies;
  const router = Router();

  router.use((request, _response, next) => {
    void (async () => {
      const token = extractBearerToken(request.header('authorization'));
      if (!token) {
        throw new AdminApiError(
          401,
          'An authenticated OINKIE Study admin session is required.',
          'missing_session',
        );
      }
      await authorize(token);
      next();
    })().catch(next);
  });

  router.get('/status', asyncRoute(async (_request, response) => {
    response.json({ statuses: await service.statuses() });
  }));

  router.get('/:source/questions', asyncRoute(async (request, response) => {
    const result = await service.list(
      request.params.source,
      {
        page: queryText(request.query.page),
        pageSize: queryText(request.query.pageSize),
        search: queryText(request.query.search),
        subject: queryText(request.query.subject),
        chapter: queryText(request.query.chapter),
        topic: queryText(request.query.topic),
        section: queryText(request.query.section),
        exercise: queryText(request.query.exercise),
        difficulty: queryText(request.query.difficulty),
        language: queryText(request.query.language),
        answer: queryText(request.query.answer),
        sourcePdf: queryText(request.query.sourcePdf),
      },
      queryText(request.query.adminSection),
    );
    response.json(result);
  }));

  router.post('/:source/questions/import', asyncRoute(async (request, response) => {
    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    const result = await service.import(
      request.params.source,
      body.table,
      body.questions,
      body.adminSection,
    );
    response.status(200).json(result);
  }));

  router.post('/:source/questions', asyncRoute(async (request, response) => {
    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    const result = await service.create(
      request.params.source,
      body.table,
      body.question,
      body.adminSection,
    );
    response.status(201).json(result);
  }));

  router.patch('/:source/questions/:id', asyncRoute(async (request, response) => {
    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    const result = await service.update(
      request.params.source,
      request.params.id,
      body.table,
      body.question,
      body.adminSection,
    );
    response.json(result);
  }));

  router.delete('/:source/questions/:id', asyncRoute(async (request, response) => {
    const result = await service.remove(
      request.params.source,
      request.params.id,
      queryText(request.query.table),
      queryText(request.query.adminSection),
    );
    response.json(result);
  }));

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    sendError(response, error);
  });

  return router;
}
