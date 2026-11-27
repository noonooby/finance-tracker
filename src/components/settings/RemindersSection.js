import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { canRemind, isOn, turnOn, turnOff, sendTest } from '../../utils/reminders';
import { showToast } from '../../utils/toast';
import SettingsSection from './SettingsSection';

// Reminders on this device for payments you make yourself (cards and loans without autopay, and tracked bills):
// two days before and on the day, between 8:00 and 21:00. Each device is turned on separately.
export default function RemindersSection({ expanded, onToggle }) {
  const support = canRemind();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { isOn().then(setOn).catch(() => setOn(false)); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) { await turnOff(); setOn(false); showToast.success('Reminders are off on this device.'); }
      else { await turnOn(); setOn(true); showToast.success('Reminders are on for this device.'); }
    } catch (e) { showToast.error(e.message || 'Could not change reminders.'); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    try { await sendTest(); showToast.success('Sent. It should appear in a few seconds.'); } catch (e) { showToast.error(e.message); }
    setBusy(false);
  };

  return (
    <SettingsSection title="Reminders" icon={Bell} expanded={expanded} onToggle={onToggle}>
      <p className="text-sm text-muted">
        A notification two days before and on the day a payment is due, for cards and loans you pay yourself (not autopay) and bills you track.
        Sent between 8:00 and 21:00, once each.
      </p>
      {support === 'install_first' && (
        <p className="text-sm rounded-xl bg-accent-soft text-accent p-3">
          On iPhone and iPad, reminders work only in the app added to the Home Screen: tap Share, then Add to Home Screen, open the app from there and turn reminders on.
        </p>
      )}
      {support === 'unsupported' && <p className="text-sm text-muted">This browser cannot show reminders. Try Chrome, Edge, Firefox or Safari.</p>}
      {support === 'ok' && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggle} disabled={busy} className={`press ${on ? 'btn-secondary' : 'btn-primary'}`}>
            {on ? 'Turn off on this device' : 'Turn on for this device'}
          </button>
          {on && <button type="button" onClick={test} disabled={busy} className="press btn-secondary">Send a test</button>}
          <span className="text-xs text-muted">{on ? 'On for this device.' : 'Off for this device.'}</span>
        </div>
      )}
    </SettingsSection>
  );
}
