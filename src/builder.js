// aBetterMyGCC schedule builder. Lives on the Add/Drop Courses portlet.
// - "Save" on any search result or course details screen puts the section in a plan.
// - The plan shows on a week calendar next to what you're already registered for.
// - "Add all" looks up each section's reference number and submits them through
//   the "Add by Reference #" form, six at a time, exactly as you would by hand.
// It never touches the Drop checkboxes.
(function () {
  'use strict';
  const X = window.GCCX;
  if (!X) return;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const byEnd = (suffix, el = document) => el.querySelector(`[id$="${suffix}"]`);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: (k) => new Promise((r) => chrome.storage.local.get(k, (o) => r(o[k]))),
    set: (k, v) => new Promise((r) => chrome.storage.local.set({ [k]: v }, r)),
  };
  const MAIN_URL = '/ICS/Academics/Home.jnz?portlet=AddDrop_Courses';

  function portlet() { return $('.pt_CourseSchedules'); }
  function screen() {
    const p = portlet();
    if (!p) return null;
    if (byEnd('lblReferenceNumberValue', p)) return 'details';
    if (byEnd('dgCourses', p)) return 'results';
    if (byEnd('tbRefNum1', p)) return 'main';
    return 'other';
  }
  function userKey() { const u = X.parseUser(document); return u ? u.name : null; }

  // ---------------- plan storage (per signed-in person) ----------------
  async function getPlan() {
    const all = (await store.get('plans')) || {};
    return all[userKey()] || [];
  }
  async function setPlan(items) {
    const all = (await store.get('plans')) || {};
    all[userKey()] = items;
    await store.set('plans', all);
  }

  // ---------------- parsing ----------------
  function parseMeetings(str) {
    const out = [];
    const re = /\b([MTWRFSU]{1,7})\s+(\d{1,2}:\d{2}\s*[AP]?M?\s*-\s*\d{1,2}:\d{2}\s*[AP]?M?)/gi;
    let m;
    while ((m = re.exec(str || ''))) {
      const days = X.parseDays(m[1]);
      const r = X.parseRange(m[2]);
      if (days && r) out.push({ days, start: r.start, end: r.end });
    }
    return out;
  }
  function currentSearchTerm() {
    const sel = byEnd('ddlTermSearch') || byEnd('ddlTerm');
    if (!sel) return null;
    const o = sel.options[sel.selectedIndex];
    return o ? { value: o.value, label: window.GCCX_termLabel ? window.GCCX_termLabel(o) : X.clean(o.textContent) } : null;
  }
  function resultRows(root = document) {
    const t = byEnd('dgCourses', root);
    if (!t) return [];
    const head = [...t.rows[0].cells].map((c) => X.clean(c.textContent).toLowerCase());
    const col = (n) => head.findIndex((h) => h.startsWith(n));
    const iCode = col('course code'), iName = col('name'), iFac = col('faculty'), iSeats = col('seats'), iStatus = col('status'), iSched = col('schedule'), iCred = col('credits'), iAdd = col('add');
    return $$('tr', t).filter((r) => r.querySelector('a[id$="lnkCourse"]')).map((r) => ({
      row: r,
      addCell: r.cells[iAdd],
      code: X.clean(r.querySelector('a[id$="lnkCourse"]')?.textContent),
      title: X.titleCase(X.clean(r.cells[iName]?.textContent)),
      faculty: X.clean(r.cells[iFac]?.textContent),
      seats: X.clean(r.cells[iSeats]?.textContent),
      status: X.clean(r.cells[iStatus]?.textContent),
      schedule: X.clean(r.cells[iSched]?.textContent),
      credits: parseFloat(X.clean(r.cells[iCred]?.textContent)) || 0,
      link: r.querySelector('a[id$="lnkCourse"]'),
    }));
  }
  function detailsInfo() {
    const p = portlet();
    const text = p.innerText;
    // codes have 3 parts ("COMP 220 A") or 4 for lab sections ("BIOL 102 L L")
    const head = /\(([A-Z]{2,5}\s+\d{3}[A-Z]?\s+[A-Z0-9]{1,3}(?:\s+[A-Z0-9]{1,3})?)\)/.exec(text);
    const titleLine = text.split('\n').map(X.clean).find((l) => head && l.includes(head[0])) || '';
    const sched = $$('table tr', p).map((r) => X.clean(r.textContent)).filter((t) => /\d:\d\d/.test(t)).join('; ');
    const termLine = /\n\s*([^\n,]*(?:Semester|Term|Summer|Winter|Online)[^\n,]*\d{4})\s*,/i.exec(text);
    return {
      code: head ? X.clean(head[1]) : '',
      title: X.titleCase(titleLine.replace(head ? head[0] : '', '').trim()),
      ref: X.clean(byEnd('lblReferenceNumberValue', p)?.textContent),
      credits: parseFloat((/([\d.]+)\s*Credit/i.exec(text) || [])[1]) || 0,
      faculty: X.clean((/Instructor\(s\):\s*([^\n]+)/.exec(text) || [])[1]),
      seats: X.clean((/\((\d+ out of \d+) seats\)/.exec(text) || [])[1]),
      schedule: sched,
      termLabel: termLine ? X.clean(termLine[1]) : '',
    };
  }
  // "Your Schedule" on the main screen = what you're registered for in the selected term
  function registeredOnMain() {
    const t = $$('table', portlet()).find((tb) => tb.querySelector('[id*="rptConfCourses"]'));
    if (!t) return [];
    return $$('tr', t).filter((r) => r.querySelector('[id*="rptConfCourses"]')).map((r) => {
      const cells = [...r.cells].map((c) => X.clean(c.textContent));
      const code = cells.find((c) => /^[A-Z]{2,5}\s+\d{3}[A-Z]?\s+[A-Z0-9]{1,3}(?:\s+[A-Z0-9]{1,3})?$/.test(c)) || '';
      const sched = cells.find((c) => /\d:\d\d/.test(c)) || '';
      return { code, schedule: sched, meetings: parseMeetings(sched), credits: parseFloat(cells.find((c) => /^\d+\.\d\d(\s|$)/.test(c))) || 0 };
    }).filter((c) => c.code);
  }

  // ---------------- conflicts ----------------
  function overlaps(a, b) {
    for (const x of a.meetings || []) for (const y of b.meetings || []) {
      if (x.days.some((d) => y.days.includes(d)) && x.start < y.end && y.start < x.end) return true;
    }
    return false;
  }

  // "SPAN 202 A (MWF 12:00 PM)": c with the meeting of it that collides with these meetings
  const DAY_CH = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];
  function clashLabel(meetings, c) {
    const y = (c.meetings || []).find((m) => meetings.some((x) => x.days.some((d) => m.days.includes(d)) && x.start < m.end && m.start < x.end));
    return y ? `${c.code} (${y.days.map((d) => DAY_CH[d]).join('')} ${X.fmtTime(y.start)})` : c.code;
  }

  // ---------------- UI: save buttons ----------------
  // "Plan with AI" entry points on the Add/Drop box itself (header, and next
  // to the Course Search button), in addition to the plan panel.
  function addAIButtons() {
    const p = portlet();
    if (!p) return;
    const make = (cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `gccx-ai-btn ${cls}`;
      b.textContent = 'Plan with AI';
      b.addEventListener('click', openAI);
      return b;
    };
    const head = p.querySelector('.portlet-header-bar');
    if (head && !head.querySelector('.gccx-ai-btn')) head.appendChild(make('is-head'));
    const search = byEnd('tabSearch_btnSearch', p);
    if (search && !search.parentNode.querySelector('.gccx-ai-btn')) search.insertAdjacentElement('afterend', make('is-inline'));
  }
  async function openAI() {
    drawerOpen = true;
    await renderDrawer(true);
    const box = document.querySelector('#gccx-plan .x-ai');
    if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimeout(() => document.getElementById('gccx-ai-input')?.focus(), 250);
  }

  async function decorate() {
    addAIButtons();
    const sc = screen();
    const plan = await getPlan();
    const term = currentSearchTerm();
    const has = (code, termVal) => plan.some((p) => p.code === code && (!termVal || p.term === termVal));
    if (sc === 'results') {
      for (const r of resultRows()) {
        if (!r.row.dataset.gccxGhost) {
          r.row.dataset.gccxGhost = '1';
          const on = () => { hoverSection = { code: r.code, schedule: r.schedule }; showGhost(hoverSection); };
          const off = () => { hoverSection = null; clearGhost(); };
          r.row.addEventListener('mouseenter', on);
          r.row.addEventListener('mouseleave', off);
          r.row.addEventListener('focusin', on);
          r.row.addEventListener('focusout', (e) => { if (!r.row.contains(e.relatedTarget)) off(); });
        }
        if (!r.addCell || r.addCell.querySelector('.gccx-save')) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gccx-save';
        const sync = (saved) => { b.textContent = saved ? 'Saved' : 'Save'; b.setAttribute('aria-pressed', String(saved)); };
        sync(has(r.code, term && term.value));
        b.addEventListener('click', async () => {
          let items = await getPlan();
          const exists = items.some((p) => p.code === r.code && p.term === term.value);
          if (exists) items = items.filter((p) => !(p.code === r.code && p.term === term.value));
          else items.push({ code: r.code, title: r.title, faculty: r.faculty, seats: r.seats, status: r.status, schedule: r.schedule, meetings: parseMeetings(r.schedule), credits: r.credits, term: term.value, termLabel: term.label, ref: null });
          await setPlan(items);
          sync(!exists);
          renderDrawer(true);
        });
        r.addCell.appendChild(b);
      }
      await markFit(plan, term); // after the buttons exist, so it can lock them
    }
    if (sc === 'details') {
      const info = detailsInfo();
      // Remember reference numbers for any planned section the user opens
      const items = await getPlan();
      let changed = false;
      items.forEach((p) => { if (p.code === info.code && !p.ref && info.ref) { p.ref = info.ref; changed = true; } });
      if (changed) await setPlan(items);
      const anchor = byEnd('lnkAddCourse') || byEnd('lnkBack');
      if (anchor && !$('.gccx-save-detail')) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gccx-save gccx-save-detail';
        const termVal = term ? term.value : null;
        const sync = (saved) => { b.textContent = saved ? 'Saved to plan' : 'Save to plan'; b.setAttribute('aria-pressed', String(saved)); };
        sync(items.some((p) => p.code === info.code));
        b.addEventListener('click', async () => {
          let list = await getPlan();
          const exists = list.some((p) => p.code === info.code);
          if (exists) list = list.filter((p) => p.code !== info.code);
          else list.push({ code: info.code, title: info.title, faculty: info.faculty, seats: info.seats, schedule: info.schedule, meetings: parseMeetings(info.schedule), credits: info.credits, term: termVal, termLabel: info.termLabel || (term && term.label) || '', ref: info.ref || null });
          await setPlan(list);
          sync(!exists);
          renderDrawer(true);
        });
        anchor.parentNode.insertBefore(b, anchor);
      }
    }
    if (sc === 'main') {
      const sel = byEnd('ddlTerm');
      if (sel) {
        const now = registeredOnMain();
        const reg = (await store.get('registered')) || {};
        reg[userKey() + '|' + sel.value] = { ts: Date.now(), courses: now };
        await store.set('registered', reg);
        // Anything in the plan you're now registered for is done; drop it.
        const left = plan.filter((p) => !(p.term === sel.value && now.some((c) => c.code === p.code)));
        if (left.length !== plan.length) await setPlan(left);
        addLoadButton(sel.value, left.filter((p) => p.term === sel.value));
      }
    }
  }

  // "Load my plan" on the Add by Reference # tab: fills the six boxes and
  // stops, so you can check them and press Add Course(s) yourself.
  function addLoadButton(term, items) {
    const addBtn = byEnd('tabRef_gbtnSearchRef');
    if (!addBtn) return;
    let b = $('#gccx-load-plan');
    if (!items.length) { b && b.remove(); return; }
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'gccx-load-plan';
      b.className = 'gccx-save';
      addBtn.parentNode.insertBefore(b, addBtn.nextSibling);
    }
    b.textContent = `Load my plan (${items.length})`;
    b.onclick = () => startJob(term, items, { fillOnly: true });
  }

  // ---------------- fit tags + filter on search results ----------------
  async function scheduleFor(termVal, plan) {
    const reg = ((await store.get('registered')) || {})[userKey() + '|' + termVal];
    const registered = reg ? reg.courses : [];
    const planned = plan.filter((p) => p.term === termVal);
    return { known: !!reg, courses: [...registered, ...planned.filter((p) => !registered.some((r) => r.code === p.code))] };
  }
  async function markFit(plan, term) {
    if (!term) return;
    const sched = await scheduleFor(term.value, plan);
    const settings = (await store.get('settings')) || {};
    const onlyFit = !!settings.onlyFit;
    const table = byEnd('dgCourses');
    const rows = resultRows();

    // filter control above the results
    if (table && !$('#gccx-fit-filter')) {
      const bar = document.createElement('label');
      bar.id = 'gccx-fit-filter';
      bar.innerHTML = `<input type="checkbox"> Only show sections that fit my schedule <span></span>`;
      table.parentNode.insertBefore(bar, table);
      bar.querySelector('input').addEventListener('change', async (e) => {
        const s = (await store.get('settings')) || {};
        s.onlyFit = e.target.checked;
        await store.set('settings', s);
        markFit(await getPlan(), currentSearchTerm());
      });
    }
    const filter = $('#gccx-fit-filter');
    if (filter) filter.querySelector('input').checked = onlyFit;

    let hidden = 0;
    for (const r of rows) {
      const meetings = parseMeetings(r.schedule);
      const others = sched.courses.filter((c) => c.code !== r.code);
      const clashing = meetings.length ? others.filter((c) => overlaps({ meetings }, c)) : [];
      const clashes = clashing.map((c) => clashLabel(meetings, c));
      const sameCourse = others.some((c) => courseKey(c.code) === courseKey(r.code));
      let tag = r.row.querySelector('.gccx-fit');
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'gccx-fit';
        const cell = r.link.closest('td');
        cell.appendChild(tag);
      }
      let fits = true;
      if (!meetings.length) { tag.textContent = ''; tag.className = 'gccx-fit'; }
      else if (clashes.length) { fits = false; tag.textContent = `Conflicts with ${clashes.join(', ')}`; tag.className = 'gccx-fit is-clash'; }
      else { tag.textContent = 'Fits your schedule'; tag.className = 'gccx-fit is-fit'; }
      if (sameCourse) { tag.textContent += (tag.textContent ? ' · ' : '') + 'Another section is in your schedule'; }
      // a clashing section that isn't saved can't be saved until the clash is gone
      const btn = r.addCell && r.addCell.querySelector('.gccx-save');
      if (btn) {
        const saved = plan.some((p) => p.code === r.code && p.term === term.value);
        const lock = clashes.length > 0 && !saved;
        btn.disabled = lock;
        btn.classList.toggle('is-locked', lock);
        btn.textContent = lock ? 'Conflicts' : saved ? 'Saved' : 'Save';
        btn.setAttribute('aria-pressed', String(saved));
      }
      // the row plus the textbook row that follows it
      const group = [r.row];
      let n = r.row.nextElementSibling;
      while (n && !n.querySelector('a[id$="lnkCourse"]')) { group.push(n); n = n.nextElementSibling; }
      const hide = onlyFit && !fits;
      group.forEach((g) => (g.hidden = hide));
      if (hide) hidden++;
    }
    if (filter) {
      const note = !sched.known && !sched.courses.length ? 'Open Add/Drop with this term selected once so aBetterMyGCC knows your registered classes.' : hidden ? `${hidden} hidden` : '';
      filter.querySelector('span').textContent = note;
    }
  }

  // ---------------- UI: drawer ----------------
  let drawerOpen = null;
  let viewTerm = null;
  let calState = null;     // what the calendar on screen shows, for ghost previews
  let hoverSection = null; // result row under the pointer / focus
  const closedKey = 'gccx-plan-closed';
  const wasClosed = () => { try { return sessionStorage.getItem(closedKey) === '1'; } catch (e) { return false; } };
  const setClosed = (v) => { try { v ? sessionStorage.setItem(closedKey, '1') : sessionStorage.removeItem(closedKey); } catch (e) { /* ignore */ } };

  async function renderDrawer(open) {
    if (!portlet()) return;
    const plan = await getPlan();
    const job = await store.get('job');
    if (open === true) { drawerOpen = true; setClosed(false); }
    // split screen by default: open beside the search unless closed this session
    if (drawerOpen === null) drawerOpen = !wasClosed() || !!(job && job.user === userKey());

    let toggle = $('#gccx-plan-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'gccx-plan-toggle';
      toggle.addEventListener('click', () => { drawerOpen = !drawerOpen; setClosed(!drawerOpen); renderDrawer(); });
      document.body.appendChild(toggle);
    }
    toggle.textContent = plan.length ? `My plan · ${plan.length}` : 'My plan';
    toggle.setAttribute('aria-expanded', String(drawerOpen));

    let d = $('#gccx-plan');
    if (!d) {
      d = document.createElement('aside');
      d.id = 'gccx-plan';
      d.setAttribute('aria-label', 'My course plan');
      document.body.appendChild(d);
    }
    d.classList.toggle('is-open', drawerOpen);
    document.documentElement.classList.toggle('gccx-plan-open', drawerOpen);

    const terms = [...new Map(plan.map((p) => [p.term, p.termLabel])).entries()];
    const st = currentSearchTerm();
    if (!viewTerm || (!terms.some(([v]) => v === viewTerm) && !(st && viewTerm === st.value))) viewTerm = (terms.find(([v]) => st && v === st.value) || (st && screen() === 'results' ? [st.value] : null) || terms[0] || [st && st.value])[0];
    const items = plan.filter((p) => p.term === viewTerm);
    const termLabel = (terms.find(([v]) => v === viewTerm) || [, st && st.label])[1] || '';
    const reg = ((await store.get('registered')) || {})[userKey() + '|' + viewTerm];
    const registered = reg ? reg.courses.filter((c) => !items.some((i) => i.code === c.code)) : [];

    const conflicts = new Map();
    items.forEach((a) => {
      const hits = [...items.filter((b) => b !== a), ...registered].filter((b) => overlaps(a, b)).map((b) => b.code);
      if (hits.length) conflicts.set(a.code, hits);
    });
    const planned = items.reduce((s, i) => s + (i.credits || 0), 0);
    const regCredits = registered.reduce((s, i) => s + (i.credits || 0), 0);
    const running = job && job.user === userKey() && job.phase !== 'done';

    d.innerHTML = `
      <div class="x-head">
        <h3>My plan</h3>
        <button type="button" class="x-close" aria-label="Close plan">Close</button>
      </div>
      ${terms.length > 1 ? `<div class="x-terms">${terms.map(([v, l]) => `<button type="button" data-term="${esc(v)}" aria-pressed="${v === viewTerm}">${esc(l)}</button>`).join('')}</div>` : termLabel ? `<p class="x-term">${esc(termLabel)}</p>` : ''}
      ${calendarHTML(items, registered, conflicts)}
      ${items.length ? `<ul class="x-items">${items.map((i) => `
        <li>
          <div class="x-line"><b>${esc(i.code)}</b><button type="button" class="x-remove" data-code="${esc(i.code)}" aria-label="Remove ${esc(i.code)}"${running ? ' disabled' : ''}>Remove</button></div>
          <div class="x-title">${esc(i.title)}</div>
          ${i.faculty ? `<div class="x-sub">${esc(prof(i.faculty))}</div>` : ''}
          <div class="x-sub">${esc(meetText(i))}</div>
          <div class="x-sub">${i.credits ? `${i.credits} credits` : ''}${i.seats ? `${i.credits ? ' · ' : ''}${esc(seatText(i.seats))}` : ''}</div>
          ${conflicts.has(i.code) ? `<div class="x-conflict">Overlaps ${esc(conflicts.get(i.code).join(', '))}</div>` : ''}
          ${/full|closed/i.test(i.status || '') ? `<div class="x-conflict">Section is ${esc(i.status.toLowerCase())}</div>` : ''}
          ${job && job.results && job.results[i.code] && !job.results[i.code].ok ? `<div class="x-conflict">${esc(job.results[i.code].msg)}</div>` : ''}
        </li>`).join('')}</ul>`
        : `<p class="x-empty">Search for courses below, then press Save on the sections you want. They'll collect here so you can add them all at once.</p>`}
      ${items.length ? `<p class="x-total">${planned} credits planned${reg ? ` · ${regCredits} already registered` : ''}</p>
        <p class="x-export"><button type="button" class="x-link" data-copy>Copy</button><button type="button" class="x-link" data-csv>Download CSV</button></p>` : ''}
      ${jobHTML(job, items, termLabel)}
      ${aiHTML(termLabel)}
    `;
    calState = { term: viewTerm, items, registered };
    d.querySelector('.x-close').addEventListener('click', () => { drawerOpen = false; setClosed(true); renderDrawer(); });
    d.querySelectorAll('[data-term]').forEach((b) => b.addEventListener('click', () => { viewTerm = b.dataset.term; renderDrawer(); }));
    d.querySelectorAll('.x-remove').forEach((b) => b.addEventListener('click', async () => {
      await setPlan((await getPlan()).filter((p) => !(p.code === b.dataset.code && p.term === viewTerm)));
      renderDrawer();
      decorateRefresh();
    }));
    d.querySelector('[data-add]')?.addEventListener('click', (e) => { e.currentTarget.closest('.x-actions').classList.add('is-confirming'); });
    d.querySelector('[data-cancel-confirm]')?.addEventListener('click', (e) => { e.currentTarget.closest('.x-actions').classList.remove('is-confirming'); });
    d.querySelector('[data-confirm]')?.addEventListener('click', () => startJob(viewTerm, items));
    d.querySelector('[data-copy]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try { await navigator.clipboard.writeText(planText(items, termLabel)); btn.textContent = 'Copied'; }
      catch (err) { btn.textContent = 'Copy failed'; }
      setTimeout(() => (btn.textContent = 'Copy'), 1600);
    });
    d.querySelector('[data-csv]')?.addEventListener('click', () => {
      const blob = new Blob([planCSV(items, termLabel)], { type: 'text/csv;charset=utf-8' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `course-plan-${(termLabel || 'term').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    d.querySelector('[data-stop]')?.addEventListener('click', async () => { await store.set('job', null); renderDrawer(); });
    wireAI(d);
    d.querySelector('[data-dismiss]')?.addEventListener('click', async () => { await store.set('job', null); renderDrawer(); });
    if (hoverSection) showGhost(hoverSection); // the redraw wiped any ghost under the pointer
  }

  // ---------------- hover previews ----------------
  function clearGhost() {
    $$('#gccx-plan .x-blk.is-ghost').forEach((e) => e.remove());
    $$('#gccx-plan .x-blk.is-hit').forEach((e) => e.classList.remove('is-hit'));
  }
  // Draw a result row's meetings on the calendar as dashed ghost blocks; if it
  // collides with something, the ghost goes red and the blocks it hits glow.
  function showGhost(sec) {
    clearGhost();
    const cal = $('#gccx-plan .x-cal');
    if (!cal || !calState || !sec) return;
    const st = currentSearchTerm();
    if (st && calState.term !== st.value) return;
    const meetings = parseMeetings(sec.schedule);
    if (!meetings.length) return;
    const all = [...calState.registered, ...calState.items];
    if (all.some((c) => c.code === sec.code)) return; // already drawn for real
    const hits = all.filter((c) => overlaps({ meetings }, c)).map((c) => c.code);
    const lo = +cal.dataset.lo, hi = +cal.dataset.hi, span = hi - lo;
    for (const m of meetings) for (const day of m.days) {
      const col = cal.querySelector(`.x-cal-col[data-day="${day}"]`);
      const a = Math.max(m.start, lo), b = Math.min(m.end, hi);
      if (!col || b <= a) continue;
      const g = document.createElement('div');
      g.className = `x-blk is-ghost${hits.length ? ' is-ghost-clash' : ''}`;
      g.dataset.code = sec.code;
      g.style.top = `${((a - lo) / span) * 100}%`;
      g.style.height = `${((b - a) / span) * 100}%`;
      g.innerHTML = `<span>${esc(calLabel(sec.code))}</span>`;
      col.appendChild(g);
    }
    $$('.x-blk', cal).forEach((b) => { if (!b.classList.contains('is-ghost') && hits.includes(b.dataset.code)) b.classList.add('is-hit'); });
  }
  // re-run fit tags and Save locks after the plan changes
  function refreshFit() {
    if (screen() === 'results') getPlan().then((p) => markFit(p, currentSearchTerm()));
  }
  function decorateRefresh() { $$('.gccx-save').forEach((b) => b.remove()); decorate(); }

  // ---------------- export ----------------
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function planRows(items, termLabel) {
    return items.map((i) => {
      const m = (i.meetings || [])[0];
      return {
        Term: termLabel || i.termLabel || '',
        Course: i.code,
        Title: i.title,
        Professor: i.faculty ? prof(i.faculty) : '',
        Days: (i.meetings || []).map((x) => x.days.map((d) => DAY[d]).join(' ')).join('; ') || 'Online / TBA',
        Start: m ? X.fmtTime(m.start) : '',
        End: m ? X.fmtTime(m.end) : '',
        Credits: i.credits || '',
        Seats: i.seats ? seatText(i.seats) : '',
        'Reference #': i.ref || '',
      };
    });
  }
  function planCSV(items, termLabel) {
    const rows = planRows(items, termLabel);
    const cols = Object.keys(rows[0] || { Course: '' });
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // BOM so Excel reads the en dash and accents correctly
    return '﻿' + [cols.map(q).join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n');
  }
  function planText(items, termLabel) {
    const lines = planRows(items, termLabel).map((r) => [
      `${r.Course}  ${r.Title}`,
      r.Professor && `  ${r.Professor}`,
      `  ${r.Days === 'Online / TBA' ? r.Days : `${r.Days}, ${r.Start}–${r.End}`}`,
      `  ${r.Credits} credits${r['Reference #'] ? ` · Ref ${r['Reference #']}` : ''}`,
    ].filter(Boolean).join('\n'));
    const total = items.reduce((s, i) => s + (i.credits || 0), 0);
    return `${termLabel || 'Course plan'}\n\n${lines.join('\n\n')}\n\nTotal: ${total} credits\n`;
  }

  // "COMP 220 A" -> "COMP 220"; lab sections "BIOL 102 L L" -> "BIOL 102 lab".
  // Two codes with the same key are interchangeable sections of one thing.
  function courseKey(code) {
    const t = String(code || '').trim().split(/\s+/);
    return t.length >= 4 ? `${t[0]} ${t[1]} lab` : `${t[0]} ${t[1] || ''}`.trim();
  }
  const calLabel = courseKey;

  function meetText(i) {
    if (!i.meetings || !i.meetings.length) return 'Online or no set meeting time';
    const L = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return i.meetings.map((m) => `${m.days.map((d) => L[d]).join(', ')} · ${X.fmtTime(m.start)}–${X.fmtTime(m.end)}`).join('; ');
  }
  // "Wolfe, Britton D." -> "Britton D. Wolfe"
  function prof(s) {
    return s.split(/;\s*/).map((n) => { const [last, first] = n.split(/,\s*/); return first ? `${first} ${last}` : n; }).join(', ');
  }
  // "0/32" -> "Full (32 seats)", "5/32" -> "5 of 32 seats open"
  function seatText(s) {
    const m = /(\d+)\s*(?:\/|out of)\s*(\d+)/.exec(s);
    if (!m) return s;
    return +m[1] === 0 ? `Full (${m[2]} seats)` : `${m[1]} of ${m[2]} seats open`;
  }

  function calendarHTML(items, registered, conflicts) {
    const all = [...registered.map((c) => ({ ...c, kind: 'reg' })), ...items.map((c) => ({ ...c, kind: 'plan' }))];
    const ms = all.flatMap((c) => (c.meetings || []).map((m) => m));
    const lo = Math.min(8 * 60, ...ms.map((m) => Math.floor(m.start / 60) * 60));
    const hi = Math.max(17 * 60, ...ms.map((m) => Math.ceil(m.end / 60) * 60));
    const span = hi - lo;
    const days = [1, 2, 3, 4, 5];
    const blocks = all.flatMap((c) => (c.meetings || []).flatMap((m) => m.days.filter((d) => days.includes(d)).map((d) => {
      const top = ((m.start - lo) / span) * 100, h = ((m.end - m.start) / span) * 100;
      const cls = c.kind === 'reg' ? 'is-reg' : conflicts.has(c.code) ? 'is-clash' : 'is-plan';
      return `<div class="x-blk ${cls}" style="grid-column:${days.indexOf(d) + 2};top:${top}%;height:${h}%" data-code="${esc(c.code)}" title="${esc(c.code)} ${X.fmtTime(m.start)}–${X.fmtTime(m.end)}"><span>${esc(calLabel(c.code))}</span></div>`;
    })));
    const hours = [];
    for (let t = lo; t <= hi; t += 120) hours.push(`<i style="top:${((t - lo) / span) * 100}%">${((Math.floor(t / 60) + 11) % 12) + 1}${t < 720 ? 'a' : 'p'}</i>`);
    return `<div class="x-cal" data-lo="${lo}" data-hi="${hi}">
      <div class="x-cal-days"><span></span>${['M', 'T', 'W', 'Th', 'F'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="x-cal-body">
        <div class="x-cal-hours">${hours.join('')}</div>
        ${days.map((_, i) => `<div class="x-cal-col" data-day="${days[i]}" style="grid-column:${i + 2}">${blocks.filter((b) => b.includes(`grid-column:${i + 2};`)).join('')}</div>`).join('')}
      </div>
      ${registered.length ? `<div class="x-cal-key"><span class="is-plan"></span>Planned<span class="is-reg"></span>Registered</div>` : ''}
    </div>`;
  }

  function jobHTML(job, items, termLabel) {
    if (job && job.user === userKey()) {
      const lines = job.queue.map((code) => {
        const r = job.results[code];
        const status = r ? (r.ok ? 'Added' : 'Not added') : job.refs[code] ? (job.phase === 'submit' ? 'Adding…' : `Ref ${job.refs[code]}`) : 'Looking up…';
        return `<li><span>${esc(code)}</span><span class="${r ? (r.ok ? 'x-ok' : 'x-bad') : ''}">${status}</span></li>`;
      }).join('');
      if (job.phase === 'done' && job.fillOnly) {
        const missing = job.queue.filter((c) => job.results[c] && !job.results[c].ok);
        return `<div class="x-job"><p><b>${job.filled || 0} reference number${job.filled === 1 ? '' : 's'} filled in.</b> Check them, then press Add Course(s).${job.remaining ? ` After that, press Load my plan again for the other ${job.remaining}.` : ''}</p>
          ${missing.length ? `<ul>${missing.map((c) => `<li><span>${esc(c)}</span><span class="x-bad">${esc(job.results[c].msg)}</span></li>`).join('')}</ul>` : ''}
          <button type="button" class="x-link" data-dismiss>Done</button></div>`;
      }
      if (job.phase === 'done') {
        const ok = job.queue.filter((c) => job.results[c] && job.results[c].ok).length;
        return `<div class="x-job"><p><b>${ok} of ${job.queue.length} added.</b>${ok < job.queue.length ? ' The rest stay in your plan.' : ''}</p><ul>${lines}</ul>
          ${job.manualRefs ? `<p class="x-sub">Reference numbers: ${esc(job.manualRefs)}</p>` : ''}
          <button type="button" class="x-link" data-dismiss>Done</button></div>`;
      }
      if (job.fillOnly) return `<div class="x-job"><p><b>Looking up reference numbers.</b> Keep this tab open; the page will reload a few times.</p><ul>${lines}</ul><button type="button" class="x-link" data-stop>Stop</button></div>`;
      return `<div class="x-job"><p><b>Adding your courses.</b> Keep this tab open; the page will reload a few times.</p><ul>${lines}</ul><button type="button" class="x-link" data-stop>Stop</button></div>`;
    }
    if (!items.length) return '';
    return `<div class="x-actions">
      <button type="button" class="x-primary" data-add>Register all (${items.length})</button>
      <div class="x-confirm">
        <p>Register for ${items.length} course${items.length > 1 ? 's' : ''}${termLabel ? ` in ${esc(termLabel)}` : ''}?</p>
        <button type="button" class="x-primary" data-confirm>Register</button>
        <button type="button" class="x-link" data-cancel-confirm>Cancel</button>
      </div>
    </div>`;
  }

  // ---------------- the add-all job ----------------
  async function startJob(term, items, opts = {}) {
    const refs = {};
    items.forEach((i) => { if (i.ref) refs[i.code] = i.ref; });
    await store.set('job', {
      user: userKey(), term, queue: items.map((i) => i.code), refs, results: {}, phase: 'lookup', step: null, batch: [], guard: 0, ts: Date.now(),
      dryRun: !!window.__gccxDryRun,
      fillOnly: !!opts.fillOnly,
    });
    run();
  }

  async function saveJob(job) { job.ts = Date.now(); await store.set('job', job); }
  function goMain() { location.href = MAIN_URL; }
  function setSelect(sel, value) {
    if (!sel || sel.value === value) return false;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function run() {
    const job = await store.get('job');
    if (!job || job.user !== userKey() || job.phase === 'done') return;
    if (Date.now() - job.ts > 10 * 60e3) { await store.set('job', null); return; } // abandoned
    if (++job.guard > job.queue.length * 8 + 12) return finish(job, 'Stopped: myGCC did not respond as expected.');
    const sc = screen();
    renderDrawer(true);

    if (job.phase === 'lookup') {
      const code = job.queue.find((c) => !job.refs[c] && !job.results[c]);
      if (!code) { job.phase = 'submit'; job.step = null; await saveJob(job); return run(); }
      if (sc === 'main' && job.step !== 'searched') {
        const p = portlet();
        byEnd('tabSearch_ddlCourseRestrictor', p).value = 'ExactMatch';
        byEnd('tabSearch_txtCourseRestrictor', p).value = code;
        byEnd('tabSearch_txtTitleRestrictor', p).value = '';
        byEnd('tabSearch_ddlTermSearch', p).value = job.term;
        const dept = byEnd('tabSearch_ddlDept', p); if (dept) dept.selectedIndex = 0;
        job.step = 'searched'; job.current = code; await saveJob(job);
        return byEnd('tabSearch_btnSearch', p).click();
      }
      if (sc === 'results' && job.step === 'searched') {
        const row = resultRows().find((r) => r.code === job.current);
        if (!row) {
          job.results[job.current] = { ok: false, msg: 'Section not found for this term' };
          job.step = null; await saveJob(job); return goMain();
        }
        job.step = 'details'; await saveJob(job);
        return row.link.click();
      }
      if (sc === 'details' && job.step === 'details') {
        const info = detailsInfo();
        if (info.ref) job.refs[job.current] = info.ref;
        else job.results[job.current] = { ok: false, msg: 'No reference number listed' };
        const plan = await getPlan();
        plan.forEach((p) => { if (p.code === job.current && p.term === job.term && info.ref) p.ref = info.ref; });
        await setPlan(plan);
        job.step = null; await saveJob(job); return goMain();
      }
      job.step = null; await saveJob(job); return goMain();
    }

    if (job.phase === 'submit') {
      if (sc !== 'main') { job.step = null; await saveJob(job); return goMain(); }
      const p = portlet();
      if (job.step === 'submitted') {
        // Judge the batch by what's now listed under "Your Schedule"
        const now = registeredOnMain().map((c) => c.code);
        const msg = X.clean($$('.pt_CourseSchedules [class*="rror"], .pt_CourseSchedules [class*="essage"], .pt_CourseSchedules .feedback, .pt_CourseSchedules font[color]').map((e) => e.textContent).join(' ')).slice(0, 220);
        for (const code of job.batch) job.results[code] = now.includes(code) ? { ok: true } : { ok: false, msg: msg || 'myGCC did not add this section' };
        const added = job.batch.filter((c) => job.results[c].ok);
        if (added.length) await setPlan((await getPlan()).filter((x) => !(x.term === job.term && added.includes(x.code))));
        job.batch = []; job.step = null; await saveJob(job);
      }
      const termSel = byEnd('ddlTerm', p);
      if (termSel && termSel.value !== job.term) {
        job.step = 'term'; await saveJob(job);
        setSelect(termSel, job.term); // triggers myGCC's own postback
        return;
      }
      const todo = job.queue.filter((c) => job.refs[c] && !job.results[c]);
      if (!todo.length) return finish(job);
      job.batch = todo.slice(0, 6);
      for (let n = 1; n <= 6; n++) byEnd('tbRefNum' + n, p).value = job.batch[n - 1] ? job.refs[job.batch[n - 1]] : '';
      if (job.fillOnly) {
        job.filled = job.batch.length;
        job.remaining = todo.length - job.batch.length;
        job.phase = 'done';
        await saveJob(job);
        renderDrawer(true);
        // show the Add by Reference # tab so the filled boxes are visible
        $$('a', p).find((a) => /reference/i.test(a.textContent) && a.getAttribute('href') === '#')?.click();
        byEnd('tabRef_tbRefNum1', p)?.scrollIntoView({ block: 'center' });
        return;
      }
      if (job.dryRun) {
        job.manualRefs = job.batch.map((c) => job.refs[c]).join(', ');
        job.batch.forEach((c) => (job.results[c] = { ok: false, msg: 'Dry run: filled in, not submitted' }));
        return finish(job);
      }
      job.step = 'submitted'; await saveJob(job);
      return byEnd('tabRef_gbtnSearchRef', p).click();
    }
  }
  async function finish(job, note) {
    job.phase = 'done';
    if (note) job.queue.forEach((c) => { if (!job.results[c]) job.results[c] = { ok: false, msg: note }; });
    const missing = job.queue.filter((c) => job.refs[c] && !(job.results[c] && job.results[c].ok)).map((c) => job.refs[c]);
    if (missing.length && !job.manualRefs) job.manualRefs = missing.join(', ');
    await saveJob(job);
    renderDrawer(true);
    decorateRefresh();
  }

  // ---------------- Plan with AI ----------------
  // You paste a list of what you need; an AI model (your own key, any of
  // Anthropic / OpenAI / xAI / Google) searches myGCC's course catalog with
  // the tools below and saves sections that fit into your plan. It never
  // registers you: you review the plan and add it yourself.
  const AI_TOOLS = [
    {
      name: 'search_sections',
      description: 'Search this term\'s course sections in myGCC. Pass a course code ("COMP 220"), a level prefix ("HUMA 3" for 300-level HUMA), a department ("SPAN"), or one distinctive title word ("organic"; myGCC titles are abbreviated, so prefer one word). Returns up to 30 sections with professor, meeting times, seats, and whether each fits the student\'s current schedule (registered classes plus the plan).',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Course code prefix, department, or title words' } }, required: ['query'], additionalProperties: false },
    },
    {
      name: 'add_to_plan',
      description: 'Save one section to the student\'s plan. Use the exact section code from search results, e.g. "COMP 220 A", or "BIOL 102 L L" for a lab section. Only sections returned by search_sections can be added.',
      parameters: { type: 'object', properties: { code: { type: 'string', description: 'Exact section code, e.g. "COMP 220 A"' } }, required: ['code'], additionalProperties: false },
    },
    {
      name: 'remove_from_plan',
      description: 'Remove a section from the student\'s plan, by its exact section code.',
      parameters: { type: 'object', properties: { code: { type: 'string', description: 'Exact section code' } }, required: ['code'], additionalProperties: false },
    },
  ];
  const AI_SYSTEM = `You help a Grove City College student build a course plan in myGCC for one term.
The student lists the courses they need, sometimes with preferences (times, days, professors). For each course:
1. Find its sections with search_sections. Search by course code when they give one; otherwise search by department or title words.
2. Pick one section that fits their schedule (fits: true) and their stated preferences. Prefer sections with open seats over full ones. If they asked for a specific section or professor, honor that.
3. Save it with add_to_plan.
When the request is vague ("a 300-level HUMA", "a lab science"), search the department, choose a reasonable fitting option, and say which one you chose.
If every section of a course conflicts or is full, don't add one: explain the conflict instead. Don't add two lecture sections of the same course, or two lab sections of the same lab. Don't remove anything the student already planned unless they ask.
You only build the plan; you can't register the student. Finish with a short plain summary, one line per course: what you added (code, days and time, professor), or why you couldn't.

How myGCC labels courses:
- A section code is department, course number, section: "COMP 220 A" and "COMP 220 B" are two sections of the same course, often at different times or with different professors. The student can take only one.
- The course number shows the level: 100s are introductory, 400s advanced. Searching "HUMA 3" returns every 300-level HUMA course.
- Some labs are sections of the lecture's own course number with an extra "L" at the end: "BIOL 102 A" is the lecture (4 credits) and "BIOL 102 L L", "BIOL 102 M L", "BIOL 102 N L" are its lab sections (0 credits, titled LABORATORY or LABORATORY WORKSHOP). When a course has these, the student needs one lecture section and one lab section that don't conflict: add both.
- Other labs are separate courses with their own number and credits, titled "... LAB" (for example CHEM 114 GENERAL CHEMISTRY II LAB goes with CHEM 112). Add one only if the student asks for the lab or names that course; otherwise mention it in the summary.
- In schedules, days are M T W R F, where T is Tuesday and R is Thursday: "TR 11:00 AM-12:15 PM" meets Tuesday and Thursday. Text after the semicolon is the campus, building and room. A section with no days or times is online or arranged and can't conflict.
- seats_open "5/48" means 5 of 48 seats are open. "0/48" with status Full means the section is full.
- Titles are uppercase and often abbreviated ("GEN PHYSICS II-ENGINEERING", "ADV ORGANIC CHEM"), so match on meaning, not exact words.`;

  let aiRun = null; // { running, log: [], summary, error }
  let aiInfo = null;
  const aiStatus = () => new Promise((r) => chrome.runtime.sendMessage({ type: 'ai-status' }, (x) => r(chrome.runtime.lastError ? null : x)));
  const aiCall = (payload) => new Promise((r) => chrome.runtime.sendMessage({ type: 'ai-chat', ...payload }, (x) => r(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : x)));

  function aiHTML(termLabel) {
    const ready = aiInfo && aiInfo.ready;
    const run = aiRun || {};
    const log = (run.log || []).map((l) => `<li class="${l.bad ? 'x-bad' : ''}">${esc(l.text)}</li>`).join('');
    return `<div class="x-ai">
      <h4>Plan with AI</h4>
      ${!ready ? `<p class="x-sub">Paste a list of the courses you need and let AI find sections that fit your schedule. To turn this on, click the aBetterMyGCC icon in Chrome's toolbar and add an API key from Anthropic, OpenAI, xAI or Google.</p>` : `
        <textarea id="gccx-ai-input" rows="4" placeholder="COMP 220, STAT 131, a 300-level HUMA, Spanish 202. Mornings if possible, no Friday afternoons."${run.running ? ' disabled' : ''}>${esc(run.input || '')}</textarea>
        <button type="button" class="x-primary" data-ai-run${run.running ? ' disabled' : ''}>${run.running ? 'Working…' : `Find courses${termLabel ? ` for ${esc(termLabel)}` : ''}`}</button>
        <p class="x-sub x-ai-note">Uses ${esc(aiInfo.model || 'your model')}. It only adds sections to your plan; you still review them and register.</p>`}
      ${log ? `<ul class="x-ai-log">${log}</ul>` : ''}
      ${run.summary ? `<div class="x-ai-summary">${esc(run.summary).replace(/\n/g, '<br>')}</div>` : ''}
      ${run.error ? `<p class="x-conflict">${esc(run.error)}</p>` : ''}
      ${run.running ? `<button type="button" class="x-link" data-ai-stop>Stop</button>` : ''}
    </div>`;
  }
  function wireAI(d) {
    d.querySelector('[data-ai-run]')?.addEventListener('click', () => {
      const text = (d.querySelector('#gccx-ai-input')?.value || '').trim();
      if (!text) { d.querySelector('#gccx-ai-input')?.focus(); return; }
      runAgent(text, viewTerm);
    });
    d.querySelector('[data-ai-stop]')?.addEventListener('click', () => { if (aiRun) aiRun.stopped = true; });
  }

  // Search myGCC without touching the page on screen: fetch the Add/Drop
  // form, fill in the Course Search fields, and post it.
  async function fetchDoc(url, init) {
    const res = await fetch(url, { credentials: 'include', ...init });
    if (!res.ok) throw new Error(`myGCC returned ${res.status}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }
  // myGCC titles are abbreviated ("ADV ORGANIC CHEM"), so a multi-word title
  // search often finds nothing; fall back to the longest word.
  async function searchSections(query, term) {
    const first = await searchOnce(query, term);
    const words = query.trim().split(/\s+/);
    if (first.length || words.length < 2 || /^[A-Za-z]{2,5}\s*\d/.test(query.trim())) return first;
    const longest = words.filter((w) => !/^(and|the|of|to|in|for|intro|introduction|i|ii|iii)$/i.test(w)).sort((a, b) => b.length - a.length)[0];
    return longest ? searchOnce(longest, term) : first;
  }
  async function searchOnce(query, term) {
    const doc = await fetchDoc(MAIN_URL);
    const form = doc.querySelector('form');
    const field = (suffix) => doc.querySelector(`[id$="${suffix}"]`);
    if (!form || !field('tabSearch_btnSearch')) throw new Error('Course search is not available on the Add/Drop page right now.');
    const body = new URLSearchParams();
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
      if (['submit', 'button', 'image', 'reset', 'file'].includes(el.type)) return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      body.set(el.name, el.value || '');
    });
    const setSel = (suffix, pick) => {
      const sel = field(suffix);
      if (!sel) return;
      const opt = [...sel.options].find(pick);
      if (opt) body.set(sel.name, opt.value);
    };
    const q = query.trim();
    const code = /^\s*([A-Za-z]{2,5})(?:\s*-?\s*(\d{1,3}[A-Za-z]?))?(?:\s+([A-Za-z0-9]{1,3}))?(?:\s+([A-Za-z0-9]{1,3}))?\s*$/.exec(q);
    body.set(field('tabSearch_txtCourseRestrictor').name, code ? [code[1].toUpperCase(), code[2], code[3] && code[3].toUpperCase(), code[4] && code[4].toUpperCase()].filter(Boolean).join(' ') : '');
    body.set(field('tabSearch_txtTitleRestrictor').name, code ? '' : q);
    setSel('tabSearch_ddlCourseRestrictor', (o) => /begins/i.test(o.textContent));
    setSel('tabSearch_ddlTitleRestrictor', (o) => /contains/i.test(o.textContent));
    setSel('tabSearch_ddlTermSearch', (o) => o.value === term);
    const dept = field('tabSearch_ddlDept'); if (dept && dept.options[0]) body.set(dept.name, dept.options[0].value);
    const btn = field('tabSearch_btnSearch');
    body.set(btn.name, btn.value || 'Search');
    body.set('__EVENTTARGET', ''); body.set('__EVENTARGUMENT', '');
    const action = new URL(form.getAttribute('action') || MAIN_URL, location.origin + MAIN_URL).href;
    const res = await fetchDoc(action, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return resultRows(res).map((r) => ({
      code: r.code, title: r.title, faculty: r.faculty, seats: r.seats, status: r.status,
      schedule: r.schedule, credits: r.credits, meetings: parseMeetings(r.schedule),
    }));
  }

  async function runAgent(input, term) {
    if (aiRun && aiRun.running) return;
    const st = currentSearchTerm();
    term = term || (st && st.value);
    if (!term) return;
    const termLabel = ((await getPlan()).find((p) => p.term === term) || {}).termLabel || (st && st.value === term ? st.label : term);
    aiRun = { running: true, input, log: [], summary: '', error: '' };
    const say = (text, bad) => { aiRun.log.push({ text, bad }); renderDrawer(true); };
    const seen = new Map(); // code -> section from searches

    const plan = (await getPlan()).filter((p) => p.term === term);
    const sched = await scheduleFor(term, await getPlan());
    const reg = sched.courses.filter((c) => !plan.some((p) => p.code === c.code));
    const L = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const when = (c) => (c.meetings && c.meetings.length ? c.meetings.map((m) => `${m.days.map((d) => L[d]).join('/')} ${X.fmtTime(m.start)}-${X.fmtTime(m.end)}`).join('; ') : 'no set meeting time');
    const context = [
      `Term: ${termLabel}`,
      `Already registered (${sched.known ? 'from myGCC' : 'unknown: the student has not opened Add/Drop for this term'}):`,
      ...(reg.length ? reg.map((c) => `- ${c.code}: ${when(c)}`) : ['- none']),
      'Already in the plan:',
      ...(plan.length ? plan.map((p) => `- ${p.code} ${p.title}: ${when(p)}`) : ['- none']),
      '',
      'Student\'s request:',
      input,
    ].join('\n');

    const messages = [{ role: 'user', text: context }];
    say(`Reading your list for ${termLabel}…`);
    try {
      for (let turn = 0; turn < 24; turn++) {
        if (aiRun.stopped) { aiRun.error = 'Stopped.'; break; }
        const r = await aiCall({ system: AI_SYSTEM, tools: AI_TOOLS, messages });
        if (!r || r.error) {
          aiRun.error = r && r.kind === 'auth' ? 'Your AI key was rejected. Check it in the aBetterMyGCC popup.' : r && r.kind === 'rate' ? 'The AI service is rate-limiting this key. Try again in a minute.' : `AI request failed: ${r ? r.error : 'no response'}`;
          break;
        }
        const out = r.ok;
        if (out.stop === 'refusal') { aiRun.error = 'The AI service declined this request.'; break; }
        if (out.stop === 'max') { aiRun.error = 'The AI response was cut off. Try a shorter list.'; break; }
        if (out.stop !== 'tool' || !out.toolCalls.length) { aiRun.summary = out.text || 'Done.'; break; }
        messages.push({ role: 'assistant', native: out.native });
        const results = [];
        for (const call of out.toolCalls) {
          let content, isError = false;
          try {
            const a = call.input || {};
            if (a.__invalid !== undefined) throw new Error('Arguments were not valid JSON.');
            if (call.name === 'search_sections') {
              if (typeof a.query !== 'string' || !a.query.trim()) throw new Error('query is required');
              say(`Searching ${a.query.trim()}…`);
              const found = await searchSections(a.query, term);
              const planNow = await getPlan();
              const s2 = await scheduleFor(term, planNow);
              const rows = found.slice(0, 30).map((f) => {
                seen.set(f.code, f);
                const others = s2.courses.filter((c) => c.code !== f.code);
                const clashes = f.meetings.length ? others.filter((c) => overlaps(f, c)).map((c) => c.code) : [];
                return { code: f.code, title: f.title, professor: f.faculty, schedule: f.schedule, seats_open: f.seats, status: f.status, credits: f.credits, fits: !clashes.length, conflicts_with: clashes };
              });
              content = JSON.stringify({ count: found.length, sections: rows });
            } else if (call.name === 'add_to_plan') {
              const code = String(a.code || '').trim().toUpperCase().replace(/\s+/g, ' ');
              const f = seen.get(code);
              if (!f) throw new Error(`${code} was not in any search result. Search for it first and use the exact code.`);
              const list = await getPlan();
              if (!list.some((p) => p.code === code && p.term === term)) {
                list.push({ code, title: f.title, faculty: f.faculty, seats: f.seats, status: f.status, schedule: f.schedule, meetings: f.meetings, credits: f.credits, term, termLabel, ref: null, byAI: true });
                await setPlan(list);
              }
              say(`Added ${code} · ${f.title}`);
              content = JSON.stringify({ ok: true, added: code });
            } else if (call.name === 'remove_from_plan') {
              const code = String(a.code || '').trim().toUpperCase().replace(/\s+/g, ' ');
              await setPlan((await getPlan()).filter((p) => !(p.code === code && p.term === term)));
              say(`Removed ${code}`);
              content = JSON.stringify({ ok: true, removed: code });
            } else {
              throw new Error(`Unknown tool ${call.name}`);
            }
          } catch (e) {
            isError = true;
            content = `Error: ${e.message || e}`;
          }
          results.push({ id: call.id, name: call.name, content, isError });
        }
        messages.push({ role: 'tool', results }); // all results in one turn
      }
      if (!aiRun.summary && !aiRun.error) aiRun.error = 'Stopped after too many steps. What was added so far is in your plan.';
    } catch (e) {
      aiRun.error = `Something went wrong: ${e.message || e}`;
    }
    aiRun.running = false;
    // The background searches moved myGCC's own page state on the server, so
    // reload Add/Drop with a normal link (not a refresh) and keep the summary.
    try { sessionStorage.setItem('gccx-ai-run', JSON.stringify({ ...aiRun, stopped: false })); } catch (e) { /* ignore */ }
    goMain();
  }

  chrome.storage.onChanged.addListener((ch) => { if (ch.plans) { renderDrawer(); refreshFit(); } if (ch.ai) aiStatus().then((x) => { aiInfo = x; renderDrawer(); }); });

  function boot() {
    if (!portlet() || !userKey()) return;
    try { if (JSON.parse(localStorage.getItem('gccx-settings') || '{}').enabled === false) return; } catch (e) { /* default on */ }
    try {
      const saved = JSON.parse(sessionStorage.getItem('gccx-ai-run') || 'null');
      if (saved) { aiRun = saved; sessionStorage.removeItem('gccx-ai-run'); drawerOpen = true; }
    } catch (e) { /* ignore */ }
    aiStatus().then((x) => { aiInfo = x; renderDrawer(); });
    decorate().then(() => renderDrawer()).then(run);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
