/**
 * Like to Love Collections (L2L Collections) — CMS v2 Frontend Adapter
 *
 * NOTE: the `LufaCms` object name, the `lufa*` localStorage keys and the
 * `window.__LUFA_*` bootstrap globals below are INTERNAL identifiers. They are
 * intentionally retained in Volume 1 — renaming them would require coordinated
 * edits across layout.php, api.js and app-legacy.js plus a cache-key migration,
 * with no public-facing benefit. See the Volume 1 report, "Retained internal
 * legacy identifiers".
 *
 * Provides:
 *   LufaCms.applySettings(settingsObj)   — wires contact/footer/social from lb_settings
 *   LufaCms.applySeoMeta(settingsObj)    — updates <title> and <meta> from settings
 *   LufaCms.applyContactInfo(settingsObj)— wires hardcoded contact details to settings values
 *   LufaCms.applyFooterSettings(settings)— wires footer content from settings
 *   LufaCms.applySocialLinks(settings)   — wires social icon hrefs from settings
 *   LufaCms.applyCopyrightText(settings) — updates copyright year and text
 */

const LufaCms = (() => {

    // ── Safe DOM setter ───────────────────────────────────────────

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el && value != null && value !== '') el.textContent = value;
    }

    function setHtml(id, value) {
        const el = document.getElementById(id);
        if (el && value != null && value !== '') el.innerHTML = value;
    }

    function setAttr(id, attr, value) {
        const el = document.getElementById(id);
        if (el && value != null && value !== '') el.setAttribute(attr, value);
    }

    function setHref(id, value) {
        const el = document.getElementById(id);
        if (el && value != null && value !== '') el.href = value;
    }

    function setQuerySelector(selector, value, prop = 'textContent') {
        const el = document.querySelector(selector);
        if (el && value != null && value !== '') el[prop] = value;
    }

    // ── SEO meta (updates <head> elements) ────────────────────────

    function applySeoMeta(settings) {
        if (!settings) return;

        // Page title
        const title = settings.seo_meta_title || settings.site_name;
        if (title) document.title = title;

        // Description meta
        const desc = settings.seo_meta_description;
        if (desc) {
            let metaDesc = document.querySelector('meta[name="description"]');
            if (!metaDesc) {
                metaDesc = document.createElement('meta');
                metaDesc.name = 'description';
                document.head.appendChild(metaDesc);
            }
            metaDesc.content = desc;
        }

        // Named meta tags driven by settings (keywords, author).
        // Server-rendered in layout.php; re-applied here so a settings change
        // is reflected without a full page rebuild.
        [
            ['keywords', settings.seo_meta_keywords],
            ['author',   settings.seo_meta_author],
        ].forEach(([name, content]) => {
            if (!content) return;
            let tag = document.querySelector(`meta[name="${name}"]`);
            if (!tag) {
                tag = document.createElement('meta');
                tag.name = name;
                document.head.appendChild(tag);
            }
            tag.content = content;
        });

        // Open Graph
        const ogTitle = settings.seo_og_title || settings.seo_meta_title;
        const ogDesc  = settings.seo_og_description || settings.seo_meta_description;
        // og:image must stay an ABSOLUTE URL — social crawlers cannot resolve a
        // site-relative path. layout.php renders it absolute; settings stores it
        // relative, so re-absolutise here rather than overwriting with the raw value.
        const ogImage = settings.seo_og_image
            ? new URL(settings.seo_og_image, document.baseURI).href
            : '';

        [
            ['og:title',       ogTitle],
            ['og:description', ogDesc],
            ['og:image',       ogImage],
            ['og:type',        'website'],
        ].forEach(([prop, content]) => {
            if (!content) return;
            let tag = document.querySelector(`meta[property="${prop}"]`);
            if (!tag) {
                tag = document.createElement('meta');
                tag.setAttribute('property', prop);
                document.head.appendChild(tag);
            }
            tag.content = content;
        });
    }

    // ── Contact info wiring ───────────────────────────────────────
    // Replaces the 5 hardcoded contact items identified in Phase 4

    function applyContactInfo(settings) {
        if (!settings) return;

        const phone     = settings.store_phone || settings.contact_phone || '';
        const email     = settings.contact_email || settings.site_email || '';
        const whatsapp  = settings.contact_whatsapp || settings.social_whatsapp || phone;
        const waLink    = whatsapp ? 'https://wa.me/' + whatsapp.replace(/\D/g, '') : '';

        // Header / main contact section links
        const phoneEl    = document.getElementById('contactPhone');
        const emailEl    = document.getElementById('contactEmail');
        const whatsappEl = document.getElementById('contactWhatsApp');

        if (phoneEl && phone) {
            const span = phoneEl.querySelector('span');
            if (span) span.textContent = phone;
            phoneEl.href = 'tel:' + phone.replace(/\s/g, '');
        }
        if (emailEl && email) {
            const span = emailEl.querySelector('span');
            if (span) span.textContent = email;
            emailEl.href = 'mailto:' + email;
        }
        if (whatsappEl && whatsapp) {
            const span = whatsappEl.querySelector('span');
            if (span) span.textContent = whatsapp;
            if (waLink) whatsappEl.href = waLink;
        }

        // Phone action buttons
        const phoneActionBtns   = document.querySelectorAll('[id="contactPhoneAction"]');
        const emailActionBtns   = document.querySelectorAll('[id="contactEmailAction"]');
        const waActionBtns      = document.querySelectorAll('[id="contactWhatsAppAction"]');

        phoneActionBtns.forEach(btn => {
            if (phone) btn.onclick = () => window.location.href = 'tel:' + phone.replace(/\s/g, '');
        });
        emailActionBtns.forEach(btn => {
            if (email) btn.onclick = () => window.location.href = 'mailto:' + email;
        });
        waActionBtns.forEach(btn => {
            if (waLink) btn.onclick = () => window.open(waLink, '_blank');
        });

        // Footer / modal contact info area
        const infoPhone = document.getElementById('contactInfoPhone');
        const infoEmail = document.getElementById('contactInfoEmail');
        if (infoPhone && phone) infoPhone.textContent = phone;
        if (infoEmail && email) infoEmail.textContent = email;
    }

    // ── Footer content wiring ─────────────────────────────────────

    function applyFooterSettings(settings) {
        if (!settings) return;

        const desc = settings.footer_description || settings.site_description;
        if (desc) setText('footerDescription', desc);

        const tagline = settings.footer_tagline;
        if (tagline) {
            // Footer tagline may appear in a <p class="footer-tagline"> element
            const tagEl = document.querySelector('.footer-tagline');
            if (tagEl) tagEl.textContent = tagline;
        }
    }

    // ── Social links wiring ───────────────────────────────────────

    function applySocialLinks(settings) {
        if (!settings) return;

        const links = {
            socialFacebook:  settings.social_facebook  || settings.facebook  || '',
            socialInstagram: settings.social_instagram || settings.instagram || '',
            socialTikTok:    settings.social_tiktok    || settings.tiktok    || '',
            socialLinkedIn:  settings.social_linkedin  || settings.linkedin  || '',
            socialWhatsApp:  settings.contact_whatsapp || settings.social_whatsapp || settings.whatsapp || '',
        };

        for (const [id, url] of Object.entries(links)) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (url) {
                el.href = url.startsWith('+') || /^\d/.test(url.trim())
                    ? 'https://wa.me/' + url.replace(/\D/g, '')
                    : url;
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        }
    }

    // ── Copyright text ────────────────────────────────────────────

    function applyCopyrightText(settings) {
        if (!settings) return;
        const copyright = settings.footer_copyright;
        if (!copyright) return;

        const el = document.getElementById('copyrightText');
        if (el) {
            // Rebuild: copyright text + " | Crafted by CraftSyteDesigns"
            el.innerHTML = '';
            el.appendChild(document.createTextNode(copyright + ' | Crafted by '));
            const link = document.createElement('a');
            link.href        = 'https://craftsytedesigns.com';
            link.target      = '_blank';
            link.rel         = 'noopener';
            link.style.color = 'var(--accent-gold)';
            link.textContent = 'CraftSyte Designs';
            el.appendChild(link);
        }
    }

    // ── Newsletter settings ───────────────────────────────────────

    function applyNewsletterSettings(settings) {
        if (!settings) return;
        // Newsletter title/subtitle are fed by applyCmsPages() via storefront.homepage
        // We only need to handle the enabled flag here
        const enabled = settings.newsletter_enabled !== '0';
        const stripEl = document.getElementById('homeNewsletterStrip');
        if (stripEl && !enabled) stripEl.style.display = 'none';
    }

    // ── Master apply (call after settings are loaded) ─────────────

    function applySettings(settings) {
        if (!settings) return;
        applySeoMeta(settings);
        applyContactInfo(settings);
        applyFooterSettings(settings);
        applySocialLinks(settings);
        applyCopyrightText(settings);
        applyNewsletterSettings(settings);
    }

    // ── Content version: update checkContentVersion to use API v2 ──

    async function checkContentVersionV2() {
        const STORAGE_KEY   = 'lufaContentVersion';
        const CACHE_KEYS    = [
            'lufa_products_v2', 'lufa_categories', 'lufa_cms_pages',
            'lufa_faqs', 'lufa_locations',
            'lufa_care', 'lufa_settings', 'lufa_community',
        ];

        try {
            const data = await LufaApi.getContentVersion();
            if (!data) return;

            const newHash  = data.hash || data.version || '';
            const oldHash  = localStorage.getItem(STORAGE_KEY) || '';

            if (newHash && newHash !== oldHash) {
                // Clear all caches
                CACHE_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
                localStorage.setItem(STORAGE_KEY, newHash);
            }
        } catch {
            // Non-fatal — app continues with existing cache
        }
    }

    return {
        applySettings,
        applySeoMeta,
        applyContactInfo,
        applyFooterSettings,
        applySocialLinks,
        applyCopyrightText,
        applyNewsletterSettings,
        checkContentVersionV2,
        setText,
        setHtml,
        setAttr,
        setHref,
    };
})();
