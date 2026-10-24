// Load `.env.server` before any other server module is evaluated.
import { APPLICATION_ROOT } from './environment';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getMainProjectServerConfig } from './config';
import { verifyMainAdminSession } from './auth';
import { SupabaseQuestionBankRepository } from './questionBankRepository';
import { QuestionBankAdminService } from './questionBankService';
import { createAdminQuestionBankRouter } from './adminQuestionRouter';
import { createRateLimitMiddleware } from './rateLimit';
import { AdminApiError, isAdminApiError } from './errors';
import { handleBeforeUserCreated } from './beforeUserCreatedHook';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

const app = express();
app.disable('x-powered-by');

const ALLOWED_CORS_ORIGIN = 'https://oinkie-prep.pages.dev';
app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin === ALLOWED_CORS_ORIGIN) {
    response.set('Access-Control-Allow-Origin', ALLOWED_CORS_ORIGIN);
    response.set('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    if (origin === ALLOWED_CORS_ORIGIN) {
      response.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
      response.set('Access-Control-Max-Age', '86400');
    }
    response.status(204).end();
    return;
  }
  next();
});

app.use((request, response, next) => {
  if (request.path === '/api/auth/before-user-created') {
    next();
    return;
  }
  express.json({
    limit: '20mb',
    verify: (verifiedRequest, _response, buffer) => {
      (verifiedRequest as { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  })(request, response, next);
});

app.use((_request, response, next) => {
  response.set('X-Content-Type-Options', 'nosniff');
  response.set('X-Frame-Options', 'DENY');
  response.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    response.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "frame-src 'self' https://pigbunn.pages.dev",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  response.set('Content-Security-Policy', csp);
  next();
});

const adminRateLimiter = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 300,
});

const repository = new SupabaseQuestionBankRepository(process.env);
const service = new QuestionBankAdminService(repository);
const adminRouter = createAdminQuestionBankRouter({
  service,
  authorize: (accessToken) => verifyMainAdminSession(
    accessToken,
    getMainProjectServerConfig(process.env),
  ),
});

app.get('/api/health', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({ ok: true, service: 'oinkie-admin-question-banks' });
});

app.use('/api/admin', adminRateLimiter, (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  response.set('X-Content-Type-Options', 'nosniff');
  next();
});
app.use('/api/admin/question-banks', adminRouter);

const authHookRateLimiter = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many authentication requests. Please try again later.',
});

app.post(
  '/api/auth/before-user-created',
  authHookRateLimiter,
  express.json({
    limit: '1mb',
    verify: (request, _response, buffer) => {
      (request as { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
  handleBeforeUserCreated,
);

app.use('/api', (_request, response) => {
  response.status(404).json({
    error: {
      message: 'Unknown admin API route.',
      code: 'not_found',
    },
  });
});

const distDirectory = path.join(APPLICATION_ROOT, 'dist');
if (fs.existsSync(distDirectory)) {
  app.use(express.static(distDirectory));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distDirectory, 'index.html'));
  });
}

app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (!request.path.startsWith('/api')) {
    next(error);
    return;
  }
  const errorRecord = error !== null && typeof error === 'object'
    ? error as Record<string, unknown>
    : {};
  const apiError = isAdminApiError(error)
    ? error
    : errorRecord.type === 'entity.too.large'
      ? new AdminApiError(413, 'The admin request body is too large.', 'payload_too_large')
      : error instanceof SyntaxError && 'body' in error
        ? new AdminApiError(400, 'The request body is not valid JSON.', 'invalid_json')
        : new AdminApiError(
            500,
            'The trusted admin API could not complete this request.',
            'internal_error',
          );
  response.status(apiError.status).json({
    error: {
      message: apiError.message,
      code: apiError.code,
      ...(apiError.issues?.length ? { issues: apiError.issues } : {}),
    },
  });
});

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const safePort = Number.isSafeInteger(port) && port > 0 && port < 65_536 ? port : 3001;
const host = process.env.HOST?.trim() || '0.0.0.0';
app.listen(safePort, host, () => {
  console.log(`OINKIE admin question-bank API listening on http://${host}:${safePort}`);
});
