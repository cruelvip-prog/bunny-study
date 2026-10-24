import type { Request, Response } from 'express';
import { isDisposableEmail } from './disposableEmail';
import { verifyStandardWebhook } from './webhookVerification';

export function handleBeforeUserCreated(request: Request, response: Response): void {
  response.set('Cache-Control', 'no-store');
  response.set('X-Content-Type-Options', 'nosniff');

  const isProduction = process.env.NODE_ENV === 'production';
  const hookSecret = (
    process.env.OINKIE_BEFORE_USER_CREATED_HOOK_SECRET
    || process.env.BEFORE_USER_CREATED_HOOK_SECRET
  )?.trim();

  if (isProduction && !hookSecret) {
    response.status(500).json({
      error: {
        http_code: 500,
        message: 'Auth hook is not configured.',
      },
    });
    return;
  }

  const rawBody = request.rawBody;
  if (!rawBody) {
    response.status(400).json({
      error: {
        http_code: 400,
        message: 'Invalid auth hook request.',
      },
    });
    return;
  }

  let payload: unknown;
  try {
    if (hookSecret) {
      verifyStandardWebhook(rawBody, request.headers as Record<string, string | string[] | undefined>, hookSecret);
    }
    payload = rawBody.length > 0 ? JSON.parse(rawBody.toString('utf8')) : {};
  } catch {
    response.status(400).json({
      error: {
        http_code: 400,
        message: 'Invalid auth hook request.',
      },
    });
    return;
  }

  const user = (payload as { user?: { email?: unknown } } | null)?.user;
  const email = typeof user?.email === 'string' ? user.email : '';

  if (email && isDisposableEmail(email)) {
    response.status(400).json({
      error: {
        http_code: 400,
        message: 'Disposable email addresses are not allowed. Please use a permanent email address.',
      },
    });
    return;
  }

  response.status(200).json({});
}
