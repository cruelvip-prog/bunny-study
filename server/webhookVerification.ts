import crypto from 'node:crypto';

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyStandardWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
): void {
  const webhookId = headerValue(headers, 'webhook-id');
  const webhookTimestamp = headerValue(headers, 'webhook-timestamp');
  const webhookSignature = headerValue(headers, 'webhook-signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new Error('Missing Standard Webhooks headers.');
  }

  const timestampSeconds = Number(webhookTimestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    throw new Error('Invalid webhook timestamp.');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 5 * 60) {
    throw new Error('Stale webhook timestamp.');
  }

  const secrets = secret
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^v1,whsec_/, '').replace(/^whsec_/, ''));

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody.toString('utf8')}`;
  const providedSignatures = [...webhookSignature.matchAll(/v1,([A-Za-z0-9+/=]+)/g)]
    .map((match) => match[1]);

  if (providedSignatures.length === 0) {
    throw new Error('Missing webhook signature.');
  }

  for (const base64Secret of secrets) {
    let key: Buffer;
    try {
      key = Buffer.from(base64Secret, 'base64');
    } catch {
      continue;
    }
    if (key.length === 0) continue;
    const expectedSignature = crypto
      .createHmac('sha256', key)
      .update(signedContent)
      .digest('base64');
    if (providedSignatures.some((signature) => timingSafeEqual(signature, expectedSignature))) {
      return;
    }
  }

  throw new Error('Invalid webhook signature.');
}
