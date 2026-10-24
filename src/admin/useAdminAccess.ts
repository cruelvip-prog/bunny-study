import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface AdminAccessState {
  isAdmin: boolean;
  isChecking: boolean;
}

/**
 * Asks Postgres whether the signed-in user is on the admin allowlist.
 * The UI is only a convenience: every content operation is still protected by
 * the RLS policies in the admin migration. Any failure fails closed.
 */
export function useAdminAccess(userId: string | null): AdminAccessState {
  const [state, setState] = useState<AdminAccessState>({
    isAdmin: false,
    isChecking: Boolean(userId),
  });

  useEffect(() => {
    let active = true;
    const client = supabase;
    if (!userId || !client) {
      setState({ isAdmin: false, isChecking: false });
      return () => {
        active = false;
      };
    }

    setState({ isAdmin: false, isChecking: true });
    void (async () => {
      try {
        const { data, error } = await client.rpc('is_admin');
        if (!active) return;
        setState({
          isAdmin: !error && data === true,
          isChecking: false,
        });
      } catch {
        if (!active) return;
        setState({ isAdmin: false, isChecking: false });
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  return state;
}
