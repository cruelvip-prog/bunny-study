import { supabase } from '../lib/supabaseClient';

/**
 * Actions that can be used by dashboard content. Keep this list in sync with
 * the CHECK constraints in supabase/migrations/20261022120000_create_admin_dashboard_content.sql.
 */
export const DASHBOARD_CONTENT_ACTIONS = [
  'pyq-tests',
  'simulator',
  'import-paper',
  'mock-test',
  'custom-test',
  'question-bank',
  'performance',
  'revision',
  'quick-revision',
  'weak-topics',
  'syllabus',
  'streaks',
  'bookmarks',
  'notes',
  'flashcards',
  'study-plan',
  'history',
  'saved-papers',
  'settings',
  'search',
] as const;

export type DashboardContentAction = (typeof DASHBOARD_CONTENT_ACTIONS)[number];

export const DASHBOARD_CONTENT_ACTION_LABELS: Record<DashboardContentAction, string> = {
  'pyq-tests': 'NEET PYQ Tests',
  simulator: 'Start practising',
  'import-paper': 'Import Paper',
  'mock-test': 'Mock Test',
  'custom-test': 'Custom Test',
  'question-bank': 'Question Bank',
  performance: 'Performance',
  revision: 'Revision Center',
  'quick-revision': 'Quick Revision',
  'weak-topics': 'Weak Topics',
  syllabus: 'Syllabus Tracker',
  streaks: 'Streaks',
  bookmarks: 'Bookmarks',
  notes: 'Notes',
  flashcards: 'Flashcards',
  'study-plan': 'Study Plan',
  history: 'Test History',
  'saved-papers': 'Saved Papers',
  settings: 'Settings',
  search: 'Search',
};

export interface DashboardQuickAction {
  id: string;
  title: string;
  description: string;
  action_key: DashboardContentAction;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardQuickLink {
  id: string;
  title: string;
  note: string;
  target_type: 'action' | 'url';
  action_key: DashboardContentAction | null;
  url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NeetYoutubeResource {
  id: string;
  title: string;
  creator: string;
  url: string;
  thumbnail_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardContent {
  quickActions: DashboardQuickAction[];
  notifications: DashboardNotification[];
  quickLinks: DashboardQuickLink[];
  youtubeResources: NeetYoutubeResource[];
}

export type AdminContentTable =
  | 'dashboard_quick_actions'
  | 'dashboard_notifications'
  | 'dashboard_quick_links'
  | 'neet_youtube_resources';

export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isYoutubeUrl(value: string): boolean {
  if (!isSafeHttpUrl(value)) return false;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLocaleLowerCase();
    return host === 'youtube.com'
      || host === 'www.youtube.com'
      || host === 'm.youtube.com'
      || host === 'youtu.be';
  } catch {
    return false;
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Admin content cannot be loaded.');
  }
  return supabase;
}

function getErrorMessage(error: { message?: string } | null): string {
  return error?.message || 'The content request failed.';
}

async function readContentTable<T>(
  table: AdminContentTable,
  activeOnly: boolean,
): Promise<T[]> {
  const client = requireSupabase();
  let query = client
    .from(table)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load ${table}: ${getErrorMessage(error)}`);
  return (data || []) as T[];
}

export async function loadPublishedDashboardContent(): Promise<DashboardContent> {
  const [quickActions, notifications, quickLinks, youtubeResources] = await Promise.all([
    readContentTable<DashboardQuickAction>('dashboard_quick_actions', true),
    readContentTable<DashboardNotification>('dashboard_notifications', true),
    readContentTable<DashboardQuickLink>('dashboard_quick_links', true),
    readContentTable<NeetYoutubeResource>('neet_youtube_resources', true),
  ]);
  return { quickActions, notifications, quickLinks, youtubeResources };
}

export async function loadAdminDashboardContent(): Promise<DashboardContent> {
  const [quickActions, notifications, quickLinks, youtubeResources] = await Promise.all([
    readContentTable<DashboardQuickAction>('dashboard_quick_actions', false),
    readContentTable<DashboardNotification>('dashboard_notifications', false),
    readContentTable<DashboardQuickLink>('dashboard_quick_links', false),
    readContentTable<NeetYoutubeResource>('neet_youtube_resources', false),
  ]);
  return { quickActions, notifications, quickLinks, youtubeResources };
}

export async function saveAdminContentRow(
  table: AdminContentTable,
  values: Record<string, unknown> & { id?: string },
): Promise<void> {
  const client = requireSupabase();
  const { id, ...payload } = values;
  const result = id
    ? await client.from(table).update(payload).eq('id', id).select('id').single()
    : await client.from(table).insert(payload).select('id').single();
  if (result.error) throw new Error(getErrorMessage(result.error));
  if (!result.data) {
    throw new Error('The change was not saved. Your account may no longer have admin access.');
  }
}

export async function deleteAdminContentRow(
  table: AdminContentTable,
  id: string,
): Promise<void> {
  const client = requireSupabase();
  const result = await client.from(table).delete().eq('id', id).select('id');
  if (result.error) throw new Error(getErrorMessage(result.error));
  if (!result.data?.length) {
    throw new Error('The row was not deleted. It may already be gone or your admin access may have changed.');
  }
}
