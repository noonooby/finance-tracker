// Preferences (theme, alerts, budgets and the other options in Settings) are one settings row with key 'prefs'.
// Other settings rows are single key/value switches (for example learn_categories); they never hold preferences.
import { server } from './server';

export async function loadPrefs() {
  const { data, error } = await server.from('settings').select('*').eq('key', 'prefs').maybeSingle();
  if (error) throw new Error(error.message);
  return data || {};
}

// Saves only the fields given; the rest of the row stays as it was.
export async function savePrefs(patch) {
  const { error } = await server.from('settings').upsert({ ...patch, key: 'prefs', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
