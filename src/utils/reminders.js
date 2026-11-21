// Reminders on this device: asks the browser for permission, subscribes it, and tells the server.
// The server decides what to remind and when (server/push.js); this file only connects the device.
import { api } from './server';

export const isIOS = () => !/Android/.test(navigator.userAgent) && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const installed = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// -> 'ok' | 'install_first' (iPhone and iPad: only an app added to the Home Screen can get reminders) | 'unsupported'
export function canRemind() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS() && !installed() ? 'install_first' : 'unsupported';
  if (isIOS() && !installed()) return 'install_first';
  return 'ok';
}

export function registerWorker() {
  if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const toBytes = (b64u) => {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const device = () => {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return `${os}${br ? ` ${br}` : ''}`;
};

export async function isOn() {
  if (canRemind() !== 'ok') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(reg && (await reg.pushManager.getSubscription()) && Notification.permission === 'granted');
}

export async function turnOn() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser or phone settings, then try again.' : 'Notifications were not allowed.');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const { key } = await api('/api/push/key', null, 'GET');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
  await api('/api/push/subscribe', { subscription: sub.toJSON(), device: device() });
}

export async function turnOff() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  await api('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export const sendTest = () => api('/api/push/test', {});
