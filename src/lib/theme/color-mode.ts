/** Alpine day (light) / Alpine dusk (dark). Client-safe, no imports. */

export type ColorMode = 'light' | 'dark'

/** `{ mode, sys }` — the user's pick and the OS scheme at the moment they picked it. */
export const COLOR_MODE_STORAGE_KEY = 'unsolo:color-mode'
export const COLOR_MODE_CHANGED_EVENT = 'unsolo:color-mode-changed'

export type StoredColorMode = { mode: ColorMode; sys: ColorMode }

export function parseStoredColorMode(raw: string | null | undefined): StoredColorMode | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<StoredColorMode>
    const ok = (x: unknown): x is ColorMode => x === 'light' || x === 'dark'
    return ok(v.mode) && ok(v.sys) ? { mode: v.mode, sys: v.sys } : null
  } catch {
    return null
  }
}

/**
 * The user's pick wins only while the OS scheme is unchanged since they picked it.
 * Once the OS flips (e.g. phone enters dark mode), the OS scheme wins until the user toggles again.
 */
export function resolveColorMode(stored: StoredColorMode | null, system: ColorMode): ColorMode {
  if (stored && stored.sys === system) return stored.mode
  return system
}

/** Runs before paint (inline in <head>) — keep in sync with `resolveColorMode`. */
export const COLOR_MODE_BOOT_SCRIPT = `(function(){try{
var K=${JSON.stringify(COLOR_MODE_STORAGE_KEY)},E=${JSON.stringify(COLOR_MODE_CHANGED_EVENT)};
var d=document.documentElement,mq=window.matchMedia('(prefers-color-scheme: dark)');
function sys(){return mq.matches?'dark':'light'}
function read(){try{var v=JSON.parse(localStorage.getItem(K)||'null');return v&&(v.mode==='light'||v.mode==='dark')&&(v.sys==='light'||v.sys==='dark')?v:null}catch(e){return null}}
function apply(m){d.classList.toggle('dark',m==='dark');d.style.colorScheme=m;d.setAttribute('data-color-mode',m)}
var s=read(),cur=sys();
if(s&&s.sys!==cur){try{localStorage.removeItem(K)}catch(e){}s=null}
apply(s?s.mode:cur);
mq.addEventListener('change',function(){try{localStorage.removeItem(K)}catch(e){}apply(sys());window.dispatchEvent(new Event(E))});
}catch(e){}})();`
