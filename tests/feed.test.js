'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./helpers.js');

// The parsers take a real Document. The extension has no dependencies, so a DOM library is only
// looked for here (a local or global linkedom, or the path in GCCX_DOM); without one the parser
// tests are skipped.
function findDom() {
  const roots = [undefined, process.env.GCCX_DOM, process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', 'openclaw', 'node_modules', 'linkedom')];
  for (const r of roots) {
    try { const m = r === undefined ? require('linkedom') : r && require(r); if (m && m.parseHTML) return m.parseHTML; } catch (e) { /* try the next */ }
  }
  return null;
}
const parseHTML = findDom();
const dom = (html) => parseHTML('<!doctype html><html><body>' + html + '</body></html>').document;
const parsers = parseHTML ? test : (name, fn) => test(name, { skip: 'no DOM library (linkedom) available' }, fn);

const X = load('lib.js', 'campusfeed.js');
const F = X.feed;
const NOW = new Date(2026, 10, 9, 10, 0); // Monday 9 Nov 2026
const O = 'https://my.gcc.edu';

const portlet = (cls, title, inner) => `<div class="portlet ${cls}"><div class="portlet-header-bar"><h3>${title}</h3></div><div class="pSection">${inner}</div></div>`;

parsers('announcements: live .post-item markup', () => {
  const d = dom(portlet('pi_X', 'Campus Announcements', `
    <div class="post-item"><h4><a href="/ICS/Campus_Life/Post.jnz?id=1">Library hours</a></h4><div class="post-info">Posted 11/9/2026 by Library</div><div class="post-content"><p>${'Long text. '.repeat(40)}</p></div></div>
    <div class="post-item"><h4><a href="javascript:void(0)">Odd link</a></h4><div class="post-info">Nov 8</div><div class="post-content">Short body</div></div>`));
  const a = F.parseAnnouncements(d);
  assert.equal(a.length, 2);
  assert.equal(a[0].title, 'Library hours');
  assert.equal(a[0].href, O + '/ICS/Campus_Life/Post.jnz?id=1');
  assert.equal(a[0].date, 'Posted 11/9/2026 by Library');
  assert.ok(a[0].excerpt.length <= 180 && a[0].excerpt.length > 100);
  assert.equal(a[1].href, null);
  assert.equal(a[1].excerpt, 'Short body');
});

parsers('announcements: simple li fallback, max 10, no portlet', () => {
  const lis = Array.from({ length: 12 }, (_, i) => `<li><b>Item ${i}</b> and some detail.</li>`).join('');
  const a = F.parseAnnouncements(dom(portlet('pi_Announcements', 'News', `<ul>${lis}</ul>`)));
  assert.equal(a.length, 10);
  assert.equal(a[0].title, 'Item 0');
  assert.equal(a[0].excerpt, 'and some detail.');
  const first = F.parseAnnouncements(dom(portlet('x', 'Announcements', '<ul><li>First sentence here. More after it.</li></ul>')));
  assert.equal(first[0].title, 'First sentence here.');
  assert.deepEqual(F.parseAnnouncements(dom(portlet('x', 'Welcome', '<p>hi</p>'))), []);
});

parsers('events: live list markup with date headings, times and locations', () => {
  const d = dom(portlet('pt_CalendarPortlet', 'Upcoming events', `<div class="calendar-list-view">
    <div class="date"><a href="/ICS/x">Monday, November 9, 2026</a></div>
    <div><span>All Day</span><span><a href="/ICS/Campus_Life/Events.jnz?e=1">Food drive</a></span><div class="location">Union</div></div>
    <div><span>7:00 PM - 9:00 PM</span><span><a href="/ICS/Campus_Life/Events.jnz?e=2">Concert</a></span><div class="location">Arts</div></div>
    <div class="date">Tomorrow</div>
    <div><span>4:30 PM</span><span><a href="/ICS/e3">Workshop</a></span></div>
    <div class="date">November 12</div>
    <div><span>11:00 AM - 12:15 PM</span><span><a href="/ICS/e4">Lecture</a></span></div>
    <div class="date">not a date</div>
    <div><span>1:00 PM</span><span><a href="/ICS/e5">Skipped</a></span></div>
    <div class="date">11/14/2026</div>
    <div><span>9 AM</span><span><a href="/ICS/e6">Early</a></span></div></div>`));
  const e = F.parseEvents(d, NOW);
  assert.equal(e.length, 5);
  assert.deepEqual(e[0], { date: '2026-11-09', start: null, end: null, allDay: true, title: 'Food drive', href: O + '/ICS/Campus_Life/Events.jnz?e=1', location: 'Union', kind: 'event' });
  assert.deepEqual([e[1].start, e[1].end, e[1].allDay, e[1].location], [19 * 60, 21 * 60, false, 'Arts']);
  assert.deepEqual([e[2].date, e[2].start, e[2].end], ['2026-11-10', 16 * 60 + 30, null]);
  assert.deepEqual([e[3].date, e[3].start, e[3].end], ['2026-11-12', 11 * 60, 12 * 60 + 15]);
  assert.deepEqual([e[4].date, e[4].start], ['2026-11-14', 9 * 60]);
  assert.ok(!e.some((x) => x.title === 'Skipped'));
});

parsers('events: double-encoded titles are decoded once; class sessions are tidied', () => {
  const d = dom(portlet('pt_CalendarPortlet', 'Events', `<div class="calendar-list-view"><div class="date">Today</div>
    <div><span>7:00 PM - 9:00 PM</span><span><a href="/ICS/x">Men&amp;#39;s Basketball &amp;amp; Band</a></span></div>
    <div><span>9:00 AM - 9:50 AM</span><span><a href="/ICS/y">Class Session (INTERMEDIATE SPANISH I (SPAN 201 A))</a></span><div class="location">HAL 210</div></div></div>`));
  const e = F.parseEvents(d, NOW);
  assert.equal(e[0].title, "Men's Basketball & Band");
  assert.deepEqual([e[1].title, e[1].location, e[1].kind], ['Intermediate Spanish I', 'SPAN 201 A, HAL 210', 'class']);
});

parsers('calendar API: ids from the inline script; events mapped, decoded and tidied', () => {
  const d = dom(portlet('pt_CalendarPortlet', 'Public Events Calendar', `<script>var viewData = {};
    viewData.portletId = 'ab12cd34-0000-4000-8000-0000000000aa'; viewData.settingsPortletId = 'ab12cd34-0000-4000-8000-0000000000bb';</script>`));
  assert.deepEqual(F.calendarIds(d), { portletId: 'ab12cd34-0000-4000-8000-0000000000aa', settingsPortletId: 'ab12cd34-0000-4000-8000-0000000000bb' });
  assert.equal(F.calendarIds(dom(portlet('x', 'Events', '<p>none</p>'))), null);
  const cls = F.mapApiEvent({ title: 'Class Session (INTERMEDIATE SPANISH I (SPAN 201-A)', start: '2026-11-09T09:00:00', end: '2026-11-09T09:50:00', allDay: false, location: 'MAIN HAL 103', eventSource: 'lms', eventType: 'sched', calendarName: '' });
  assert.deepEqual([cls.date, cls.start, cls.end, cls.title, cls.location, cls.kind, cls.calendar], ['2026-11-09', 540, 590, 'Intermediate Spanish I', 'SPAN 201-A, MAIN HAL 103', 'class', 'Classes']);
  const ath = F.mapApiEvent({ title: 'Grove City College Men&#39;s Basketball at Pitt-Greensburg', start: '2026-11-09T19:00:00', end: '2026-11-09T21:00:00', allDay: false, location: 'Greensburg, Pa.', eventSource: 'jics', eventType: 'default', calendarName: 'Athletics' });
  assert.deepEqual([ath.title, ath.location, ath.kind, ath.start, ath.end], ["Men's Basketball at Pitt-Greensburg", 'Athletics, Greensburg, Pa.', 'event', 1140, 1260]);
  const allDay = F.mapApiEvent({ title: 'Reading day', start: '2026-11-12T00:00:00', end: '2026-11-13T00:00:00', allDay: true, calendarName: 'Christian Formation calendar' });
  assert.deepEqual([allDay.date, allDay.start, allDay.allDay], ['2026-11-12', null, true]);
  assert.equal(F.mapApiEvent({ start: '2026-11-12T00:00:00' }), null);
});

parsers('events: relative Today and a title with no link', () => {
  const d = dom(portlet('cal', 'Events', '<div class="calendar-list-view"><div class="date">Today</div><div><span>All Day</span><span>No link event</span></div></div>'));
  const e = F.parseEvents(d, NOW);
  assert.deepEqual([e[0].date, e[0].title, e[0].href], ['2026-11-09', 'No link event', null]);
});

parsers('events: table fallback keeps the date for rows that omit it', () => {
  const d = dom(portlet('pt_CalendarPortlet', 'Upcoming events', `<table class="calendar-list-view"><tbody>
    <tr><td class="event-date">Today</td><td><a href="/ICS/a">One</a><div class="event-time">7:00 PM</div><div class="event-location">Hall</div></td></tr>
    <tr><td><a href="/ICS/b">Two</a><div class="event-time">All Day</div></td></tr></tbody></table>`));
  const e = F.parseEvents(d, NOW);
  assert.equal(e.length, 2);
  assert.deepEqual([e[0].date, e[0].start, e[0].location], ['2026-11-09', 1140, 'Hall']);
  assert.deepEqual([e[1].date, e[1].allDay, e[1].title], ['2026-11-09', true, 'Two']);
});

parsers('events: a bare month and day in late December means next year; max 60', () => {
  const dec = new Date(2026, 11, 28);
  const e = F.parseEvents(dom(portlet('cal', 'Events', '<div class="calendar-list-view"><div class="date">January 5</div><div><span>1 PM</span><span><a href="/ICS/x">New year</a></span></div></div>')), dec);
  assert.equal(e[0].date, '2027-01-05');
  const many = Array.from({ length: 70 }, (_, i) => `<div><span>1 PM</span><span><a href="/ICS/${i}">E${i}</a></span></div>`).join('');
  assert.equal(F.parseEvents(dom(portlet('cal', 'Events', `<div class="calendar-list-view"><div class="date">Today</div>${many}</div>`)), NOW).length, 60);
});

const forumPage = (rows) => `<div class="forum-grid" role="table"><div role="row" class="header-row"><span>Forum</span></div>${rows}</div>`;
const cell = (label, v) => `<div role="cell" class="forum-grid-column"><span class="forum-grid-header-label">${label}</span><div class="mobile-column-value">${v}</div></div>`;
const frow = (name, latest) => `<div role="row"><div role="cell" class="forum-grid-column"><div class="topic-link-container"><a href="/ICS/Campus_Life/Forums.jnz?portlet=Forums&amp;screen=TopicView&amp;t=${name}">${name}</a></div></div>${cell('Posts', '3')}${cell('Latest', latest)}</div>`;

parsers('forums: latest post per forum, attribution split, rows without a post skipped, max 8', () => {
  const d = dom(forumPage(
    frow('Campus', '<div class="post-link"><a href="/ICS/Campus_Life/Forums.jnz?portlet=Forums&amp;screen=PostView&amp;p=1">Welcome</a></div><div class="post-attribution">by Demo Student<br>on 11/9/2026 at 10:00 AM</div>') +
    frow('Empty', '') + frow('Study', '<div class="post-link"><a href="/ICS/p2">Groups</a></div><div class="post-attribution">by Jo Q. Public on Nov 8 at 9:15 PM</div>')));
  const f = F.parseForums(d);
  assert.equal(f.length, 2);
  assert.deepEqual(f[0], { forum: 'Campus', forumHref: O + '/ICS/Campus_Life/Forums.jnz?portlet=Forums&screen=TopicView&t=Campus', title: 'Welcome', href: O + '/ICS/Campus_Life/Forums.jnz?portlet=Forums&screen=PostView&p=1', by: 'Demo Student', when: '11/9/2026 at 10:00 AM' });
  assert.deepEqual([f[1].by, f[1].when], ['Jo Q. Public', 'Nov 8 at 9:15 PM']);
  const lots = Array.from({ length: 12 }, (_, i) => frow('F' + i, `<div class="post-link"><a href="/ICS/p${i}">T${i}</a></div>`)).join('');
  assert.equal(F.parseForums(dom(forumPage(lots))).length, 8);
});

parsers('forumsUrl: first same-origin forums link, else the fallback', () => {
  assert.equal(F.forumsUrl(dom('<a href="https://other.example/forums.jnz">x</a><a href="/ICS/Campus_Life/Forums.jnz?portlet=Forums&amp;screen=Main">y</a>')), '/ICS/Campus_Life/Forums.jnz?portlet=Forums&screen=Main');
  assert.equal(F.forumsUrl(dom('<a href="/ICS/Other">z</a>')), '/ICS/Campus_Life/Forums.jnz?portlet=Forums');
});

test('load never throws: an unknown key, or no signed-in user, resolves failed', async () => {
  assert.deepEqual(await F.load('nope'), { data: null, info: { failed: true } });
  assert.deepEqual(await F.load('homeFeed'), { data: null, info: { failed: true } }); // no document in Node
});

parsers('load: fresh, cached within the TTL, stale on failure, failed with nothing saved', async () => {
  const store = {};
  const realStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = { local: { get(k, cb) { cb({ [k]: store[k] }); }, set(o, cb) { Object.assign(store, o); if (cb) cb(); } } };
  globalThis.document = dom('<div id="welcomeBackBar">Welcome back Demo Student My profile</div>');
  globalThis.document.body.classList.add('logged-in');
  const realFetch = globalThis.fetch;
  let calls = 0, fail = false;
  globalThis.DOMParser = class { parseFromString(h) { return parseHTML(h).document; } };
  globalThis.fetch = async (url) => {
    calls++;
    if (fail) return { ok: false, status: 404 };
    assert.match(String(url), /^https:\/\/my\.gcc\.edu\/ICS\//);
    return { ok: true, status: 200, text: async () => forumPage(frow('Campus', '<div class="post-link"><a href="/ICS/p">Hi</a></div><div class="post-attribution">by A on B</div>')) };
  };
  try {
    let r = await F.load('forums');
    assert.deepEqual(r.info, {});
    assert.equal(r.data[0].title, 'Hi');
    assert.equal(store.forums.user, 'Demo Student');
    assert.equal(calls, 1);
    r = await F.load('forums');
    assert.equal(calls, 1); // served from the saved copy
    fail = true;
    r = await F.load('forums', true);
    assert.equal(calls, 2);
    assert.equal(r.info.stale, true);
    assert.equal(r.data[0].title, 'Hi');
    delete store.forums;
    r = await F.load('forums', true);
    assert.deepEqual(r, { data: null, info: { failed: true } });
    store.forums = { ts: Date.now(), user: 'Someone Else', data: [{ title: 'private' }] };
    fail = false;
    r = await F.load('forums');
    assert.equal(r.data[0].title, 'Hi'); // another person's saved copy is not used
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.DOMParser;
    delete globalThis.document;
    globalThis.chrome.storage = realStorage;
  }
});
