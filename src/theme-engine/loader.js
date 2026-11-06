// Service-worker side of the theme engine. Reads the packaged themes/ folder
// (themes/index.json lists the folder names, because extensions cannot list
// directories) and returns each pack with its asset: files inlined as data URLs.
// Nothing is written to storage; the result lives only in this worker's memory.
const GCCX_THEME_TYPES = ['default', 'custom', 'holiday'];
let gccxThemeLoad = null;

async function gccxReadPack(folder) {
  const base = chrome.runtime.getURL(`themes/${folder}/`);
  const res = await fetch(base + 'theme.json');
  if (!res.ok) throw new Error('missing theme.json');
  const pack = await res.json();
  if (!pack || pack.schemaVersion !== 1 || pack.id !== folder) throw new Error('id must match its folder name');
  if (!GCCX_THEME_TYPES.includes(pack.type)) throw new Error('type must be default, custom or holiday');
  if (pack.type === 'holiday' && !pack.holiday) throw new Error('holiday themes need holiday dates');
  if (pack.type !== 'holiday') delete pack.holiday;
  for (const mode of ['light', 'dark']) {
    for (const [key, value] of Object.entries(pack[mode] || {})) {
      if (typeof value !== 'string' || !value.startsWith('asset:')) continue;
      const name = value.slice(6);
      if (!/^[a-z0-9-]+\.(svg|gif)$/.test(name)) throw new Error('bad asset name ' + name);
      const file = await fetch(base + name);
      if (!file.ok) throw new Error('missing asset ' + name);
      if (name.endsWith('.gif')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        pack[mode][key] = `url("data:image/gif;base64,${btoa(bin)}")`;
      } else {
        pack[mode][key] = `url("data:image/svg+xml,${encodeURIComponent(await file.text())}")`;
      }
    }
  }
  return pack;
}

function gccxLoadThemes() {
  if (!gccxThemeLoad) gccxThemeLoad = (async () => {
    let folders = [];
    try {
      const index = await (await fetch(chrome.runtime.getURL('themes/index.json'))).json();
      folders = Array.isArray(index.themes) ? index.themes : [];
    } catch (e) {
      console.warn('[themes] themes/index.json unreadable; using the built-in GCC theme', e);
    }
    const packs = [], errors = [];
    for (const folder of folders) {
      try { packs.push(await gccxReadPack(String(folder))); }
      catch (e) { errors.push(`${folder}: ${e.message}`); }
    }
    if (errors.length) console.warn('[themes] skipped packs', errors);
    return { packs, errors };
  })();
  return gccxThemeLoad;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.type !== 'gccx-themes') return;
  gccxLoadThemes().then(reply, (e) => reply({ packs: [], errors: [String(e)] }));
  return true;
});
