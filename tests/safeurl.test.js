'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.js');

const X = load('lib.js'); // helpers.js sets location to https://my.gcc.edu/ICS/
const O = 'https://my.gcc.edu';
const SCHEDULE = '/ICS/Academics/Home.jnz?portlet=Student_Schedule';
const seen = new Set([O + SCHEDULE, O + '/ICS/Financial/Student_Accounts.jnz?portlet=CASHNet_My_Account_Info', O + '/ICS/Academics/Home.jnz?portlet=My_Degree_Progress', O + '/ICS/?tool=logout']);

test('a schedule portlet URL is allowed in every fetching mode', () => {
  assert.equal(X.safeUrl(SCHEDULE, 'prerender'), O + SCHEDULE);
  assert.equal(X.safeUrl(O + SCHEDULE, 'crawl'), O + SCHEDULE);
  assert.equal(X.safeUrl(SCHEDULE, 'ai', seen), O + SCHEDULE);
});

test('the #fragment is dropped from the result', () => {
  assert.equal(X.safeUrl(SCHEDULE + '#top', 'crawl'), O + SCHEDULE);
  assert.equal(X.safeUrl(SCHEDULE + '#top', 'ai', seen), O + SCHEDULE);
});

test('sign-out and other acting URLs are refused', () => {
  for (const mode of ['prerender', 'crawl', 'ai']) {
    assert.equal(X.safeUrl('/ICS/?tool=logout', mode, seen), null, mode);
    assert.equal(X.safeUrl('/ICS/Forums/Post.jnz?action=delete&id=4', mode, seen), null, mode);
    assert.equal(X.safeUrl('/ICS/Forums/Post.jnz?ACTION=Delete', mode, seen), null, mode);
    assert.equal(X.safeUrl('/ICS/Academics/Home.jnz?portlet=AddDrop_Courses', mode, seen), null, mode);
    assert.equal(X.safeUrl('/ICS/Logoff.aspx', mode, seen), null, mode);
    assert.equal(X.safeUrl('/ICS/x.jnz?do=%64elete', mode, seen), null, mode); // percent-encoded "delete"
    assert.equal(X.safeUrl('/ICS/Withdraw/Form.jnz', mode, seen), null, mode);
  }
});

test('files are refused', () => {
  for (const mode of ['prerender', 'crawl', 'ai']) {
    assert.equal(X.safeUrl('/ICS/icsfs/Handbook.pdf', mode, seen), null, mode);
    assert.equal(X.safeUrl('/ICS/icsfs/Roster.CSV?x=1', mode, seen), null, mode);
    assert.equal(X.safeUrl('/ICS/icsfs/photo.jpeg', mode, seen), null, mode);
  }
});

test('off-site URLs and pages outside /ICS/ are refused', () => {
  for (const mode of ['prerender', 'crawl', 'ai']) {
    assert.equal(X.safeUrl('https://evil.example/ICS/Academics/', mode, seen), null, mode);
    assert.equal(X.safeUrl('//evil.example/ICS/', mode, seen), null, mode);
    assert.equal(X.safeUrl('http://my.gcc.edu/ICS/', mode, seen), null, mode); // other scheme = other origin
    assert.equal(X.safeUrl('/Other/Page.aspx', mode, seen), null, mode);
    assert.equal(X.safeUrl('/ICSx/Page.aspx', mode, seen), null, mode);
  }
});

test('javascript: URLs are refused in any letter case, in every mode', () => {
  for (const mode of ['nav', 'prerender', 'crawl', 'ai']) {
    assert.equal(X.safeUrl('JavaScript:alert(1)', mode, mode === 'ai' ? seen : undefined), null, mode);
    assert.equal(X.safeUrl('javascript:__doPostBack(\'a\',\'\')', mode, mode === 'ai' ? seen : undefined), null, mode);
    assert.equal(X.safeUrl('  jAvAsCrIpT:void(0)', mode, mode === 'ai' ? seen : undefined), null, mode);
  }
  assert.equal(X.safeUrl('data:text/html,hi', 'nav'), null);
  assert.equal(X.safeUrl('mailto:registrar@gcc.edu', 'nav'), null);
});

test('nav mode keeps ordinary links, on-site and off-site, including Add/Drop', () => {
  assert.equal(X.safeUrl('/ICS/Academics/Home.jnz?portlet=AddDrop_Courses', 'nav', O + '/ICS/'), O + '/ICS/Academics/Home.jnz?portlet=AddDrop_Courses');
  assert.equal(X.safeUrl('Academics/', 'nav', O + '/ICS/'), O + '/ICS/Academics/');
  assert.equal(X.safeUrl('https://www.gcc.edu/library', 'nav', O + '/ICS/'), 'https://www.gcc.edu/library');
});

test('ai mode refuses financial and GPA pages even when the run has seen them', () => {
  assert.equal(X.safeUrl('/ICS/Financial/Student_Accounts.jnz?portlet=CASHNet_My_Account_Info', 'ai', seen), null);
  assert.equal(X.safeUrl('/ICS/Financial/', 'ai', new Set([O + '/ICS/Financial/'])), null);
  assert.equal(X.safeUrl('/ICS/Portlets/CRM/Student/Portlet.CASHNetAccountInfo/CashNetLink.aspx', 'ai', new Set([O + '/ICS/Portlets/CRM/Student/Portlet.CASHNetAccountInfo/CashNetLink.aspx'])), null);
  assert.equal(X.safeUrl('/ICS/Academics/Home.jnz?portlet=My_Degree_Progress', 'ai', seen), null);
  // the same pages are still fine for the crawler-independent modes that never send text anywhere
  assert.equal(X.safeUrl('/ICS/Academics/Home.jnz?portlet=My_Degree_Progress', 'prerender'), O + '/ICS/Academics/Home.jnz?portlet=My_Degree_Progress');
});

test('ai mode refuses a URL the run has not seen', () => {
  assert.equal(X.safeUrl('/ICS/Campus_Life/Chapel.jnz', 'ai', seen), null);
  assert.equal(X.safeUrl('/ICS/Campus_Life/Chapel.jnz', 'ai'), null); // no set at all
  assert.equal(X.safeUrl('/ICS/Campus_Life/Chapel.jnz', 'ai', new Set([O + '/ICS/Campus_Life/Chapel.jnz'])), O + '/ICS/Campus_Life/Chapel.jnz');
});

test('unparseable input returns null instead of throwing', () => {
  assert.equal(X.safeUrl('http://[bad', 'crawl'), null);
  assert.equal(X.safeUrl(null, 'ai', seen), null);
  assert.equal(X.safeUrl(undefined, 'prerender'), null);
});
