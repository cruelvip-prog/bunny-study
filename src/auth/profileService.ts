import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { validateProfileInput, type ProfileInput, type StudentClass } from './profileValidation';

export interface Profile {
  id: string;
  full_name: string;
  student_class: StudentClass;
  target_neet_year: number;
  coaching_institute: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfileLookup =
  | { profile: Profile | null; error: null }
  | { profile: null; error: string };

export async function loadProfile(userId: string): Promise<ProfileLookup> {
  if (!supabase) {
    return { profile: null, error: 'Supabase is not configured.' };
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, student_class, target_neet_year, coaching_institute, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { profile: null, error: `Could not load your profile: ${error.message}` };
  }
  return { profile: data as Profile | null, error: null };
}

export async function createProfile(
  user: User,
  input: ProfileInput,
): Promise<ProfileLookup> {
  if (!supabase) {
    return { profile: null, error: 'Supabase is not configured.' };
  }
  const validation = validateProfileInput(input);
  if (!validation.value) {
    return { profile: null, error: validation.error };
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert(validation.value)
    .select('id, full_name, student_class, target_neet_year, coaching_institute, created_at, updated_at')
    .single();

  if (!error) {
    return { profile: data as Profile, error: null };
  }

  if (error.code === '23505') {
    const existing = await loadProfile(user.id);
    if (!existing.error && existing.profile) return existing;
    if (existing.error) {
      return {
        profile: null,
        error: `The profile may already have been created, but it could not be verified. ${existing.error}`,
      };
    }
  }
  return { profile: null, error: `Could not save your profile: ${error.message}` };
}
