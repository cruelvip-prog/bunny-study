import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Database,
  ExternalLink,
  LayoutGrid,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Youtube,
} from 'lucide-react';
import {
  DASHBOARD_CONTENT_ACTIONS,
  DASHBOARD_CONTENT_ACTION_LABELS,
  deleteAdminContentRow,
  isSafeHttpUrl,
  isYoutubeUrl,
  loadAdminDashboardContent,
  saveAdminContentRow,
  type DashboardContent,
  type DashboardContentAction,
  type DashboardNotification,
  type DashboardQuickAction,
  type DashboardQuickLink,
  type NeetYoutubeResource,
} from './dashboardContent';
import { QuestionBankManager } from './QuestionBankManager';

type AdminTab = 'quick-actions' | 'notifications' | 'quick-links' | 'youtube' | 'question-banks';

const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutGrid }> = [
  { id: 'quick-actions', label: 'Quick Actions', icon: LayoutGrid },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'quick-links', label: 'Quick Links', icon: Link2 },
  { id: 'youtube', label: 'YouTube Resources', icon: Youtube },
  { id: 'question-banks', label: 'Question Banks', icon: Database },
];

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100';
const textareaClass = `${inputClass} min-h-24 resize-y`;
const labelClass = 'block text-xs font-bold text-slate-600';
const checkboxClass = 'h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-200';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60';
const dangerButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The content request failed.';
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {active ? 'Visible' : 'Hidden'}
    </span>
  );
}

function PanelError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function SectionCard({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">{children}</section>;
}

function EditorHeader({
  title,
  editing,
  onCancel,
}: {
  title: string;
  editing: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-extrabold text-slate-900">{editing ? `Edit ${title}` : `Add ${title}`}</h2>
      {editing && (
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancel editing
        </button>
      )}
    </div>
  );
}

function SubmitRow({ isSaving, label }: { isSaving: boolean; label: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="submit" disabled={isSaving} className={primaryButtonClass}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {isSaving ? 'Saving...' : label}
      </button>
      <span className="text-[11px] text-slate-400">Ordered by sort number, then creation time.</span>
    </div>
  );
}

function EmptyAdminList({ text }: { text: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs leading-5 text-slate-500">
      {text}
    </div>
  );
}

function ActionOptions() {
  return (
    <>
      {DASHBOARD_CONTENT_ACTIONS.map((action) => (
        <option key={action} value={action}>
          {DASHBOARD_CONTENT_ACTION_LABELS[action]}
        </option>
      ))}
    </>
  );
}

function QuickActionsEditor({
  rows,
  onChanged,
}: {
  rows: DashboardQuickAction[];
  onChanged: (message: string) => Promise<void> | void;
}) {
  const nextOrder = rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 10;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [actionKey, setActionKey] = useState<DashboardContentAction>('pyq-tests');
  const [sortOrder, setSortOrder] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setActionKey('pyq-tests');
    setSortOrder(null);
    setIsActive(true);
    setError('');
  };

  const startEditing = (row: DashboardQuickAction) => {
    setEditingId(row.id);
    setTitle(row.title);
    setDescription(row.description);
    setActionKey(row.action_key);
    setSortOrder(String(row.sort_order));
    setIsActive(row.is_active);
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const order = Number.parseInt(sortOrder ?? String(nextOrder), 10);
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    if (!Number.isFinite(order) || order < 0) {
      setError('Sort order must be a whole number of zero or more.');
      return;
    }
    setIsSaving(true);
    try {
      await saveAdminContentRow('dashboard_quick_actions', {
        ...(editingId ? { id: editingId } : {}),
        title: title.trim(),
        description: description.trim(),
        action_key: actionKey,
        sort_order: order,
        is_active: isActive,
      });
      const wasEditing = Boolean(editingId);
      reset();
      await onChanged(wasEditing ? 'Quick action updated.' : 'Quick action added.');
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: DashboardQuickAction) => {
    if (!window.confirm(`Delete the quick action "${row.title}"?`)) return;
    setError('');
    setIsSaving(true);
    try {
      await deleteAdminContentRow('dashboard_quick_actions', row.id);
      if (editingId === row.id) reset();
      await onChanged('Quick action deleted.');
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard>
        <EditorHeader title="quick action" editing={Boolean(editingId)} onCancel={reset} />
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className={inputClass} placeholder="NEET PYQ Tests" />
          </label>
          <label className={labelClass}>
            Action
            <select value={actionKey} onChange={(event) => setActionKey(event.target.value as DashboardContentAction)} className={inputClass}>
              <ActionOptions />
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} className={textareaClass} placeholder="What will this quick action help students do?" />
          </label>
          <label className={labelClass}>
            Sort order
            <input type="number" min="0" step="1" value={sortOrder ?? String(nextOrder)} onChange={(event) => setSortOrder(event.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className={checkboxClass} />
            Visible to students
          </label>
          <div className="sm:col-span-2">
            <PanelError message={error} />
            <SubmitRow isSaving={isSaving} label={editingId ? 'Save quick action' : 'Add quick action'} />
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Dashboard quick actions</h2>
            <p className="mt-1 text-xs text-slate-500">These cards appear near the top of the student dashboard.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{rows.length} total</span>
        </div>
        <div className="mt-4 space-y-2">
          {rows.length ? rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-800">{row.title}</p>
                  <StatusBadge active={row.is_active} />
                  <span className="text-[10px] font-semibold text-slate-400">#{row.sort_order}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{row.description || 'No description'}</p>
                <p className="mt-1 text-[10px] font-semibold text-blue-700">{DASHBOARD_CONTENT_ACTION_LABELS[row.action_key]}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => startEditing(row)} disabled={isSaving} className={secondaryButtonClass}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button type="button" onClick={() => void handleDelete(row)} disabled={isSaving} className={dangerButtonClass}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          )) : <EmptyAdminList text="No quick actions yet. Add one above or re-run the seed data in the migration." />}
        </div>
      </SectionCard>
    </div>
  );
}

function NotificationsEditor({
  rows,
  onChanged,
}: {
  rows: DashboardNotification[];
  onChanged: (message: string) => Promise<void> | void;
}) {
  const nextOrder = rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 10;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sortOrder, setSortOrder] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setEditingId(null);
    setTitle('');
    setMessage('');
    setSortOrder(null);
    setIsActive(true);
    setError('');
  };

  const startEditing = (row: DashboardNotification) => {
    setEditingId(row.id);
    setTitle(row.title);
    setMessage(row.message);
    setSortOrder(String(row.sort_order));
    setIsActive(row.is_active);
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const order = Number.parseInt(sortOrder ?? String(nextOrder), 10);
    if (!title.trim() || !message.trim()) {
      setError('A title and message are required.');
      return;
    }
    if (!Number.isFinite(order) || order < 0) {
      setError('Sort order must be a whole number of zero or more.');
      return;
    }
    setIsSaving(true);
    try {
      await saveAdminContentRow('dashboard_notifications', {
        ...(editingId ? { id: editingId } : {}),
        title: title.trim(),
        message: message.trim(),
        sort_order: order,
        is_active: isActive,
      });
      const wasEditing = Boolean(editingId);
      reset();
      await onChanged(wasEditing ? 'Notification updated.' : 'Notification added.');
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: DashboardNotification) => {
    if (!window.confirm(`Delete the notification "${row.title}"?`)) return;
    setError('');
    setIsSaving(true);
    try {
      await deleteAdminContentRow('dashboard_notifications', row.id);
      if (editingId === row.id) reset();
      await onChanged('Notification deleted.');
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard>
        <EditorHeader title="notification" editing={Boolean(editingId)} onCancel={reset} />
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className={inputClass} placeholder="New practice papers available" />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Message
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} className={textareaClass} placeholder="Share a short update with students." />
          </label>
          <label className={labelClass}>
            Sort order
            <input type="number" min="0" step="1" value={sortOrder ?? String(nextOrder)} onChange={(event) => setSortOrder(event.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className={checkboxClass} />
            Visible to students
          </label>
          <div className="sm:col-span-2">
            <PanelError message={error} />
            <SubmitRow isSaving={isSaving} label={editingId ? 'Save notification' : 'Add notification'} />
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Dashboard notifications</h2>
            <p className="mt-1 text-xs text-slate-500">Published notifications appear in the student dashboard resource area.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{rows.length} total</span>
        </div>
        <div className="mt-4 space-y-2">
          {rows.length ? rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-800">{row.title}</p>
                  <StatusBadge active={row.is_active} />
                  <span className="text-[10px] font-semibold text-slate-400">#{row.sort_order}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-500">{row.message}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => startEditing(row)} disabled={isSaving} className={secondaryButtonClass}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button type="button" onClick={() => void handleDelete(row)} disabled={isSaving} className={dangerButtonClass}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          )) : <EmptyAdminList text="No notifications yet. Add one above to publish an update." />}
        </div>
      </SectionCard>
    </div>
  );
}

function QuickLinksEditor({
  rows,
  onChanged,
}: {
  rows: DashboardQuickLink[];
  onChanged: (message: string) => Promise<void> | void;
}) {
  const nextOrder = rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 10;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [targetType, setTargetType] = useState<'action' | 'url'>('action');
  const [actionKey, setActionKey] = useState<DashboardContentAction>('history');
  const [url, setUrl] = useState('');
  const [sortOrder, setSortOrder] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setEditingId(null);
    setTitle('');
    setNote('');
    setTargetType('action');
    setActionKey('history');
    setUrl('');
    setSortOrder(null);
    setIsActive(true);
    setError('');
  };

  const startEditing = (row: DashboardQuickLink) => {
    setEditingId(row.id);
    setTitle(row.title);
    setNote(row.note);
    setTargetType(row.target_type);
    setActionKey(row.action_key || 'history');
    setUrl(row.url || '');
    setSortOrder(String(row.sort_order));
    setIsActive(row.is_active);
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const order = Number.parseInt(sortOrder ?? String(nextOrder), 10);
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    if (!Number.isFinite(order) || order < 0) {
      setError('Sort order must be a whole number of zero or more.');
      return;
    }
    if (targetType === 'url' && !isSafeHttpUrl(url)) {
      setError('Enter a valid http:// or https:// link.');
      return;
    }
    setIsSaving(true);
    try {
      await saveAdminContentRow('dashboard_quick_links', {
        ...(editingId ? { id: editingId } : {}),
        title: title.trim(),
        note: note.trim(),
        target_type: targetType,
        action_key: targetType === 'action' ? actionKey : null,
        url: targetType === 'url' ? url.trim() : null,
        sort_order: order,
        is_active: isActive,
      });
      const wasEditing = Boolean(editingId);
      reset();
      await onChanged(wasEditing ? 'Quick link updated.' : 'Quick link added.');
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: DashboardQuickLink) => {
    if (!window.confirm(`Delete the quick link "${row.title}"?`)) return;
    setError('');
    setIsSaving(true);
    try {
      await deleteAdminContentRow('dashboard_quick_links', row.id);
      if (editingId === row.id) reset();
      await onChanged('Quick link deleted.');
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard>
        <EditorHeader title="quick link" editing={Boolean(editingId)} onCancel={reset} />
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className={inputClass} placeholder="Test History" />
          </label>
          <label className={labelClass}>
            Destination type
            <select value={targetType} onChange={(event) => setTargetType(event.target.value as 'action' | 'url')} className={inputClass}>
              <option value="action">Existing app action</option>
              <option value="url">External URL</option>
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} className={textareaClass} placeholder="A short description of this link." />
          </label>
          {targetType === 'action' ? (
            <label className={labelClass}>
              App action
              <select value={actionKey} onChange={(event) => setActionKey(event.target.value as DashboardContentAction)} className={inputClass}>
                <ActionOptions />
              </select>
            </label>
          ) : (
            <label className={labelClass}>
              External URL
              <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} className={inputClass} placeholder="https://..." />
            </label>
          )}
          <label className={labelClass}>
            Sort order
            <input type="number" min="0" step="1" value={sortOrder ?? String(nextOrder)} onChange={(event) => setSortOrder(event.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className={checkboxClass} />
            Visible to students
          </label>
          <div className="sm:col-span-2">
            <PanelError message={error} />
            <SubmitRow isSaving={isSaving} label={editingId ? 'Save quick link' : 'Add quick link'} />
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Dashboard quick links</h2>
            <p className="mt-1 text-xs text-slate-500">These links appear in the Quick Access card on the dashboard.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{rows.length} total</span>
        </div>
        <div className="mt-4 space-y-2">
          {rows.length ? rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-800">{row.title}</p>
                  <StatusBadge active={row.is_active} />
                  <span className="text-[10px] font-semibold text-slate-400">#{row.sort_order}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{row.note || 'No note'}</p>
                <p className="mt-1 break-all text-[10px] font-semibold text-blue-700">
                  {row.target_type === 'action'
                    ? DASHBOARD_CONTENT_ACTION_LABELS[row.action_key || 'history']
                    : row.url}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => startEditing(row)} disabled={isSaving} className={secondaryButtonClass}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button type="button" onClick={() => void handleDelete(row)} disabled={isSaving} className={dangerButtonClass}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          )) : <EmptyAdminList text="No quick links yet. Add one above to give students another route into the app." />}
        </div>
      </SectionCard>
    </div>
  );
}

function YoutubeEditor({
  rows,
  onChanged,
}: {
  rows: NeetYoutubeResource[];
  onChanged: (message: string) => Promise<void> | void;
}) {
  const nextOrder = rows.length ? Math.max(...rows.map((row) => row.sort_order)) + 10 : 10;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [creator, setCreator] = useState('');
  const [url, setUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [sortOrder, setSortOrder] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setEditingId(null);
    setTitle('');
    setCreator('');
    setUrl('');
    setThumbnailUrl('');
    setSortOrder(null);
    setIsActive(true);
    setError('');
  };

  const startEditing = (row: NeetYoutubeResource) => {
    setEditingId(row.id);
    setTitle(row.title);
    setCreator(row.creator);
    setUrl(row.url);
    setThumbnailUrl(row.thumbnail_url || '');
    setSortOrder(String(row.sort_order));
    setIsActive(row.is_active);
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const order = Number.parseInt(sortOrder ?? String(nextOrder), 10);
    if (!title.trim() || !creator.trim()) {
      setError('A title and creator are required.');
      return;
    }
    if (!isYoutubeUrl(url)) {
      setError('Enter a valid https://youtube.com or https://youtu.be link.');
      return;
    }
    if (thumbnailUrl.trim() && !isSafeHttpUrl(thumbnailUrl)) {
      setError('A thumbnail must be a valid http:// or https:// image URL.');
      return;
    }
    if (!Number.isFinite(order) || order < 0) {
      setError('Sort order must be a whole number of zero or more.');
      return;
    }
    setIsSaving(true);
    try {
      await saveAdminContentRow('neet_youtube_resources', {
        ...(editingId ? { id: editingId } : {}),
        title: title.trim(),
        creator: creator.trim(),
        url: url.trim(),
        thumbnail_url: thumbnailUrl.trim() || null,
        sort_order: order,
        is_active: isActive,
      });
      const wasEditing = Boolean(editingId);
      reset();
      await onChanged(wasEditing ? 'YouTube resource updated.' : 'YouTube resource added.');
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: NeetYoutubeResource) => {
    if (!window.confirm(`Delete the YouTube resource "${row.title}"?`)) return;
    setError('');
    setIsSaving(true);
    try {
      await deleteAdminContentRow('neet_youtube_resources', row.id);
      if (editingId === row.id) reset();
      await onChanged('YouTube resource deleted.');
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard>
        <EditorHeader title="YouTube resource" editing={Boolean(editingId)} onCancel={reset} />
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} className={inputClass} placeholder="Cell structure and function" />
          </label>
          <label className={labelClass}>
            Creator
            <input value={creator} onChange={(event) => setCreator(event.target.value)} maxLength={100} className={inputClass} placeholder="Creator or channel name" />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            YouTube URL
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} className={inputClass} placeholder="https://www.youtube.com/watch?v=..." />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Thumbnail URL (optional)
            <input type="url" value={thumbnailUrl} onChange={(event) => setThumbnailUrl(event.target.value)} className={inputClass} placeholder="https://..." />
          </label>
          <label className={labelClass}>
            Sort order
            <input type="number" min="0" step="1" value={sortOrder ?? String(nextOrder)} onChange={(event) => setSortOrder(event.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className={checkboxClass} />
            Visible to students
          </label>
          <div className="sm:col-span-2">
            <PanelError message={error} />
            <SubmitRow isSaving={isSaving} label={editingId ? 'Save YouTube resource' : 'Add YouTube resource'} />
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">NEET YouTube resources</h2>
            <p className="mt-1 text-xs text-slate-500">Curated videos appear in the student dashboard Study Resources area.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{rows.length} total</span>
        </div>
        <div className="mt-4 space-y-2">
          {rows.length ? rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-start">
              {row.thumbnail_url && (
                <img src={row.thumbnail_url} alt="" className="h-16 w-24 shrink-0 rounded-lg border border-slate-200 object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-800">{row.title}</p>
                  <StatusBadge active={row.is_active} />
                  <span className="text-[10px] font-semibold text-slate-400">#{row.sort_order}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{row.creator}</p>
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-[10px] font-semibold text-blue-700 hover:text-blue-900">
                  {row.url} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => startEditing(row)} disabled={isSaving} className={secondaryButtonClass}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button type="button" onClick={() => void handleDelete(row)} disabled={isSaving} className={dangerButtonClass}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          )) : <EmptyAdminList text="No YouTube resources yet. Add a verified educational video above." />}
        </div>
      </SectionCard>
    </div>
  );
}

export function AdminPanel({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('quick-actions');
  const [content, setContent] = useState<DashboardContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      setContent(await loadAdminDashboardContent());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 5000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const handleContentChanged = useCallback(async (message: string) => {
    await refresh();
    setSuccess(message);
  }, [refresh]);

  const activeEditor = content ? (
    activeTab === 'quick-actions' ? <QuickActionsEditor rows={content.quickActions} onChanged={handleContentChanged} />
      : activeTab === 'notifications' ? <NotificationsEditor rows={content.notifications} onChanged={handleContentChanged} />
        : activeTab === 'quick-links' ? <QuickLinksEditor rows={content.quickLinks} onChanged={handleContentChanged} />
          : activeTab === 'youtube' ? <YoutubeEditor rows={content.youtubeResources} onChanged={handleContentChanged} />
            : null
  ) : null;

  return (
    <main className="min-h-screen w-full bg-slate-100 font-sans text-slate-900">
      <div className="mx-auto w-full max-w-[1100px] px-3 py-4 sm:px-6 sm:py-8">
        <header className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Account protected</p>
                <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Admin Controls</h1>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                  Manage dashboard content and every configured question bank. Dashboard content stays
                  protected by Supabase RLS; cross-project question writes use the trusted server API.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void refresh()} disabled={isLoading} className={secondaryButtonClass}>
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </button>
              <button type="button" onClick={onBack} className={secondaryButtonClass}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
              </button>
            </div>
          </div>
        </header>

        <nav aria-label="Admin content sections" className="mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSuccess('');
                }}
                aria-current={selected ? 'page' : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                  selected ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" /> {tab.label}
              </button>
            );
          })}
        </nav>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Could not load admin content.</p>
              <p className="mt-1 break-words">{error}</p>
              <p className="mt-1 text-xs">Check that the admin migration has been applied and that your account is on the admin allowlist.</p>
            </div>
          </div>
        )}

        {success && (
          <div role="status" aria-live="polite" className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="font-bold">{success}</p>
          </div>
        )}

        <div className="mt-4">
          {activeTab === 'question-banks' ? (
            <QuestionBankManager />
          ) : isLoading && !content ? (
            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading admin content...
            </div>
          ) : activeEditor}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Dashboard content is checked by Postgres RLS. Question-bank writes require a fresh main-project admin check on every API request. Hiding a button is never the security boundary.</p>
        </div>
      </div>
    </main>
  );
}
