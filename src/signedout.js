// "You're signed out" view. When myGCC shows its signed-out page, this covers
// it with a short full-screen view that starts the college sign-in, or lets the
// person carry on as a guest. Styles: src/signedout.css.
(function () {
  'use strict';

  const OVERLAY_ID = 'gccx-signedout';
  const TITLE_ID = 'gccx-signedout-title';
  const LEDE_ID = 'gccx-signedout-lede';
  const LOCK_CLASS = 'gccx-signedout-open';
  const GUEST_KEY = 'gccx-guest';
  const ONBOARDING_ID = 'gccx-onboarding';
  const ONBOARDING_DONE = 'gccx:onboarding-done';
  const LOGIN_TOGGLE_ID = 'siteNavBar_welcomeBackBarLoggedOut_loginToggle';
  const LOGIN_CONTINUE_ID = 'siteNavBar_welcomeBackBarLoggedOut_JicsLoginRedirectContinue';
  const LOGIN_SIMPLE_ID = 'jics-login-redirect-simple-button';
  const CONTINUE_DELAY_MS = 150;
  const FALLBACK_MS = 4000;

  let fallbackTimer = null;
  let waitingForOnboarding = false;

  // The look can be switched off from the popup. content.js mirrors the
  // settings into localStorage so they can be read before the page renders.
  function lookEnabled() {
    try {
      const settings = JSON.parse(localStorage.getItem('gccx-settings') || '{}');
      return !(settings && settings.enabled === false);
    } catch (e) {
      return true;
    }
  }

  function isGuest() {
    try {
      return sessionStorage.getItem(GUEST_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function isSignedOut() {
    return !document.body.classList.contains('logged-in') &&
      !!document.getElementById(LOGIN_TOGGLE_ID);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Show the view now, or once the first-run welcome screen has closed.
  function maybeShow() {
    if (!lookEnabled() || isGuest() || !isSignedOut()) return;
    if (document.getElementById(OVERLAY_ID)) return;

    if (document.getElementById(ONBOARDING_ID)) {
      if (!waitingForOnboarding) {
        waitingForOnboarding = true;
        window.addEventListener(ONBOARDING_DONE, () => {
          waitingForOnboarding = false;
          maybeShow();
        }, { once: true });
      }
      return;
    }
    show();
  }

  function show() {
    const overlay = el('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', TITLE_ID);
    overlay.setAttribute('aria-describedby', LEDE_ID);

    const card = el('div', 'gccx-so-card');

    const title = el('h1', 'gccx-so-title', "You're signed out");
    title.id = TITLE_ID;

    const lede = el('p', 'gccx-so-lede',
      'Sign in with your Grove City account to see your classes, chapel, and more.');
    lede.id = LEDE_ID;

    const signIn = el('button', 'gccx-so-primary', 'Sign in');
    signIn.type = 'button';

    const guest = el('button', 'gccx-so-link', 'Continue without signing in');
    guest.type = 'button';

    card.append(title, lede, signIn, guest);
    overlay.append(el('div', 'gccx-so-brand', 'myGCC'), card);

    signIn.addEventListener('click', () => startSignIn(signIn));
    guest.addEventListener('click', continueAsGuest);

    document.body.appendChild(overlay);
    document.documentElement.classList.add(LOCK_CLASS);
    document.addEventListener('focusin', keepFocusInside, true);
    signIn.focus();
  }

  // Keep keyboard focus inside the dialog while it is open (aria-modal).
  function keepFocusInside(event) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay || overlay.contains(event.target)) return;
    const target = overlay.querySelector('.gccx-so-primary:not(:disabled)') ||
      overlay.querySelector('.gccx-so-link');
    if (target) target.focus();
  }

  function startSignIn(button) {
    button.disabled = true;
    button.textContent = 'Opening sign-in…';

    // Hand off to myGCC's own sign-in: its college SSO redirect button when it
    // exists, otherwise its login toggle followed by the redirect continue button.
    const simple = document.getElementById(LOGIN_SIMPLE_ID);
    if (simple) {
      simple.click();
    } else {
      const toggle = document.getElementById(LOGIN_TOGGLE_ID);
      if (toggle) toggle.click();
      setTimeout(() => {
        const next = document.getElementById(LOGIN_CONTINUE_ID);
        if (next) next.click();
      }, CONTINUE_DELAY_MS);
    }

    // If myGCC has not navigated away after a few seconds, step aside so the
    // person can use myGCC's own sign-in form.
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      button.disabled = false;
      button.textContent = 'Sign in';
      hide();
    }, FALLBACK_MS);
  }

  function continueAsGuest() {
    try {
      sessionStorage.setItem(GUEST_KEY, '1');
    } catch (e) {
      // Storage is blocked. The view still goes away for this visit.
    }
    hide();
  }

  function hide() {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    document.documentElement.classList.remove(LOCK_CLASS);
    document.removeEventListener('focusin', keepFocusInside, true);
  }

  // Signing out must not leave one person's myGCC data on the computer for the next person.
  // These chrome.storage.local keys hold what was read from the signed-in person's pages
  // (schedule, degree progress and GPA, balance, chapel, the search index, a registration job).
  // Kept on purpose: settings, ai, onboarding, whatsnewSeen, menu:* (not personal), and plans,
  // planTerm and termOptions (a course plan is built over several sessions; they are filed
  // under the person's name and hold course sections only). See docs/STATE_MACHINES.md.
  const USER_KEYS = ['schedule', 'degree', 'standing', 'balance', 'chapel', 'registration', 'nav', 'pageIndex', 'job', 'degreeMap', 'registered'];
  function clearUserData() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
      chrome.storage.local.get(USER_KEYS, (found) => {
        if (chrome.runtime.lastError || !found) return;
        const cleared = USER_KEYS.filter((k) => found[k] != null);
        if (!cleared.length) return;
        const job = found.job ? { state: found.job.state || found.job.phase, queue: found.job.queue } : undefined;
        chrome.storage.local.remove(cleared, () => {
          void chrome.runtime.lastError;
          if (window.GCCX && window.GCCX.log) window.GCCX.log('info', 'content', 'Signed out: cleared saved myGCC data', { cleared, kept: ['plans', 'planTerm', 'termOptions', 'settings', 'ai'], job });
        });
      });
    } catch (e) { /* extension reloading: the next signed-out page clears it */ }
  }

  function init() {
    // Runs whether or not the look is on, and for guests too: the data is there either way.
    if (isSignedOut()) clearUserData();
    // Wait one tick after DOMContentLoaded so the welcome screen's listeners
    // get to add #gccx-onboarding before this checks for it.
    setTimeout(maybeShow, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
