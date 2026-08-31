/**
 * Like to Love Collections — Analytics consent gate
 *
 * Phase 2 (2026-08-25).
 *
 * ── WHAT THIS ACTUALLY CONTROLS ─────────────────────────────────────────────
 * Whether a vendor's script is ever FETCHED.
 *
 * The common shape of a consent banner is to load every tracker on page load
 * and then tell them afterwards whether they were allowed. By then the vendor
 * has been contacted, cookies are set, and a page view has been reported — the
 * banner is decoration over something that already happened.
 *
 * Here the server emits no tracker script at all while the gate is active
 * (see app/Views/public/layout.php). Nothing is fetched until a decision for
 * that category exists, and rejecting means the request is simply never made.
 *
 * ── WHERE THE DECISION LIVES ────────────────────────────────────────────────
 * localStorage, on the visitor's own device. It is never sent to the server:
 * a consent record is a statement about a person, and this application has no
 * need to hold one. It stores the category decisions, the policy version they
 * were made against, and when.
 *
 * When the policy version changes and repromptOnChange is on, the stored
 * decision is treated as stale and the banner returns — an old "yes" is not
 * consent to something new.
 *
 * ── ACCESSIBILITY ───────────────────────────────────────────────────────────
 * The banner is a labelled dialog, focus moves into it, Tab is trapped inside
 * it while it is open, Escape rejects non-essential (the safe default, not the
 * permissive one), and focus returns to where it came from on close.
 *
 * ── NOT A COMPLIANCE CLAIM ──────────────────────────────────────────────────
 * These are the technical controls. Whether they satisfy a given jurisdiction,
 * and what the wording has to say, is a legal question nobody has answered
 * here. See docs/ANALYTICS_CONSENT.md.
 */
(function () {
    'use strict';

    var CONFIG = window.__L2L_CONSENT || null;
    if (!CONFIG || !CONFIG.active) {
        return;   // gate switched off entirely
    }

    var STORAGE_KEY = 'l2l.consent.v1';
    var NECESSARY   = 'necessary';
    var ANALYTICS   = 'analytics';
    var MARKETING   = 'marketing';

    // ── Stored decision ───────────────────────────────────────────────

    function readDecision() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) { return null; }

            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') { return null; }

            // A decision made against an older policy is stale. An old "yes" is
            // not consent to whatever the policy says now.
            if (CONFIG.repromptOnChange
                && String(parsed.policyVersion || '') !== String(CONFIG.policyVersion || '')) {
                return null;
            }

            return parsed;
        } catch (e) {
            // Private mode, disabled storage, corrupt value. Treat as undecided
            // — which withholds the trackers.
            return null;
        }
    }

    function writeDecision(categories) {
        var record = {
            categories:    categories,
            policyVersion: String(CONFIG.policyVersion || ''),
            decidedAt:     new Date().toISOString()
        };

        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        } catch (e) {
            // Storage unavailable: the decision applies to this page view only.
            // Better than refusing to honour it at all.
        }

        return record;
    }

    function granted(decision, category) {
        if (category === NECESSARY) { return true; }
        return !!(decision && decision.categories && decision.categories[category]);
    }

    // ── Loading a tracker ─────────────────────────────────────────────
    //
    // Each loader is the vendor's own snippet, moved here from the server
    // template unchanged apart from taking its id as an argument.

    var loaded = {};

    function loadScript(src, onReady) {
        var s = document.createElement('script');
        s.async = true;
        s.src = src;
        if (onReady) { s.onload = onReady; }
        var first = document.getElementsByTagName('script')[0];
        first.parentNode.insertBefore(s, first);
        return s;
    }

    var LOADERS = {
        gtm: function (id) {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
            loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id));
        },

        ga4: function (id) {
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
            loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id), function () {
                window.gtag('js', new Date());
                window.gtag('config', id);
            });
        },

        ms_clarity: function (id) {
            window.clarity = window.clarity || function () {
                (window.clarity.q = window.clarity.q || []).push(arguments);
            };
            loadScript('https://www.clarity.ms/tag/' + encodeURIComponent(id));
        },

        meta_pixel: function (id) {
            if (window.fbq) { return; }
            var n = window.fbq = function () {
                n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
            };
            if (!window._fbq) { window._fbq = n; }
            n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
            loadScript('https://connect.facebook.net/en_US/fbevents.js', function () {
                window.fbq('init', id);
                window.fbq('track', 'PageView');
            });
        },

        linkedin_insight: function (id) {
            window._linkedin_partner_id = id;
            window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
            window._linkedin_data_partner_ids.push(id);
            if (!window.lintrk) {
                window.lintrk = function (a, b) { window.lintrk.q.push([a, b]); };
                window.lintrk.q = [];
            }
            loadScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');
        },

        tiktok_pixel: function (id) {
            var t = 'ttq';
            window.TiktokAnalyticsObject = t;
            var ttq = window[t] = window[t] || [];
            ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off',
                           'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
            ttq.setAndDefer = function (obj, method) {
                obj[method] = function () { obj.push([method].concat(Array.prototype.slice.call(arguments, 0))); };
            };
            for (var i = 0; i < ttq.methods.length; i++) { ttq.setAndDefer(ttq, ttq.methods[i]); }
            loadScript('https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + encodeURIComponent(id) + '&lib=' + t,
                function () { ttq.page(); });
        }
    };

    /**
     * Load every tracker whose category has been granted.
     *
     * GTM additionally waits for MARKETING consent when the site also runs
     * marketing trackers: a container is a loader, and what it loads is
     * configured outside this application, so we cannot prove it carries no
     * advertising tag. Conservative on purpose.
     */
    function applyDecision(decision) {
        var pending = CONFIG.pending || {};

        Object.keys(pending).forEach(function (category) {
            if (!granted(decision, category)) { return; }

            (pending[category] || []).forEach(function (entry) {
                var name = entry.tracker;

                if (loaded[name]) { return; }

                if (name === 'gtm' && CONFIG.gtmNeedsMarketing && !granted(decision, MARKETING)) {
                    return;   // still waiting on marketing consent
                }

                var loader = LOADERS[name];
                if (typeof loader !== 'function') { return; }

                loaded[name] = true;
                try {
                    loader(entry.id);
                } catch (e) {
                    // A vendor snippet must never break the storefront.
                    loaded[name] = false;
                }
            });
        });
    }

    // ── Banner ────────────────────────────────────────────────────────

    var previousFocus = null;
    var bannerEl      = null;

    function closeBanner() {
        if (!bannerEl) { return; }
        bannerEl.remove();
        bannerEl = null;
        document.removeEventListener('keydown', onKeydown, true);
        if (previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        }
    }

    function decide(categories) {
        var decision = writeDecision(categories);
        closeBanner();
        applyDecision(decision);
        document.dispatchEvent(new CustomEvent('l2l:consent', { detail: decision }));
    }

    function acceptAll()  { decide({ analytics: true,  marketing: true }); }
    function rejectAll()  { decide({ analytics: false, marketing: false }); }

    function onKeydown(event) {
        if (!bannerEl) { return; }

        // Escape REJECTS rather than dismissing. Dismissing without a decision
        // would leave the banner returning on every page, and treating Escape
        // as acceptance would be taking silence for a yes.
        if (event.key === 'Escape') {
            event.preventDefault();
            rejectAll();
            return;
        }

        if (event.key !== 'Tab') { return; }

        var focusable = bannerEl.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) { return; }

        var first = focusable[0];
        var last  = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function buildBanner() {
        previousFocus = document.activeElement;

        var el = document.createElement('div');
        el.id = 'l2lConsent';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'l2lConsentTitle');
        el.setAttribute('aria-describedby', 'l2lConsentBody');
        el.style.cssText = [
            'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:9999',
            'background:#fff', 'color:#222', 'border-top:1px solid #d9d2c9',
            'box-shadow:0 -4px 24px rgba(0,0,0,.12)', 'padding:20px',
            'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
            'font-size:14px', 'line-height:1.6'
        ].join(';');

        el.innerHTML =
            '<div style="max-width:64rem;margin:0 auto;display:flex;gap:20px;flex-wrap:wrap;align-items:center;justify-content:space-between">' +
              '<div style="flex:1 1 22rem;min-width:16rem">' +
                '<h2 id="l2lConsentTitle" style="margin:0 0 6px;font-size:15px;font-weight:600">Cookies and measurement</h2>' +
                '<p id="l2lConsentBody" style="margin:0">' +
                  'We use cookies that are necessary for the shop to work. With your permission we would also ' +
                  'like to measure how the site is used, and to measure our advertising. You can change this at any time.' +
                '</p>' +
              '</div>' +
              '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
                '<button type="button" data-consent="reject" style="' + buttonStyle(false) + '">Reject non-essential</button>' +
                '<button type="button" data-consent="customise" style="' + buttonStyle(false) + '">Customise</button>' +
                '<button type="button" data-consent="accept" style="' + buttonStyle(true) + '">Accept all</button>' +
              '</div>' +
            '</div>';

        el.addEventListener('click', function (event) {
            var action = event.target && event.target.getAttribute
                ? event.target.getAttribute('data-consent')
                : null;

            if (action === 'accept')    { acceptAll(); }
            if (action === 'reject')    { rejectAll(); }
            if (action === 'customise') { showCustomise(el); }
        });

        document.body.appendChild(el);
        bannerEl = el;

        document.addEventListener('keydown', onKeydown, true);

        var firstButton = el.querySelector('button');
        if (firstButton) { firstButton.focus(); }
    }

    function buttonStyle(primary) {
        return [
            'padding:9px 16px', 'border-radius:6px', 'cursor:pointer', 'font-size:14px',
            'font-family:inherit', 'border:1px solid ' + (primary ? '#8a6a4b' : '#c9c0b5'),
            'background:' + (primary ? '#8a6a4b' : '#fff'),
            'color:' + (primary ? '#fff' : '#333')
        ].join(';');
    }

    function showCustomise(el) {
        var body = el.querySelector('#l2lConsentBody');
        if (!body || el.querySelector('#l2lConsentChoices')) { return; }

        var choices = document.createElement('div');
        choices.id = 'l2lConsentChoices';
        choices.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;gap:8px';

        choices.innerHTML =
            '<label style="display:flex;gap:8px;align-items:flex-start">' +
              '<input type="checkbox" checked disabled style="margin-top:3px">' +
              '<span><strong>Necessary</strong> — sign-in, your basket and security. Always on, because the shop ' +
              'cannot work without them.</span>' +
            '</label>' +
            '<label style="display:flex;gap:8px;align-items:flex-start">' +
              '<input type="checkbox" id="l2lConsentAnalytics" style="margin-top:3px">' +
              '<span><strong>Analytics</strong> — how the site is used, so we can improve it.</span>' +
            '</label>' +
            '<label style="display:flex;gap:8px;align-items:flex-start">' +
              '<input type="checkbox" id="l2lConsentMarketing" style="margin-top:3px">' +
              '<span><strong>Marketing</strong> — measuring our advertising.</span>' +
            '</label>' +
            '<div><button type="button" id="l2lConsentSave" style="' + buttonStyle(true) + '">Save choices</button></div>';

        body.parentNode.appendChild(choices);

        var save = choices.querySelector('#l2lConsentSave');
        save.addEventListener('click', function () {
            decide({
                analytics: !!choices.querySelector('#l2lConsentAnalytics').checked,
                marketing: !!choices.querySelector('#l2lConsentMarketing').checked
            });
        });

        var firstChoice = choices.querySelector('input:not([disabled])');
        if (firstChoice) { firstChoice.focus(); }
    }

    // ── Reopening preferences ─────────────────────────────────────────
    //
    // A decision must be changeable, so anything with
    // data-consent-reopen (a footer link) brings the banner back.
    function wireReopen() {
        document.addEventListener('click', function (event) {
            var trigger = event.target && event.target.closest
                ? event.target.closest('[data-consent-reopen]')
                : null;
            if (!trigger) { return; }

            event.preventDefault();
            if (!bannerEl) { buildBanner(); }
        });
    }

    window.L2LConsent = {
        decision:  readDecision,
        granted:   function (category) { return granted(readDecision(), category); },
        reopen:    function () { if (!bannerEl) { buildBanner(); } },
        categories: [NECESSARY, ANALYTICS, MARKETING]
    };

    // ── Start ─────────────────────────────────────────────────────────

    function start() {
        wireReopen();

        var decision = readDecision();

        if (decision) {
            applyDecision(decision);
            return;
        }

        if (CONFIG.mode === 'granted_by_default') {
            // The server already emitted the trackers in this mode; the banner
            // is the visitor's chance to withdraw rather than to grant.
            if (CONFIG.banner) { buildBanner(); }
            return;
        }

        // denied_by_default: nothing has loaded and nothing will until asked.
        if (CONFIG.banner) { buildBanner(); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
