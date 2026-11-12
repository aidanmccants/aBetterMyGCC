'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.js');

const X = load('lib.js', 'weekcal.js');
const W = X.weekcal;
const WED = new Date(2026, 10, 11, 14, 30); // Wednesday 11 Nov 2026, 2:30 PM
const count = (html, re) => (html.match(re) || []).length;

test('weekDays gives Monday to Sunday for any day of the week, including Sunday', () => {
  for (const d of [new Date(2026, 10, 9), WED, new Date(2026, 10, 15, 23, 59)]) {
    const days = W.weekDays(d);
    assert.equal(days.length, 7);
    assert.deepEqual(days.map(W.ymd), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    assert.equal(days[0].getHours(), 0);
  }
});

test('weekDays crosses month and year boundaries', () => {
  assert.deepEqual(W.weekDays(new Date(2026, 0, 1)).map(W.ymd), ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
});

test('ymd is local and zero padded', () => {
  assert.equal(W.ymd(new Date(2026, 2, 5, 23, 59)), '2026-03-05');
});

test('an empty week still renders the grid plus the empty line', () => {
  const html = W.render([], { weekOf: WED, today: WED });
  assert.match(html, /^<div class="gccx-wk" data-hide="" role="group" aria-label="Week calendar"/);
  assert.equal(count(html, /class="gccx-wk-day/g), 7);
  assert.match(html, /class="gccx-wk-empty">Nothing scheduled this week</);
});

test('label, compact and today marking', () => {
  const html = W.render([], { weekOf: WED, today: WED, label: 'Campus "events"', compact: true });
  assert.match(html, /aria-label="Campus &quot;events&quot;"/);
  assert.match(html, /class="gccx-wk is-compact"/);
  assert.equal(count(html, /gccx-wk-day is-today/g), 1);
  assert.match(html, /gccx-wk-day is-today[^>]*data-date="2026-11-11"/);
  assert.equal(count(html, /gccx-wk-now/g), 1); // 2:30 PM is inside 8 to 18
});

test('items land in their day with kind classes, a time and escaped text', () => {
  const html = W.render([
    { date: '2026-11-10', start: 600, end: 660, title: 'Intro <b>Bio</b>', sub: 'Room "7"', kind: 'class' },
    { date: '2026-11-12', start: null, end: null, title: 'Food drive', kind: 'event' },
    { date: '2026-11-30', start: 600, end: 660, title: 'Next month', kind: 'event' },
  ], { weekOf: WED, today: WED });
  assert.match(html, /is-class/);
  assert.match(html, /Intro &lt;b&gt;Bio&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Bio/);
  assert.match(html, /Room &quot;7&quot;/);
  assert.match(html, /10–11 AM/);
  assert.doesNotMatch(html, /Next month/);
  assert.doesNotMatch(html, /gccx-wk-empty/);
  // the all-day item sits in the all-day strip, not the timed body
  assert.match(html, /gccx-wk-allday"><div class="gccx-wk-item is-event"[^>]*>(?:(?!<\/div>).)*Food drive/);
});

test('hour range is 8 to 18 by default and grows to fit items', () => {
  assert.match(W.render([], { weekOf: WED, today: WED }), /--wk-n:10;/);
  const html = W.render([{ date: '2026-11-09', start: 6 * 60 + 30, end: 7 * 60, title: 'Early', kind: 'event' }, { date: '2026-11-09', start: 19 * 60, end: 20 * 60 + 15, title: 'Late', kind: 'event' }], { weekOf: WED, today: WED });
  assert.match(html, /--wk-n:15;/); // 6 AM to 9 PM
  assert.match(html, /<span>6 AM<\/span>/);
  assert.match(html, /<span>8 PM<\/span>/);
});

test('overlapping items share the day side by side; separate ones keep full width', () => {
  const html = W.render([
    { date: '2026-11-12', start: 810, end: 900, title: 'A', kind: 'event' },
    { date: '2026-11-12', start: 840, end: 960, title: 'B', kind: 'event' },
    { date: '2026-11-12', start: 1000, end: 1060, title: 'C', kind: 'event' },
  ], { weekOf: WED, today: WED });
  assert.equal(count(html, /--l:0\.000%;--w:50\.000%/g), 1);
  assert.equal(count(html, /--l:50\.000%;--w:50\.000%/g), 1);
  assert.equal(count(html, /--l:0\.000%;--w:100\.000%/g), 1);
});

test('items without an end get an hour; the now-line only shows on today', () => {
  const html = W.render([{ date: '2026-11-13', start: 18 * 60, end: null, title: 'Movie', kind: 'event' }], { weekOf: WED, today: new Date(2026, 10, 13, 9, 0) });
  assert.match(html, /6 PM/);
  assert.match(html, /gccx-wk-day is-today[^>]*data-date="2026-11-13"/);
  assert.equal(count(html, /gccx-wk-now/g), 1);
  assert.equal(count(W.render([], { weekOf: WED, today: new Date(2026, 10, 25) }), /gccx-wk-now|is-today/g), 0);
});

test('days: 5 shows Mon to Fri, and adds Saturday or Sunday only when they have items', () => {
  assert.equal(count(W.render([], { weekOf: WED, today: WED, days: 5 }), /class="gccx-wk-day/g), 5);
  const html = W.render([{ date: '2026-11-14', start: 660, end: 780, title: 'Service', kind: 'event' }], { weekOf: WED, today: WED, days: 5 });
  assert.equal(count(html, /class="gccx-wk-day/g), 6);
  assert.match(html, /--wk-days:6/);
  assert.equal(count(W.render([], { weekOf: WED, today: WED }), /class="gccx-wk-day/g), 7);
});

test('links go through safeUrl: javascript: is dropped, relative paths become absolute', () => {
  const html = W.render([
    { date: '2026-11-09', start: 600, end: 660, title: 'Safe', href: '/ICS/Campus_Life/Events.jnz?a=1&b=2', kind: 'event' },
    { date: '2026-11-09', start: 700, end: 760, title: 'Bad', href: 'javascript:alert(1)', kind: 'event' },
  ], { weekOf: WED, today: WED });
  assert.match(html, /<a class="gccx-wk-item is-event" href="https:\/\/my\.gcc\.edu\/ICS\/Campus_Life\/Events\.jnz\?a=1&amp;b=2"/);
  assert.equal(count(html, /<a class="gccx-wk-item/g), 1);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /<div class="gccx-wk-item is-event"[^>]*>(?:(?!<\/div>).)*Bad/);
});

test('bad input does not throw', () => {
  assert.doesNotThrow(() => W.render(null, null));
  assert.doesNotThrow(() => W.render([null, {}, { date: '2026-11-09', title: 'x', start: NaN }], { weekOf: 'nope', today: 'nope' }));
  assert.equal(W.weekDays(undefined).length, 7);
});

// ---- board refinements ----
const BOARD = { weekOf: WED, layout: 'board' };
const THU_AM = new Date(2026, 10, 12, 9, 0); // Thursday 9:00 AM
const ev = (date, start, end, title, extra) => ({ date, start, end, title, kind: 'event', ...extra });

test('board block keeps time, title, place in that DOM order', () => {
  const html = W.render([ev('2026-11-12', 600, 660, 'Talk', { sub: 'Athletics, Hall', place: 'Hall' })], { ...BOARD, today: THU_AM });
  assert.match(html, /gccx-wk-time">10–11 AM<span class="gccx-wk-badge">Next<\/span><\/span><strong class="gccx-wk-title">Talk<\/strong><span class="gccx-wk-sub">Hall<\/span>/);
  assert.match(html, /title="10–11 AM · Talk · Athletics · Hall"/);
});

test('place line falls back to sub, and is escaped', () => {
  const html = W.render([ev('2026-11-12', 600, 660, 'A', { sub: '<i>Room</i>' })], { ...BOARD, today: THU_AM });
  assert.match(html, /gccx-wk-sub">&lt;i&gt;Room&lt;\/i&gt;</);
});

test('titles lose leading bracket tags (display only)', () => {
  assert.equal(W.tidyTitle('[L] [W] Women\'s Soccer'), "Women's Soccer");
  assert.equal(W.tidyTitle('[L]'), '[L]');
  assert.equal(W.tidyTitle('Plan [B] ahead'), 'Plan [B] ahead');
  const html = W.render([ev('2026-11-12', 600, 660, '[L] Chess club')], { ...BOARD, today: THU_AM });
  assert.match(html, /<strong class="gccx-wk-title">Chess club</);
});

test('only the first unfinished block today is marked: Next before it starts, Now once it has', () => {
  const items = [ev('2026-11-12', 540, 600, 'Done'), ev('2026-11-12', 720, 780, 'Later'), ev('2026-11-12', 660, 700, 'Soon'), ev('2026-11-13', 600, 660, 'Tomorrow')];
  let html = W.render(items, { ...BOARD, today: THU_AM }); // 9:00: "Done" has begun
  assert.equal(count(html, /gccx-wk-badge/g), 1);
  assert.match(html, /is-now[^>]*>(?:(?!<\/div>).)*Now<\/span>(?:(?!<\/div>).)*Done/);
  html = W.render(items, { ...BOARD, today: new Date(2026, 10, 12, 10, 30) });
  assert.equal(count(html, /gccx-wk-badge/g), 1);
  assert.match(html, /is-past[^>]*>(?:(?!<\/div>).)*Done/);
  assert.match(html, /is-next[^>]*>(?:(?!<\/div>).)*Next<\/span><\/span><strong class="gccx-wk-title">Soon/);
  assert.equal(count(W.render(items, { ...BOARD, today: new Date(2026, 10, 12, 23, 0) }), /gccx-wk-badge/g), 0);
  assert.equal(count(W.render(items, { ...BOARD, today: new Date(2026, 10, 20, 9, 0) }), /gccx-wk-badge/g), 0); // other week
});

test('a cancelled block is never the next one', () => {
  const html = W.render([ev('2026-11-12', 660, 700, 'Off', { cancelled: true }), ev('2026-11-12', 720, 780, 'On')], { ...BOARD, today: THU_AM });
  assert.match(html, /is-next[^>]*>(?:(?!<\/div>).)*On</);
  assert.equal(count(html, /gccx-wk-badge/g), 1);
});

test('collapsePast folds days before today in the current week only', () => {
  const items = [ev('2026-11-09', 600, 660, 'A'), ev('2026-11-09', 700, 760, 'B'), ev('2026-11-12', 600, 660, 'C')];
  const html = W.render(items, { ...BOARD, today: THU_AM, collapsePast: true });
  assert.equal(count(html, /is-collapsed/g), 3); // Mon, Tue, Wed
  assert.match(html, /<button type="button" class="gccx-wk-head gccx-wk-fold" data-fold="2026-11-09" aria-expanded="false" aria-label="Mon, Nov 9, 2 events">/);
  assert.match(html, /gccx-wk-count" aria-hidden="true">2</);
  assert.match(html, /data-fold="2026-11-11"[^>]*aria-label="Wed, Nov 11, no events"/);
  assert.equal(count(html, /data-fold/g), 3);
  assert.match(html, /--wk-tpl:var\(--wk-fold, 52px\) var\(--wk-fold, 52px\) var\(--wk-fold, 52px\) minmax/);
  // opened ones keep a button that reads expanded and are not narrow
  const open = W.render(items, { ...BOARD, today: THU_AM, collapsePast: true, openPast: ['2026-11-09'] });
  assert.equal(count(open, /is-collapsed/g), 2);
  assert.match(open, /data-fold="2026-11-09" aria-expanded="true"/);
  // off by default; other weeks and the week without today show all days
  assert.doesNotMatch(W.render(items, { ...BOARD, today: THU_AM }), /data-fold|is-collapsed/);
  assert.doesNotMatch(W.render(items, { ...BOARD, today: new Date(2026, 10, 23), collapsePast: true }), /data-fold|is-collapsed/);
  assert.doesNotMatch(W.render(items, { ...BOARD, today: new Date(2026, 10, 2), collapsePast: true }), /data-fold|is-collapsed/);
});
