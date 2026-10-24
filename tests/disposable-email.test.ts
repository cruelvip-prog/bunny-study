import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { isDisposableEmail, isDisposableEmailDomain, loadDisposableEmailDomains, normalizeEmailDomain } from '../server/disposableEmail';
import { verifyStandardWebhook } from '../server/webhookVerification';

test('normalizes email domains case-insensitively', () => {
  assert.equal(normalizeEmailDomain('User@Mailinator.COM '), 'mailinator.com');
  assert.equal(normalizeEmailDomain('not-an-email'), '');
});

test('blocks common disposable email domains', () => {
  assert.equal(isDisposableEmail('person@mailinator.com'), true);
  assert.equal(isDisposableEmail('person@10MINUTEMAIL.COM'), true);
  assert.equal(isDisposableEmail('person@guerrillamail.com'), true);
  assert.equal(isDisposableEmail('person@sub.mailinator.com'), true);
});

test('allows legitimate email domains', () => {
  assert.equal(isDisposableEmail('person@gmail.com'), false);
  assert.equal(isDisposableEmail('person@outlook.com'), false);
  assert.equal(isDisposableEmail('person@example.com'), false);
  assert.equal(isDisposableEmail('person@company.co.uk'), false);
});

test('bundled blocklist is loaded and large enough to be useful', () => {
  const result = loadDisposableEmailDomains();
  assert.equal(result.source, 'file');
  assert.ok(result.domains.size > 1000);
  assert.equal(isDisposableEmailDomain('mailinator.com', result.domains), true);
});

test('falls back safely when the blocklist file is missing', () => {
  const result = loadDisposableEmailDomains('/definitely/missing/disposable-email-domains.txt');
  assert.equal(result.source, 'fallback');
  assert.ok(result.domains.size > 0);
  assert.equal(isDisposableEmailDomain('mailinator.com', result.domains), true);
  assert.equal(isDisposableEmailDomain('gmail.com', result.domains), false);
});

test('verifies a valid Standard Webhooks signature', () => {
  const secret = 'v1,whsec_' + Buffer.from('test-secret').toString('base64');
  const body = Buffer.from(JSON.stringify({ user: { email: 'person@mailinator.com' } }));
  const webhookId = 'webhook-id';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signedContent = `${webhookId}.${timestamp}.${body.toString('utf8')}`;
  const key = Buffer.from(secret.replace('v1,whsec_', ''), 'base64');
  const signature = crypto.createHmac('sha256', key).update(signedContent).digest('base64');

  assert.doesNotThrow(() => verifyStandardWebhook(
    body,
    {
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`,
    },
    secret,
  ));
});

test('rejects an invalid Standard Webhooks signature', () => {
  const secret = 'v1,whsec_' + Buffer.from('test-secret').toString('base64');
  const body = Buffer.from(JSON.stringify({ user: { email: 'person@gmail.com' } }));
  const timestamp = String(Math.floor(Date.now() / 1000));

  assert.throws(() => verifyStandardWebhook(
    body,
    {
      'webhook-id': 'webhook-id',
      'webhook-timestamp': timestamp,
      'webhook-signature': 'v1,invalid-signature',
    },
    secret,
  ));
});
