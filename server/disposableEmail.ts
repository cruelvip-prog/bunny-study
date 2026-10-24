import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { APPLICATION_ROOT } from './environment';

function resolveDisposableEmailBlocklistPath(): string {
  const candidates = [
    path.join(APPLICATION_ROOT, 'server', 'data', 'disposable-email-domains.txt'),
    path.join(APPLICATION_ROOT, 'dist-server', 'data', 'disposable-email-domains.txt'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

export const DISPOSABLE_EMAIL_BLOCKLIST_PATH = resolveDisposableEmailBlocklistPath();

const FALLBACK_DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com',
  '10minutemail.com',
  'guerrillamail.com',
  'tempmail.com',
  'trashmail.com',
  'yopmail.com',
];

export interface DisposableEmailBlocklistResult {
  domains: ReadonlySet<string>;
  source: 'file' | 'fallback';
  error?: string;
}

export function loadDisposableEmailDomains(
  filePath: string = DISPOSABLE_EMAIL_BLOCKLIST_PATH,
): DisposableEmailBlocklistResult {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('disposable email blocklist file is missing');
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const domains = new Set<string>();
    for (const rawLine of content.split(/\r?\n/)) {
      const domain = rawLine.trim().toLowerCase().replace(/^@/, '');
      if (!domain || domain.startsWith('#')) continue;
      if (domain.includes(' ') || domain.includes('@') || !domain.includes('.')) continue;
      domains.add(domain);
    }
    if (domains.size === 0) {
      throw new Error('disposable email blocklist file contained no valid domains');
    }
    return { domains, source: 'file' };
  } catch (error) {
    return {
      domains: new Set(FALLBACK_DISPOSABLE_EMAIL_DOMAINS),
      source: 'fallback',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const loadedBlocklist = loadDisposableEmailDomains();

export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = loadedBlocklist.domains;
export const DISPOSABLE_EMAIL_BLOCKLIST_SOURCE: 'file' | 'fallback' = loadedBlocklist.source;
export const DISPOSABLE_EMAIL_BLOCKLIST_ERROR: string | undefined = loadedBlocklist.error;

export function normalizeEmailDomain(email: unknown): string {
  if (typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex < 0) return '';
  return trimmed.slice(atIndex + 1).replace(/\.$/, '');
}

export function isDisposableEmailDomain(
  domain: unknown,
  blockedDomains: ReadonlySet<string> = DISPOSABLE_EMAIL_DOMAINS,
): boolean {
  if (typeof domain !== 'string') return false;
  const normalized = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) return false;
  if (blockedDomains.has(normalized)) return true;

  const labels = normalized.split('.');
  if (labels.length >= 2) {
    const parentDomain = labels.slice(-2).join('.');
    if (blockedDomains.has(parentDomain)) return true;
  }
  return false;
}

export function isDisposableEmail(
  email: unknown,
  blockedDomains: ReadonlySet<string> = DISPOSABLE_EMAIL_DOMAINS,
): boolean {
  return isDisposableEmailDomain(normalizeEmailDomain(email), blockedDomains);
}
