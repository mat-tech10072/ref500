/**
 * Like to Love Collections (L2L Collections) -- Frontend Application (Phase 5 Extract)
 * Extracted from the original application and adapted for static hosting.
 */

// -- Boot-time scroll lock --
// body.app-booting is deliberately kept visible (no visibility:hidden) so the
// hero appears immediately without a blank flash.  The trade-off is that the
// browser can paint a restored scroll position (e.g. "Our Story") before JS
// corrects it.  We prevent that by:
//   1. Setting history.scrollRestoration = 'manual' (disables browser restore)
//   2. Locking html overflow:hidden so any residual scroll is invisible
//   3. Resetting scrollY to 0 immediately
// finalizeInitialRender() releases the overflow lock right before the page
// becomes interactive, so the lock is held for < 50 ms in practice.
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
document.documentElement.style.overflow = 'hidden'; // lock viewport during boot
window.scrollTo(0, 0);
        // ============================================
        // API CONFIGURATION
        // ============================================
        // ============================================
        // APP STATE
        // ============================================
        let currentPage = 'home';
        let currentCategory = 'all';
        let cart = [];
        let selectedProduct = null;
        let selectedSize = null;
        let selectedFumigation = false;
        let shippingOption = 'quote';
        /* dark mode removed in Stage 1 redesign */
        let isLoading = false;
        let isQuoteRequest = false;
        let productsLoaded = false;
        let pendingCategory = null;
        let _productsFetchPromise = null;

        let productsCache = {
            data: null,
            timestamp: null,
            ttl: 0
        };
        const PRODUCTS_CACHE_KEY = 'products_v2';

        // ============================================
        // CONTENT VERSION -- CACHE BUSTER
        // ============================================
        // Tracks the server's MAX(updated_at) across all content documents.
        // When the admin saves anything, this changes. On the next public page load
        // all localStorage caches are cleared and API calls get a new _cv param
        // (cache-miss on the browser HTTP cache too).
        let contentVersion = '';
        const CONTENT_VERSION_STORAGE_KEY = 'lufa__content_ver';

        function clearVersionedContentCaches() {
            const exactKeys = [
                'categories',
                'faqs',
                'careInstructions',
                'settings',
                'latestUpdates'
            ];
            const prefixKeys = [
                'cmsPages_v3_',
                'dedicatedPages_v1_',
                'legalPages_v2_'
            ];

            exactKeys.forEach(key => lsCache.clear(key));

            try {
                for (let i = localStorage.length - 1; i >= 0; i -= 1) {
                    const storageKey = localStorage.key(i);
                    if (!storageKey || !storageKey.startsWith('lufa_')) continue;

                    const cacheKey = storageKey.slice(5);
                    if (prefixKeys.some(prefix => cacheKey.startsWith(prefix))) {
                        localStorage.removeItem(storageKey);
                    }
                }
            } catch (_) { /* non-fatal */ }

            productsCache.data = null;
            productsCache.timestamp = null;
            productsLoaded = false;
            _productsFetchPromise = null;
        }

        async function checkContentVersion() {
            try {
                let versionData = null;

                if (window.__LUFA_USE_V2 && typeof LufaApi !== 'undefined' && LufaApi.getContentVersion) {
                    versionData = await LufaApi.getContentVersion();
                }

                if (!versionData) return;

                const newHash = versionData.hash || versionData.version || '';
                const oldHash = localStorage.getItem(CONTENT_VERSION_STORAGE_KEY) || '';

                contentVersion = versionData.version || newHash || '';

                if (newHash && newHash !== oldHash) {
                    clearVersionedContentCaches();
                    localStorage.setItem(CONTENT_VERSION_STORAGE_KEY, newHash);
                }
            } catch (_) { /* non-fatal - continue with existing cache */ }
        }
        const LUFA_CACHE_VERSION = '20260705c'; // Bumped: 2026-07-05 dedicated page content refresh + updates copy fallback
        const lsCache = {
            get(key, ttlMs) {
                try {
                    const raw = localStorage.getItem('lufa_' + key);
                    if (!raw) return null;
                    const item = JSON.parse(raw);
                    if (item.ver !== LUFA_CACHE_VERSION) return null;
                    if (Date.now() - item.ts > ttlMs) return null;
                    return item.data;
                } catch { return null; }
            },
            set(key, data) {
                try {
                    localStorage.setItem('lufa_' + key, JSON.stringify({
                        data, ts: Date.now(), ver: LUFA_CACHE_VERSION
                    }));
                } catch {}
            },
            clear(key) {
                try { localStorage.removeItem('lufa_' + key); } catch {}
            }
        };
        
        // Data stores
        let products = [];
        let categories = Array.isArray(window.__LUFA_BOOTSTRAP_CATEGORIES)
            ? [...window.__LUFA_BOOTSTRAP_CATEGORIES]
            : [];
        let faqs = [];
        let careInstructions = [];
        // Pre-seed settings from server-injected data (avoids blank contact details on first paint)
        let settings = (window.__LUFA_SETTINGS && Object.keys(window.__LUFA_SETTINGS).length > 0)
            ? window.__LUFA_SETTINGS
            : {};
        let cmsPages = window.__LUFA_BOOTSTRAP_CMS || { hero: {}, about: {}, storefront: {} };
        let dedicatedPagesCms = window.__LUFA_BOOTSTRAP_DEDICATED_PAGES || {};
        let socialPosts = [];
        let filteredProducts = [];
        let currentSearchResults = [];
        
        // Track active navigation link
        let activeNavLink = null;

        // Flag to prevent multiple quote downloads
        let isDownloadingQuote = false;

        // Legal pages content
        let legalPages = { terms: { content: '' }, privacy: { content: '' }, delivery: { content: '' }, returns: { content: '' }, export: { content: '' } };

        // Store last order data for receipt generation
        let lastOrderData = null;
        let lastQuoteData = null;
        const ROUTABLE_PAGES = new Set([
            'home', 'shop', 'blog', 'faqs', 'care',
            'terms', 'privacy', 'delivery', 'returns', 'export'
        ]);
        const HOME_SECTION_HASHES = new Set(['hero', 'about', 'contact']);

        function getNormalizedHashTarget(hashValue = window.location.hash) {
            return String(hashValue || '')
                .replace(/^#/, '')
                .trim()
                .toLowerCase();
        }

        function resolvePageFromHash(hashValue = window.location.hash) {
            const hashTarget = getNormalizedHashTarget(hashValue);
            return ROUTABLE_PAGES.has(hashTarget) ? hashTarget : 'home';
        }

        function resolveHistoryHash(page, href = '') {
            if (page !== 'home' && ROUTABLE_PAGES.has(page)) {
                return `#${page}`;
            }

            if (typeof href === 'string' && href.startsWith('#')) {
                const homeTarget = getNormalizedHashTarget(href);
                if (HOME_SECTION_HASHES.has(homeTarget) && homeTarget !== 'hero') {
                    return `#${homeTarget}`;
                }
            }

            return '';
        }

        function syncBrowserRoute(page, href = '') {
            const nextHash = resolveHistoryHash(page, href);
            const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;

            if (window.location.hash !== nextHash) {
                history.pushState(null, '', nextUrl);
            }
        }

        function scrollHomeSectionIntoView(hashValue = window.location.hash) {
            const hashTarget = getNormalizedHashTarget(hashValue);
            if (!HOME_SECTION_HASHES.has(hashTarget) || hashTarget === 'hero') return;

            const target = document.getElementById(hashTarget);
            if (!target) return;

            const headerHeight = document.querySelector('header')?.offsetHeight || 0;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
            window.scrollTo({ top: targetPosition, behavior: 'smooth' });
        }

        function setHeroVisibility(isVisible) {
            const heroSection = document.getElementById('hero');
            if (!heroSection) return;

            heroSection.classList.toggle('hero-visible', Boolean(isVisible));
        }

        function handleRouteChangeFromHash() {
            const targetPage = resolvePageFromHash();
            showPage(targetPage, { updateHash: false });

            if (targetPage === 'home') {
                setTimeout(() => {
                    scrollHomeSectionIntoView();
                }, 100);
            }
        }

        // ============================================
        // INITIALIZATION
        document.addEventListener('DOMContentLoaded', function() {
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            document.body.style.overflow = 'auto';
            if (typeof window.__LUFA_SETTINGS !== 'undefined' && typeof LufaCms !== 'undefined') {
                LufaCms.applySettings(window.__LUFA_SETTINGS);
            }
            initializeApp();

            const splashEl = document.getElementById('splash-screen');
            if (splashEl) {
                setTimeout(() => splashEl.remove(), 3800);
            }

            const shopSearchInput = document.getElementById('shopSearch');
            const searchIcon      = document.getElementById('shopSearchIcon');
            const shopControlsRow = document.getElementById('shopControlsRow');

            const shopSortWrap = document.getElementById('shopSortWrap');
            const shopSortSel  = document.getElementById('sortProducts');

            if (shopSearchInput && searchIcon) {
                shopSearchInput.addEventListener('input', function() {
                    searchIcon.style.opacity = this.value.length > 0 ? '0' : '1';
                });

                // -- Mobile: expand search -- shrink sort to icon; vice-versa --
                function isMobile() { return window.innerWidth < 768; }

                function expandSearch() {
                    if (!isMobile()) return;
                    if (shopControlsRow) {
                        shopControlsRow.classList.add('search-expanded');
                        shopControlsRow.classList.remove('sort-active');
                    }
                    shopSearchInput.placeholder = shopSearchInput.dataset.placeholderExpanded || 'Search products';
                }
                function collapseSearch() {
                    if (shopControlsRow) shopControlsRow.classList.remove('search-expanded');
                    shopSearchInput.placeholder = shopSearchInput.dataset.placeholderDefault || 'Search--';
                }

                function expandSort() {
                    if (!isMobile()) return;
                    if (shopControlsRow) {
                        shopControlsRow.classList.add('sort-active');
                        shopControlsRow.classList.remove('search-expanded');
                    }
                    // Blur search if open
                    if (document.activeElement === shopSearchInput) shopSearchInput.blur();
                }
                function collapseSort() {
                    if (shopControlsRow) shopControlsRow.classList.remove('sort-active');
                }

                // Search listeners
                shopSearchInput.addEventListener('focus', expandSearch);
                shopSearchInput.addEventListener('blur', function() {
                    if (!this.value.trim()) setTimeout(collapseSearch, 150);
                });
                shopSearchInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape') { this.value = ''; this.blur(); collapseSearch(); }
                });

                // Sort listeners -- clicking the sort wrapper expands it
                if (shopSortWrap) {
                    shopSortWrap.addEventListener('click', function(e) {
                        if (!isMobile()) return;
                        // If sort is already active and select is visible, let click pass through
                        if (shopControlsRow && shopControlsRow.classList.contains('sort-active')) return;
                        expandSort();
                        // Open the native select after a brief delay for animation
                        if (shopSortSel) setTimeout(() => shopSortSel.focus(), 80);
                    });
                }
                // Collapse sort after a value is picked
                if (shopSortSel) {
                    shopSortSel.addEventListener('change', function() {
                        if (isMobile()) setTimeout(collapseSort, 300);
                    });
                    shopSortSel.addEventListener('blur', function() {
                        if (isMobile()) setTimeout(collapseSort, 200);
                    });
                }

                // Tapping the search icon while sort is active -- switch to search
                if (searchIcon) {
                    searchIcon.addEventListener('click', function() {
                        if (isMobile() && shopControlsRow && shopControlsRow.classList.contains('sort-active')) {
                            expandSearch();
                            shopSearchInput.focus();
                        }
                    });
                }
            }
        });

        function setFontAwesomeIconClass(id, iconName, fallback) {
            const element = document.getElementById(id);
            if (!element) return;

            const normalized = String(iconName || fallback || '')
                .trim()
                .replace(/^fas\s+/, '')
                .replace(/^fa\s+/, '');

            const iconClass = normalized && !normalized.startsWith('fa-')
                ? `fa-${normalized.replace(/^[-\s]+/, '')}`
                : normalized;

            element.className = iconClass ? `fas ${iconClass}` : `fas ${fallback}`;
        }

        async function initializeApp() {
            loadStoredCart();
            setupEventListeners();
            updateCartUI();

            if (Array.isArray(categories) && categories.length > 0) {
                updateCategoryNav();
                updateFooterCategories();
                displayCraftCategories();
                preloadCategoryImages();
                syncCartMetadata();
            }

            showPage(resolvePageFromHash(), { updateHash: false });
            window.addEventListener('hashchange', handleRouteChangeFromHash);
            window.addEventListener('popstate', handleRouteChangeFromHash);

            animateHeroNumbers();
            initializeFAQs();
            setupNavigationObservers();
            setupPageAnimations();

            // -- PHASE A: Show the page immediately --
            // The PHP server already injected hero/CMS/settings via bootstrap data.
            // Remove app-booting NOW so the visitor sees the hero title and buttons
            // immediately, rather than waiting for all API calls to complete.
            // The legacy approach awaited checkContentVersion() (~2800ms cold start)
            // before showing anything -- that caused the blank-page experience.
            updateHeroImageFromSettings();
            window.scrollTo(0, 0);     // -- guarantee scroll=0 before body becomes visible
            finalizeInitialRender();   // -- page visible NOW, not after all API loads
            refreshRevealAnimations();

            // Check the embedded content version without making a network request.
            Promise.resolve(checkContentVersion()).catch(() => {});

            // -- PHASE C: Start products pre-fetch immediately --
            loadProducts(false);

            try {
                const initialLoadResults = await Promise.allSettled([
                    loadCategories(),
                    // loadProducts removed -- already running from pre-fetch above
                    loadFaqs(),
                    loadCareInstructions(),
                    loadSettings(),
                    loadCmsPages(),
                    loadDedicatedPagesCms(),
                    loadLatestUpdates()
                ]);
                const rejectedInitialLoads = initialLoadResults
                    .map((result, index) => ({ result, index }))
                    .filter(entry => entry.result.status === 'rejected');

                if (rejectedInitialLoads.length > 0) {
                    console.warn(
                        'L2L Collections initial content loaders with non-fatal rejections:',
                        rejectedInitialLoads.map(entry => ({
                            loaderIndex: entry.index,
                            reason: String(entry.result.reason || '')
                        }))
                    );
                }
                const storefront = cmsPages?.storefront || {};
            const homepageCopy = storefront.homepage || {};
            const shopCopy = storefront.shop || {};
            const supplementsCopy = storefront.supplements || {};
            const blogListingCopy = storefront.blog_listing || {};
            const legalCopy = storefront.legal || {};
            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value;
                }
            };
            setText('contactSectionTitle', homepageCopy.contact_title || '');
            setText('contactSectionSubtitle', homepageCopy.contact_subtitle || '');
            setText('contactFormTitle', homepageCopy.contact_form_title || '');

            // Fallback updated in Volume 2: this still carried the LUFA-era
            // product-line tagline, which would surface whenever the CMS row
            // was absent or the database was unreachable.
            setText('shopHeroTitle', shopCopy.hero_title || 'Explore Our Collections');
            setText('shopHeroSubtitle', shopCopy.hero_subtitle || 'Directly sourced from skilled artisans across remote villages of Papua New Guinea');
            updatePageHeroImage(shopCopy, 'shopHeroImg', 'shopHeroTitle', 'shopHeroSubtitle');
            setText('shopArtisanCount', shopCopy.stat1_number || '5000+');
            setText('shopArtisanLabel', shopCopy.stat1_label || 'Rural Artisans');
            setText('shopHandmadePercent', shopCopy.stat2_number || '100%');
            setText('shopHandmadeLabel', shopCopy.stat2_label || 'Handmade');
            setText('shopMaterialsCount', shopCopy.stat3_number || 'Eco');
            setText('shopMaterialsLabel', shopCopy.stat3_label || 'Natural Materials');
            setFontAwesomeIconClass('shopStat1Icon', shopCopy.stat1_icon, 'fa-users');
            setFontAwesomeIconClass('shopStat2Icon', shopCopy.stat2_icon, 'fa-hand-sparkles');
            setFontAwesomeIconClass('shopStat3Icon', shopCopy.stat3_icon, 'fa-leaf');
            setText('shopCollectionsTitle', shopCopy.collections_title || 'Browse Collections');
            setText('shopCollectionsSubtitle', shopCopy.collections_subtitle || 'Each category represents a unique craft tradition with its own story');
            setText('shopProductsTitle', shopCopy.products_title || 'Our Collection');
            setText('productsEmptyTitle', shopCopy.empty_title || 'No products found');
            setText('productsEmptyText', shopCopy.empty_text || 'Try selecting a different category or search term');
            const shopSearchInput = document.getElementById('shopSearch');
            if (shopSearchInput) {
                shopSearchInput.placeholder = shopCopy.search_placeholder || 'Search products...';
            }

            applyDedicatedPagesCms();

            // LEGAL HEROES: never overwrite with a fallback.
            //
            // `legalCopy` reads storefront.legal, but legal content is its own
            // CMS section (lb_cms_sections.section = 'legal', served by
            // /cms/legal) and has never been carried under `storefront`. So
            // legalCopy was ALWAYS {} and each line below wrote its hardcoded
            // default over the value body.php had already rendered from the
            // database — a title set in the admin panel was stored correctly,
            // served correctly, then replaced in the browser before anyone saw
            // it. Only the content blocks survived, because those are rendered
            // by displayLegalPage() from the /cms/legal payload.
            //
            // setTextIfPresent leaves the server-rendered value alone when the
            // client has nothing better. body.php already applies the same
            // fallbacks, so an empty CMS value still shows the default.
            const setTextIfPresent = (id, value) => {
                if (value === undefined || value === null || String(value).trim() === '') return;
                setText(id, value);
            };
            const legalHero = (typeof legalPages === 'object' && legalPages) ? legalPages : {};
            setTextIfPresent('termsHeroTitle',       legalCopy.terms_title    || legalHero.terms?.title);
            setTextIfPresent('termsHeroSubtitle',    legalCopy.terms_subtitle || legalHero.terms?.subtitle);
            setTextIfPresent('privacyHeroTitle',     legalCopy.privacy_title    || legalHero.privacy?.title);
            setTextIfPresent('privacyHeroSubtitle',  legalCopy.privacy_subtitle || legalHero.privacy?.subtitle);
            setTextIfPresent('deliveryHeroTitle',    legalCopy.delivery_title    || legalHero.delivery?.title);
            setTextIfPresent('deliveryHeroSubtitle', legalCopy.delivery_subtitle || legalHero.delivery?.subtitle);
            setTextIfPresent('returnsHeroTitle',     legalCopy.returns_title    || legalHero.returns?.title);
            setTextIfPresent('returnsHeroSubtitle',  legalCopy.returns_subtitle || legalHero.returns?.subtitle);
            setTextIfPresent('exportHeroTitle',      legalCopy.export_title    || legalHero.export?.title);
            setTextIfPresent('exportHeroSubtitle',   legalCopy.export_subtitle || legalHero.export?.subtitle);

            // updateHeroImageFromSettings() and finalizeInitialRender() were moved
            // to BEFORE this block so the hero is visible immediately from bootstrap data.
            // Just trigger reveal animations again now that dynamic content is populated.
            refreshRevealAnimations();
            startDataRefresh();
            } catch (error) {
                console.error('Error initializing app:', error);
                // Page is already visible (finalizeInitialRender ran above)
                // Just show a non-blocking notification
                showNotification('Some content could not be loaded. Please refresh the page.', 'warning');
            }
        }

        function finalizeInitialRender() {
            // Ensure viewport is at the hero before we release the overflow lock
            window.scrollTo(0, 0);
            // Release the boot-time scroll lock (set at script top)
            document.documentElement.style.overflow = '';
            document.body.classList.remove('app-booting');
            // Fade out the splash screen
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.classList.add('splash-done'); // triggers CSS opacity:0 transition
                setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 350);
            }
        }

        function normalizeLegacyManagedAssetUrl(url) {
            const raw = String(url || '').trim();
            if (!raw) return '';

            const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, '');
            const match = withoutOrigin.match(/\/(?:LUFABASKET\/)?(?:admin|adminpanel)\/uploads\/(.+)$/i);
            if (!match) return raw;

            let relativePath = match[1].replace(/^\/+/, '');
            if (/^assets\//i.test(relativePath)) return relativePath;

            relativePath = relativePath.replace(/^uploads\//i, '');
            return `assets/uploads/${relativePath}`;
        }

        function normalizePublicAssetUrl(url) {
            const raw = normalizeLegacyManagedAssetUrl(url);
            if (!raw) return '';
            if (/^(https?:|data:|blob:)/i.test(raw) || raw.startsWith('/')) return raw;

            const normalized = raw
                .replace(/^\/+/, '')
                .replace(/^public\//i, '')
                .replace(/^assets\//i, '');

            const assetBase = String(window.__LUFA_PUBLIC_ASSET_BASE || '').replace(/\/+$/, '');
            return assetBase ? `${assetBase}/${normalized}` : raw;
        }

        const DEFAULT_MEDIA_FALLBACK = normalizePublicAssetUrl('assets/images/logo.png');
        const DEFAULT_HERO_FALLBACK = normalizePublicAssetUrl('assets/images/hero2.webp') || DEFAULT_MEDIA_FALLBACK;

        function imageErrorHandler(fallbackUrl = DEFAULT_MEDIA_FALLBACK) {
            const safeFallback = String(fallbackUrl || DEFAULT_MEDIA_FALLBACK).replace(/'/g, "\\'");
            return `this.onerror=null;this.src='${safeFallback}'`;
        }

        function setImageSource(imgEl, src, fallbackUrl = DEFAULT_MEDIA_FALLBACK) {
            if (!imgEl) return;
            const fallback = normalizePublicAssetUrl(fallbackUrl) || DEFAULT_MEDIA_FALLBACK;
            imgEl.onerror = () => {
                imgEl.onerror = null;
                imgEl.src = fallback;
            };
            imgEl.src = normalizePublicAssetUrl(src) || fallback;
        }

        function updateHeroImageFromSettings() {
            // Split hero uses the 4-card visual composition for imagery.
            // Setting a background-image on the hero section would show through
            // the left content column -- skip it when the visual frame is present.
            if (document.querySelector('.hero-visual-frame')) return;

            const heroSection = document.getElementById('hero');
            if (!heroSection) return;

            const imageUrl = normalizePublicAssetUrl(cmsPages?.hero?.hero_image)
                || normalizePublicAssetUrl(settings?.hero_image_url)
                || DEFAULT_HERO_FALLBACK;

            heroSection.style.backgroundImage = `url('${imageUrl}')`;
        }

        // Cart persistence.
        //
        // loadStoredCart() used to be `cart = []` — a stub that emptied the cart
        // on every page load. Nothing was ever stored, so a shopper who
        // refreshed, opened a product in a new tab, or came back a minute later
        // lost everything they had added. The function's own name, and the
        // syncCartMetadata() below it (which re-syncs product data for restored
        // lines), both show a stored cart was always the intent.
        //
        // Prices are NOT trusted from storage: every total a customer acts on
        // comes from POST /cart/quote, and syncCartMetadata() refreshes name and
        // price from the freshly loaded product list. A stale stored price
        // therefore cannot survive into an order.
        const CART_STORAGE_KEY = 'lufa_cart_v1';
        const CART_MAX_AGE_MS  = 14 * 24 * 60 * 60 * 1000;   // matches the 14-day stock reservation

        function loadStoredCart() {
            cart = [];
            let raw = null;
            try { raw = localStorage.getItem(CART_STORAGE_KEY); } catch (_) { return; }
            if (!raw) return;
            try {
                const stored = JSON.parse(raw);
                if (!stored || !Array.isArray(stored.items)) return;
                if (stored.savedAt && (Date.now() - stored.savedAt) > CART_MAX_AGE_MS) {
                    try { localStorage.removeItem(CART_STORAGE_KEY); } catch (_) {}
                    return;
                }
                // Keep only lines that still look like cart lines.
                cart = stored.items.filter(i => i && i.id && Number(i.quantity) > 0);
            } catch (_) {
                cart = [];
            }
        }

        function persistCart() {
            try {
                if (!Array.isArray(cart) || cart.length === 0) {
                    localStorage.removeItem(CART_STORAGE_KEY);
                    return;
                }
                localStorage.setItem(CART_STORAGE_KEY,
                    JSON.stringify({ savedAt: Date.now(), items: cart }));
            } catch (_) { /* storage unavailable or full — the cart still works in memory */ }
        }

        function syncCartMetadata() {
            if (!Array.isArray(cart) || cart.length === 0) return;

            cart = cart.map(item => {
                const product = products.find(productItem => productItem.id === item.id) || item;
                return {
                    ...item,
                    product_code: item.product_code || product.product_code || '',
                    category_id: item.category_id || product.category_id || '',
                    category: item.category || product.category || '',
                    requires_fumigation: Boolean(
                        item.requires_fumigation !== undefined ? item.requires_fumigation : productRequiresFumigation(product)
                    )
                };
            });

            return cart;
        }

        function getCategoryRecord(categoryRef) {
            if (!categoryRef) return null;

            if (typeof categoryRef === 'object' && categoryRef.id) {
                return categories.find(cat => cat.id === categoryRef.id) || categoryRef;
            }

            const normalizedRef = String(categoryRef).trim().toLowerCase();
            return categories.find(cat => {
                const slug = (cat.slug || '').toLowerCase();
                const name = (cat.name || '').toLowerCase();
                const id = String(cat.id || '').toLowerCase();
                return slug === normalizedRef || name === normalizedRef || id === normalizedRef;
            }) || null;
        }

        function getCategoryKey(category) {
            return (category?.slug || category?.name || category?.id || '').toString().trim().toLowerCase();
        }

        function getProductCategoryRecord(product) {
            return getCategoryRecord(product?.category_id || product?.category || product?.category_code);
        }

        function productRequiresFumigation(product) {
            const category = getProductCategoryRecord(product);
            if (category) {
                return Boolean(category.requires_fumigation);
            }
            return Boolean(product?.requires_fumigation);
        }

        function getNormalizedProductSizes(product) {
            return Array.isArray(product?.sizes)
                ? product.sizes.filter(size => size && typeof size === 'object')
                : [];
        }

        // Generic size names that add no information -- suppress on card
        const _GENERIC_SIZE_NAMES = new Set([
            'standard size','standard','one size','default','regular','n/a','none',''
        ]);
        function getProductCardSizeLabel(product) {
            const sizes = getNormalizedProductSizes(product);
            if (sizes.length === 1) {
                const name = (sizes[0].name || '').trim().toLowerCase();
                return _GENERIC_SIZE_NAMES.has(name) ? '' : sizes[0].name.trim();
            }
            if (sizes.length > 1) return 'Size Options';
            return '';
        }

        /**
         * The variant identity to SEND to the server for one cart line.
         *
         * A product with no variants is added to the cart with the placeholder
         * label 'Standard Size' (see addToCart) purely so the cart line has
         * something to display. That label was then transmitted as `size`, and
         * the backend resolves `size` STRICTLY: it must exist in
         * lb_product_sizes for that product, and an unknown option is an error
         * rather than a silent drop to the base price. No product has a
         * 'Standard Size' row, so every cart containing a variant-less product
         * failed with:
         *
         *     422 CART_VALIDATION_FAILED
         *     items.0.variant_id: "The selected option is not available for '...'"
         *
         * which made checkout impossible — no order could be placed at all.
         *
         * The server is right to be strict; the fabricated name should never
         * have been sent. Omitting it entirely takes the backend's
         * "nothing requested" path, which returns the base product when the
         * product genuinely has no variants, and still errors when it has
         * variants and none was chosen.
         *
         * _GENERIC_SIZE_NAMES is reused deliberately: the UI already treats
         * these labels as carrying no information and hides them on the card.
         */
        function cartItemVariantFields(item) {
            if (item && item.variant_code) {
                return { variant_code: item.variant_code, size: undefined };
            }
            const name = String((item && item.size) || '').trim().toLowerCase();
            if (_GENERIC_SIZE_NAMES.has(name)) {
                return { variant_code: undefined, size: undefined };
            }
            return { variant_code: undefined, size: (item && item.size) || undefined };
        }

        // ============================================
        // SERVER-AUTHORITATIVE PRICING (Volume 5, 2026-08-03)
        // ============================================
        //
        // Every figure below used to be decided here and POSTed to the backend,
        // which stored whatever it was given. The backend now calculates all of
        // them and IGNORES anything the browser sends.
        //
        // These functions remain, and still compute locally, for ONE reason:
        // the cart badge and line totals have to render the instant an item is
        // added, before a round trip completes. That is a display estimate.
        //
        // `serverQuote` holds the authoritative answer once it arrives, and
        // every total that a customer acts on prefers it. The confirmation
        // screen and the submitted order use the server's figures only.
        let serverQuote = null;        // last successful /cart/quote payload
        let serverQuoteError = null;   // set when the server could not be reached

        function serverAmount(path) {
            if (!serverQuote) return null;
            const raw = path.split('.').reduce((o, k) => (o == null ? null : o[k]), serverQuote);
            return raw == null ? null : Number(raw);
        }

        /**
         * Refresh the authoritative quote for the current cart.
         *
         * Returns the payload on success, or null when the server could not be
         * reached. It NEVER invents a successful result — the adapter used to do
         * exactly that, and it meant no caller could trust any check.
         */
        async function refreshServerQuote() {
            if (!cart.length) { serverQuote = null; serverQuoteError = null; return null; }

            const payload = cart.map(item => ({
                product_id:   item.id,
                // Prefer the stable identifier; fall back to the display name,
                // which the backend resolves strictly (an unknown option is an
                // error there, not a silent drop to the base price). A generic
                // placeholder label is sent as nothing at all — see
                // cartItemVariantFields().
                ...cartItemVariantFields(item),
                quantity:     item.quantity,
                price:        item.price,   // sent only so the server can warn on drift
            }));

            const delivery = {
                mode:     getSelectedShippingMethod(),
                country:  document.getElementById('country')?.value || '',
                city:     document.getElementById('city')?.value || '',
                province: document.getElementById('province')?.value || '',
                address:  document.getElementById('address')?.value || '',
            };

            const result = await LufaApi.quoteCart(payload, delivery);

            if (result?.success && result.data?.valid) {
                serverQuote = result.data;
                serverQuoteError = null;
                return serverQuote;
            }

            serverQuote = null;
            serverQuoteError = {
                code:    result?.code || 'CART_VALIDATION_FAILED',
                message: result?.error || 'Some items in your cart need attention.',
                details: result?.details || {},
            };
            return null;
        }

        function calculateSubtotal(items = cart) {
            // Server figure wins whenever we have one for the current cart.
            if (items === cart) {
                const authoritative = serverAmount('subtotal');
                if (authoritative !== null) return authoritative;
            }
            return items.reduce((total, item) => total + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
        }

        function calculateFumigationUnits(items = cart) {
            if (items === cart) {
                const units = serverAmount('fumigation.qualifying_units');
                if (units !== null) return units;
            }
            return items.reduce((count, item) => {
                if (item.fumigation && (item.requires_fumigation || productRequiresFumigation(item))) {
                    return count + (Number(item.quantity) || 0);
                }
                return count;
            }, 0);
        }

        function calculateFumigationFee(items = cart) {
            if (items === cart) {
                const authoritative = serverAmount('fumigation_fee');
                if (authoritative !== null) return authoritative;
            }
            return calculateFumigationUnits(items) * (Number(settings.fumigation_fee) || 50);
        }

        function getSelectedShippingMethod() {
            const freightCheckbox = document.querySelector('input[name="shippingOption"][value="freight"]');
            const pickupCheckbox = document.querySelector('input[name="shippingOption"][value="pickup"]');

            if (freightCheckbox?.checked) return 'freight';
            if (pickupCheckbox?.checked) return 'pickup';
            return 'quote';
        }

        /**
         * Freight is a STATE, not just a number (Volume 5).
         *
         * The published copy says freight is calculated after the team reviews
         * the destination, so for a freight order the honest answer is
         * `pending` and the total excludes it. The K100 setting is an estimate,
         * shown separately and clearly labelled — it is no longer silently
         * added to a total and POSTed as if the business had agreed to it.
         */
        function getFreightState() {
            if (serverQuote?.freight) return serverQuote.freight;
            return getSelectedShippingMethod() === 'freight'
                ? { status: 'pending', amount: null, estimate: (Number(settings.freight_fee) || 100).toFixed(2) }
                : { status: 'not_applicable', amount: null, estimate: null };
        }

        function getSelectedShippingFee() {
            const freight = getFreightState();
            // Only a CONFIRMED figure counts as money owed.
            return freight.status === 'confirmed' && freight.amount != null ? Number(freight.amount) : 0;
        }

        function updatePaymentConfirmationUI(orderData = null) {
            const paymentMethodValue = document.getElementById('paymentMethodValue');
            const paymentStatusValue = document.getElementById('paymentStatusValue');
            const paymentNextStep = document.getElementById('paymentNextStep');

            const paymentStatus = orderData?.payment_status || 'pending_invoice';

            if (paymentMethodValue) {
                paymentMethodValue.textContent = 'Invoice / Bank Transfer';
            }

            if (paymentStatusValue) {
                if (paymentStatus === 'payment_completed') {
                    paymentStatusValue.textContent = 'Payment confirmed';
                } else if (paymentStatus === 'partially_paid') {
                    // Phase 5. Without this branch a customer who has already
                    // transferred a deposit was told "Awaiting payment
                    // instructions" — which reads as "nothing has arrived".
                    paymentStatusValue.textContent = 'Part payment received';
                } else if (paymentStatus === 'payment_failed') {
                    paymentStatusValue.textContent = 'Payment needs attention';
                } else {
                    paymentStatusValue.textContent = 'Awaiting payment instructions';
                }
            }

            if (paymentNextStep) {
                paymentNextStep.style.display = 'none';
            }
        }

        function calculateOrderTotal(items = cart) {
            if (items === cart) {
                const authoritative = serverAmount('total');
                if (authoritative !== null) return authoritative;
            }
            return calculateSubtotal(items) + calculateFumigationFee(items) + getSelectedShippingFee();
        }

        function buildReferenceNumber(prefix) {
            const now = new Date();
            const datePart = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0')
            ].join('');
            const timePart = [
                String(now.getHours()).padStart(2, '0'),
                String(now.getMinutes()).padStart(2, '0'),
                String(now.getSeconds()).padStart(2, '0')
            ].join('');
            return `${prefix}-${datePart}-${timePart}`;
        }

        function truncateText(text, maxLength = 140) {
            const safeText = String(text || '').trim();
            if (safeText.length <= maxLength) return safeText;
            return `${safeText.slice(0, maxLength - 1).trim()}...`;
        }

        function getPlatformMeta(platform) {
            const normalized = String(platform || '').toLowerCase();
            const meta = {
                facebook: { icon: 'fab fa-facebook-f', label: 'Facebook' },
                instagram: { icon: 'fab fa-instagram', label: 'Instagram' },
                linkedin: { icon: 'fab fa-linkedin-in', label: 'LinkedIn' },
                tiktok: { icon: 'fab fa-tiktok', label: 'TikTok' },
                whatsapp: { icon: 'fab fa-whatsapp', label: 'WhatsApp' }
            };
            return meta[normalized] || { icon: 'fas fa-bullhorn', label: normalized || 'Update' };
        }

        function normalizeHeroText(value) {
            return typeof value === 'string' ? value.trim() : '';
        }

        function heroTitleContainsHighlight(titleLine, highlightWord) {
            const normalizedTitle = normalizeHeroText(titleLine).toLocaleLowerCase();
            const normalizedHighlight = normalizeHeroText(highlightWord).toLocaleLowerCase();
            return Boolean(normalizedTitle && normalizedHighlight && normalizedTitle.includes(normalizedHighlight));
        }

        function buildHeroTitleLine(titleLine, highlightWord) {
            const normalizedTitle = normalizeHeroText(titleLine);
            const normalizedHighlight = normalizeHeroText(highlightWord);
            const safeTitle = escapeHtml(normalizedTitle);

            if (!normalizedHighlight) {
                return safeTitle;
            }

            if (!normalizedTitle) {
                return `<span class="highlight" id="heroHighlightWord">${escapeHtml(normalizedHighlight)}</span>`;
            }

            const highlightIndex = normalizedTitle.toLocaleLowerCase().indexOf(normalizedHighlight.toLocaleLowerCase());

            if (highlightIndex === -1) {
                return safeTitle;
            }

            const beforeHighlight = escapeHtml(normalizedTitle.slice(0, highlightIndex));
            const matchedHighlight = escapeHtml(normalizedTitle.slice(highlightIndex, highlightIndex + normalizedHighlight.length));
            const afterHighlight = escapeHtml(normalizedTitle.slice(highlightIndex + normalizedHighlight.length));

            return `${beforeHighlight}<span class="highlight" id="heroHighlightWord">${matchedHighlight}</span>${afterHighlight}`;
        }

        // ============================================
        // CACHING FUNCTIONS
        // ============================================
        function getCachedProducts() {
            return null;
        }

        function setCachedProducts(data) {
            return data;
        }

        // ============================================
        // LOADING FUNCTIONS
        // ============================================
        function showLoading(show) {
            return show;
        }

        function setButtonLoading(button, isLoading) {
            if (!button) return;
            if (isLoading) {
                button.dataset.originalText = button.innerHTML;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
                button.disabled = true;
                button.classList.add('btn-loading');
            } else {
                button.innerHTML = button.dataset.originalText || button.innerHTML;
                button.disabled = false;
                button.classList.remove('btn-loading');
            }
        }

        // ============================================
        // API FUNCTIONS
        // ============================================
        async function fetchAPI(action, params = {}, method = 'GET') {
            if (!(window.__LUFA_USE_V2 && typeof LufaApi !== 'undefined')) {
                if (action === 'get_categories' && Array.isArray(window.__LUFA_BOOTSTRAP_CATEGORIES) && window.__LUFA_BOOTSTRAP_CATEGORIES.length > 0) {
                    return window.__LUFA_BOOTSTRAP_CATEGORIES;
                }
                throw new Error(`Storefront API unavailable for action: ${action}`);
            }

            try {
                switch (action) {
                    case 'get_categories': {
                        const liveCategories = await LufaApi.getCategories();
                        if (Array.isArray(liveCategories) && liveCategories.length > 0) {
                            return liveCategories;
                        }
                        if (Array.isArray(window.__LUFA_BOOTSTRAP_CATEGORIES) && window.__LUFA_BOOTSTRAP_CATEGORIES.length > 0) {
                            return window.__LUFA_BOOTSTRAP_CATEGORIES;
                        }
                        return liveCategories;
                    }
                    case 'get_products': {
                        const result = await LufaApi.getProducts(params);
                        return result.products || [];
                    }
                    case 'get_faqs':
                        return await LufaApi.getFaqs();
                    case 'get_care_instructions':
                        return await LufaApi.getCare();
                    case 'get_public_settings':
                        return await LufaApi.getSettingsPublic();
                    case 'get_cms_pages':
                        return await LufaApi.getCmsPages();
                    case 'get_social_posts':
                        return await LufaApi.getSocialFeed();
                    case 'get_updates': {
                        const result = await LufaApi.getBlog(params);
                        return result.posts || [];
                    }
                    default:
                        throw new Error(`Unsupported storefront action: ${action}`);
                }
            } catch (error) {
                console.error(`API Error (${action}):`, error);
                throw error;
            }
        }

        // -- Helper: update a dedicated page's hero from CMS data --
        // When a hero_image is set -- show it + overlay + white text.
        // When no image -- hide overlay, use dark text (page light bg).
        function updatePageHeroImage(source, imgId, titleId, subId) {
            const d = typeof source === 'string'
                ? (cmsPages?.[source] || cmsPages?.storefront?.[source] || {})
                : (source || {});
            const imgEl   = document.getElementById(imgId);
            const titleEl = document.getElementById(titleId);
            const subEl   = document.getElementById(subId);
            const hero    = imgEl ? imgEl.closest('.page-hero') : null;
            const heroImg = normalizePublicAssetUrl(d.hero_image);

            if (titleEl && d.hero_title) titleEl.textContent = d.hero_title;
            if (subEl && d.hero_subtitle) subEl.textContent = d.hero_subtitle;

            if (imgEl && heroImg) {
                imgEl.style.display = 'block';
                imgEl.onload = () => { if (hero) hero.classList.add('has-image'); };
                imgEl.onerror = () => {
                    if (hero) hero.classList.remove('has-image');
                    imgEl.style.display = 'none';
                };
                setImageSource(imgEl, heroImg, DEFAULT_HERO_FALLBACK);
            } else {
                if (imgEl) imgEl.style.display = 'none';
                if (hero) hero.classList.remove('has-image');
            }
        }

        // ============================================
        // CATEGORY FUNCTIONS
        // ============================================

        function preloadCategoryImages() {
            if (!categories || categories.length === 0) return;
            const head = document.head;
            // Remove any previously injected category preloads to avoid duplication
            document.querySelectorAll('link[data-lufa-preload="cat"]').forEach(l => l.remove());
            // Deduplicate: each real category only once (categories array is doubled for the slider)
            const seen = new Set();
            categories.forEach((cat, i) => {
                const slug = (cat.slug || (cat.name || '').toLowerCase()).trim();
                if (seen.has(slug)) return;
                seen.add(slug);
                const rawFallback =
                    CATEGORY_FALLBACK_IMAGES[slug] ||
                    CATEGORY_FALLBACK_IMAGES[(cat.name || '').toLowerCase()] ||
                    'assets/images/baskets/hero3.jpeg';
                const rawUrl = resolveCategoryImageUrl(cat) || rawFallback;
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = 'image';
                link.href = cssSafeImageUrl(rawUrl);
                link.setAttribute('data-lufa-preload', 'cat');
                if (i < 2) link.setAttribute('fetchpriority', 'high');
                head.appendChild(link);
            });
        }
        function hasRenderableCategories(source = categories) {
            return Array.isArray(source) && source.some(cat => cat && (cat.name || cat.slug));
        }

        function renderCategorySurfaces() {
            if (!hasRenderableCategories()) return;
            updateCategoryNav();
            updateFooterCategories();
            displayCraftCategories();
            preloadCategoryImages();
            syncCartMetadata();
        }

        async function loadCategories(showLoadingIndicator = true) {
            const cached = lsCache.get('categories', 5 * 60 * 1000);
            if (hasRenderableCategories(cached)) {
                categories = cached;
                renderCategorySurfaces();
                return categories;
            }

            if (hasRenderableCategories(categories)) {
                renderCategorySurfaces();
            }

            try {
                const data = await fetchAPI('get_categories', { _ts: Date.now() });
                if (hasRenderableCategories(data)) {
                    categories = data;
                    lsCache.set('categories', categories);
                    renderCategorySurfaces();
                    return categories;
                }

                if (hasRenderableCategories(window.__LUFA_BOOTSTRAP_CATEGORIES)) {
                    categories = [...window.__LUFA_BOOTSTRAP_CATEGORIES];
                    renderCategorySurfaces();
                    return categories;
                }

                return categories;
            } catch (error) {
                console.error('Error loading categories:', error);
                if (hasRenderableCategories(categories)) {
                    renderCategorySurfaces();
                    return categories;
                }
                return [];
            }
        }

        function updateCategoryNav() {
            const navList = document.getElementById('categoriesNavList');
            if (!navList) return;

            if (!hasRenderableCategories()) {
                if (navList.querySelector('.category-nav-btn')) return;
                navList.innerHTML = `
                    <a href="#shop" class="category-nav-btn active" data-page="shop" data-category="all">
                        <i class="fas fa-th-large"></i>
                        <span>All Products</span>
                    </a>
                `;
                return;
            }

            navList.innerHTML = `
                <a href="#shop" class="category-nav-btn active" data-page="shop" data-category="all">
                    <i class="fas fa-th-large"></i>
                    <span>All Products</span>
                </a>
            `;

            categories.forEach(cat => {
                const btn = document.createElement('a');
                btn.href = '#shop';
                btn.className = 'category-nav-btn';
                btn.setAttribute('data-page', 'shop');
                btn.setAttribute('data-category', getCategoryKey(cat));
                btn.innerHTML = `<i class="fas ${cat.icon || 'fa-tag'}"></i> <span>${escapeHtml(cat.name)}</span>`;
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    document.querySelectorAll('.category-nav-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    const category = this.getAttribute('data-category');
                    filterProducts(category);
                    closeMobileMenu();
                });
                navList.appendChild(btn);
            });
        }

        function updateFooterCategories() {
            const footerLinks = document.getElementById('footerShopLinks');
            if (!footerLinks) return;
            
            footerLinks.innerHTML = '<li><a href="#shop" data-page="shop" data-category="all">All Products</a></li>';
            
            categories.forEach(cat => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#shop';
                a.setAttribute('data-page', 'shop');
                a.setAttribute('data-category', getCategoryKey(cat));
                a.textContent = cat.name;
                
                a.addEventListener('click', function(e) {
                    e.preventDefault();
                    const categoryKey = getCategoryKey(cat);
                    if (productsLoaded) {
                        showPage('shop');
                        filterProducts(categoryKey);
                        updateActiveCategory(categoryKey);
                    } else {
                        pendingCategory = categoryKey;
                        showPage('shop');
                    }
                    closeMobileMenu();
                });
                
                li.appendChild(a);
                footerLinks.appendChild(li);
            });
        }

        // Maps a category slug (or lower-cased name) to an existing local image.
        // Keys must match the slug values returned by the API.
        // Parentheses and spaces in filenames would break CSS url() so we
        // encode paths through cssSafeImageUrl() before injecting into style.
        const CATEGORY_FALLBACK_IMAGES = {
            'baskets':          'assets/images/baskets/hero3.jpeg',
            'bilums':           'assets/images/bilums/hero1.jpeg',
            'pottery':          'assets/images/potteries/pot (1).jpeg',
            'potteries':        'assets/images/potteries/pot (1).jpeg',
            'rugs':             'assets/images/rugs/rg (1).jpeg',
            'artifacts':        'assets/images/artisians/art (1).jpeg',
            'artisan crafts':   'assets/images/artisians/art (1).jpeg',
            'artisan-crafts':   'assets/images/artisians/art (1).jpeg',
        };

        // Encode each path segment so spaces, parentheses, and other characters
        // that are special inside a CSS url('--') value are safely percent-encoded.
        function cssSafeImageUrl(rawUrl) {
            if (!rawUrl) return '';
            const normalizedUrl = normalizePublicAssetUrl(rawUrl);
            // Already an absolute URL from the server -- leave it alone.
            if (/^https?:\/\//i.test(normalizedUrl) || normalizedUrl.startsWith('data:')) {
                return normalizedUrl;
            }
            // Encode each filename segment; preserve the '/' separators.
            return normalizedUrl.split('/').map(seg => encodeURIComponent(seg)).join('/');
        }

        // Resolve a category image URL from the API response object.
        // DB stores canonical relative paths like "assets/uploads/file.jpg".
        // Absolute http(s) URLs are passed through unchanged.
        function resolveCategoryImageUrl(cat) {
            const raw = cat.image_url || cat.image_path || '';
            if (!raw) return '';
            return normalizePublicAssetUrl(raw);
        }

        // EMPTY-SECTION RULE (Volume 1) — shows or hides a whole homepage
        // section so a heading never sits above an empty band. The section
        // stays in the DOM either way, so it reappears as soon as records
        // arrive without a page reload. See body.php for the server-side half.
        function setEmptySectionVisible(sectionId, hasContent) {
            const section = document.getElementById(sectionId);
            if (section) section.style.display = hasContent ? '' : 'none';
        }

        function displayCraftCategories() {
            const craftGrid = document.getElementById('craftGrid');
            if (!craftGrid) return;

            if (!hasRenderableCategories()) {
                if (craftGrid.querySelector('.craft-card-wrapper')) {
                    setEmptySectionVisible('homeCollections', true);
                    return;
                }
                // No categories and nothing already rendered: hide the section
                // rather than printing a placeholder into an empty carousel.
                craftGrid.innerHTML = '';
                setEmptySectionVisible('homeCollections', false);
                return;
            }

            setEmptySectionVisible('homeCollections', true);

            // Card: render a real <img> so admin-fed category images remain visible
            // across browsers instead of relying on CSS background painting.
            const makeCard = (cat, index) => {
                const eagerLoad = index < 5;
                const slug = (cat.slug || (cat.name || '').toLowerCase()).trim();
                const rawFallback =
                    CATEGORY_FALLBACK_IMAGES[slug] ||
                    CATEGORY_FALLBACK_IMAGES[(cat.name || '').toLowerCase()] ||
                    'assets/images/baskets/hero3.jpeg';
                const fallbackUrl = cssSafeImageUrl(normalizePublicAssetUrl(rawFallback));
                const rawUrl      = resolveCategoryImageUrl(cat) || rawFallback;
                const imageUrl    = cssSafeImageUrl(rawUrl);
                const description = cat.description || `Handcrafted ${escapeHtml(cat.name.toLowerCase())} from skilled artisans across Papua New Guinea.`;
                const key         = getCategoryKey(cat);
                return `
                    <div class="craft-card-wrapper" data-craft="${key}">
                        <div class="craft-card">
                            <div class="craft-card-media">
                                <img src="${imageUrl}" alt="${escapeHtml(cat.name)}" class="craft-card-image" loading="${eagerLoad ? 'eager' : 'lazy'}" fetchpriority="${eagerLoad ? 'high' : 'auto'}" decoding="async" data-fallback-src="${fallbackUrl}">
                                <div class="craft-button-container">
                                    <a href="#shop" class="btn btn-outline craft-btn" data-page="shop" data-category="${key}">
                                        <span>Shop ${escapeHtml(cat.name)}</span>
                                        <i class="fas fa-arrow-right"></i>
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class="craft-card-caption">
                            <h3 class="craft-card-title">${escapeHtml(cat.name)}</h3>
                            <p class="craft-card-desc">${escapeHtml(description)}</p>
                        </div>
                    </div>
                `;
            };
            const isMobile = () => window.innerWidth < 768;
            // Mobile: clone 2 cards on each side so looping is a real continuous
            // slide (clone visually leads straight into what looks like the next
            // real card) instead of an abrupt jump. Desktop keeps a single grid.
            const LOOP_BUFFER  = 2;
            const useBuffer    = isMobile() && categories.length > LOOP_BUFFER;
            craftGrid.innerHTML = useBuffer
                ? [...categories.slice(-LOOP_BUFFER), ...categories, ...categories.slice(0, LOOP_BUFFER)].map((cat, index) => makeCard(cat, index)).join('')
                : [...categories].map((cat, index) => makeCard(cat, index)).join('');

            craftGrid.querySelectorAll('.craft-card-image').forEach(img => {
                img.addEventListener('error', function() {
                    const fallback = this.getAttribute('data-fallback-src') || DEFAULT_MEDIA_FALLBACK;
                    if (this.src !== fallback) {
                        this.src = fallback;
                    }
                }, { once: true });
            });

            craftGrid.querySelectorAll('.craft-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const category = this.getAttribute('data-category');
                    if (productsLoaded) {
                        showPage('shop');
                        filterProducts(category);
                        updateActiveCategory(category);
                    } else {
                        pendingCategory = category;
                        showPage('shop');
                    }
                });
            });

            // -- Carousel nav: mobile infinite loop + desktop static grid --
            const viewport = craftGrid.closest('.craft-slider-viewport');
            const prevBtn  = document.getElementById('craftPrev');
            const nextBtn  = document.getElementById('craftNext');

            if (viewport && prevBtn && nextBtn && !craftGrid._navInit) {
                craftGrid._navInit = true;

                if (isMobile()) {
                    // -- Buffered-loop carousel --
                    // 2 clone cards sit on each side of the real set. Every single
                    // step (button or swipe) moves to an immediately adjacent DOM
                    // card, so the slide is always visually continuous -- there is
                    // no scenario where we jump backwards through the deck.
                    // Once the user lands on a clone, we silently shift scrollLeft
                    // by exactly one full set-width: since the clone is a pixel
                    // duplicate of the real card n positions away, this shift is
                    // mathematically exact and cannot be seen.
                    const n        = categories.length;
                    const buffer   = useBuffer ? LOOP_BUFFER : 0;
                    const getCards = () => [...craftGrid.querySelectorAll('.craft-card-wrapper')];

                    let domIdx = buffer; // index of the first real card in the DOM

                    // Snap must be off for any programmatic scroll: with
                    // 'x mandatory' active, scrollBy()/scrollTo() can get
                    // intercepted mid-flight and settle on the nearest snap
                    // point instead of the position we explicitly calculated
                    // (observed: requesting card 2 landed one card short).
                    function centerOn(idx, behavior) {
                        const card = getCards()[idx];
                        if (!card) return;
                        const vpRect   = viewport.getBoundingClientRect();
                        const cardRect = card.getBoundingClientRect();
                        const offset   = (cardRect.left + cardRect.width  / 2) -
                                         (vpRect.left   + vpRect.width    / 2);
                        const target   = viewport.scrollLeft + offset;

                        viewport.style.scrollSnapType = 'none';
                        if (behavior === 'instant') {
                            // The CSS rule `scroll-behavior: smooth` on this element
                            // (used for normal swipe momentum) would otherwise
                            // animate THIS assignment too, defeating the whole
                            // point of an instant remap -- override it explicitly.
                            viewport.style.scrollBehavior = 'auto';
                            viewport.scrollLeft = target;
                            requestAnimationFrame(() => {
                                viewport.style.scrollSnapType = 'x mandatory';
                                viewport.style.scrollBehavior = '';
                            });
                        } else {
                            viewport.scrollTo({ left: target, behavior: 'smooth' });
                            setTimeout(() => { viewport.style.scrollSnapType = 'x mandatory'; }, 420);
                        }
                    }

                    // Land on the first real card before first paint (no clone visible at rest)
                    requestAnimationFrame(() => centerOn(domIdx, 'instant'));

                    // Re-target with a live instant centerOn rather than a fixed
                    // arithmetic shift -- this is correct even if called before
                    // the prior smooth scroll has fully settled, because it
                    // measures the real card position at the moment it runs
                    // instead of assuming where scrollLeft "should" be by now.
                    function remapIfNeeded() {
                        if (!buffer) return false;
                        if (domIdx < buffer)            { domIdx += n; centerOn(domIdx, 'instant'); return true; }
                        if (domIdx >= buffer + n)       { domIdx -= n; centerOn(domIdx, 'instant'); return true; }
                        return false;
                    }

                    // Locks out new button taps while a transition is still
                    // settling, so a rapid second tap can never interrupt an
                    // in-flight smooth scroll (the only scenario that produced
                    // visible glitches during testing).
                    let _busy = false;

                    function goTo(newDomIdx) {
                        if (_busy) return;
                        _busy = true;
                        if (!buffer) {
                            const total = getCards().length;
                            newDomIdx = Math.max(0, Math.min(total - 1, newDomIdx));
                        }
                        domIdx = newDomIdx;
                        centerOn(domIdx, 'smooth');
                        // _busy is cleared by the scroll-settle listener below,
                        // once scroll events actually stop -- correct regardless
                        // of how long this particular smooth scroll takes.
                    }

                    // After a touch-swipe (or a button-triggered smooth scroll)
                    // settles, sync domIdx to the most-centred card and remap
                    // immediately if it turned out to be a clone.
                    let _snapTimer = null;
                    viewport.addEventListener('scroll', () => {
                        clearTimeout(_snapTimer);
                        _snapTimer = setTimeout(() => {
                            const vpCx = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
                            let best = 0, bestDist = Infinity;
                            getCards().forEach((c, i) => {
                                const dist = Math.abs(c.getBoundingClientRect().left + c.offsetWidth / 2 - vpCx);
                                if (dist < bestDist) { bestDist = dist; best = i; }
                            });
                            domIdx = best;
                            // Keep the lock held through the remap's own
                            // follow-up settle cycle -- only release once we
                            // land on a real (non-clone) card at rest.
                            if (!remapIfNeeded()) _busy = false;
                        }, 100);
                    }, { passive: true });

                    // Both buttons always enabled -- circular.
                    // Wire both 'click' (mouse/desktop testing) and 'touchend'
                    // (mobile) -- touchend fires reliably even though the button
                    // sits on top of a scrollable element that could otherwise
                    // capture the gesture first.
                    prevBtn.disabled = false;
                    nextBtn.disabled = false;
                    // A single physical tap fires BOTH 'touchend' and a synthetic
                    // 'click' on most mobile browsers. Without de-duplication that
                    // double-fires goTo(), advancing 2 cards and racing two smooth
                    // scrolls against each other -- the exact cause of the bounce.
                    let _lastTapAt = 0;
                    function dedupTap(fn) {
                        return (e) => {
                            const now = Date.now();
                            if (now - _lastTapAt < 350) return; // swallow the duplicate event
                            _lastTapAt = now;
                            e.preventDefault();
                            fn();
                        };
                    }
                    const goPrev = dedupTap(() => goTo(domIdx - 1));
                    const goNext = dedupTap(() => goTo(domIdx + 1));
                    prevBtn.addEventListener('click', goPrev);
                    nextBtn.addEventListener('click', goNext);
                    prevBtn.addEventListener('touchend', goPrev, { passive: false });
                    nextBtn.addEventListener('touchend', goNext, { passive: false });
                }
            }

            refreshRevealAnimations(craftGrid);
        }

        // ============================================
        // PRODUCT FUNCTIONS WITH CACHING
        // ============================================
        async function loadProducts(showLoadingIndicator = true) {
            if (productsLoaded) {
                if (currentPage === 'shop') {
                    if (pendingCategory) {
                        const cat = pendingCategory;
                        pendingCategory = null;
                        filterProducts(cat);
                        updateActiveCategory(cat);
                    } else {
                        filteredProducts = [...products];
                        displayProducts();
                    }
                }
                return products;
            }

            const cached = getCachedProducts();
            if (cached) {
                products = cached;
                filteredProducts = [...products];
                productsLoaded = true;
                _productsFetchPromise = null;
                if (currentPage === 'shop') {
                    if (pendingCategory) {
                        const cat = pendingCategory;
                        pendingCategory = null;
                        filterProducts(cat);
                        updateActiveCategory(cat);
                    } else {
                        filteredProducts = [...products];
                        displayProducts();
                    }
                }
                return products;
            }

            if (_productsFetchPromise) return _productsFetchPromise;

            _productsFetchPromise = (async () => {
                try {
                    let rawProducts;
                    // Prefer API v2 -- returns correct image_url without admin/uploads/ prefix
                    if (window.__LUFA_USE_V2 && typeof LufaApi !== 'undefined' && LufaApi.getProducts) {
                        const json = await LufaApi.getProducts({ per_page: 100 });
                        rawProducts = json?.products ?? json ?? [];
                    } else {
                        rawProducts = await fetchAPI('get_products');
                    }
                    const rawArray = Array.isArray(rawProducts) ? rawProducts : (rawProducts?.data || rawProducts || []);
                    // Normalize product data from API v2 to the shape app-legacy.js expects.
                    // Legacy shape uses `category` (string), API v2 uses `category_name`.
                    // Legacy sizes have `price` as number; API v2 returns string prices.
                    products = rawArray.map(p => ({
                        ...p,
                        // category: openProductModal() calls .charAt(0) on it -- must be a string
                        category: p.category || p.category_name || p.category_code || 'Craft',
                        // price: API v2 returns string; openProductModal() calls .toFixed(2)
                        price:    parseFloat(p.price) || 0,
                        // image_url: fix paths to resolve relative to the site root
                        image_url: p.image_url ? normalizePublicAssetUrl(p.image_url)
                                 : (p.image_path ? normalizePublicAssetUrl(p.image_path)
                                 : DEFAULT_MEDIA_FALLBACK),
                        // sizes: ensure price is a number (openProductModal calls .toFixed(2))
                        sizes: (p.sizes || []).map(s => ({
                            ...s,
                            price:  parseFloat(s.price)  || 0,
                            weight: parseFloat(s.weight_kg || s.weight) || 0,
                        })),
                    }));
                    filteredProducts = [...products];
                    productsLoaded = true;
                    _productsFetchPromise = null;

                    setCachedProducts(products);
                    syncCartMetadata();
                    displayFeaturedProducts();   // always refresh homepage featured

                    if (currentPage === 'shop') {
                        if (pendingCategory) {
                            const cat = pendingCategory;
                            pendingCategory = null;
                            filterProducts(cat);
                            updateActiveCategory(cat);
                        } else {
                            filteredProducts = [...products];
                            displayProducts();
                        }
                    }

                    return products;
                } catch (error) {
                    console.error('Error loading products:', error);
                    products = [];
                    filteredProducts = [];
                    pendingCategory = null;
                    _productsFetchPromise = null;
                    if (currentPage === 'shop') {
                        displayProducts();
                    }
                    return [];
                }
            })();

            return _productsFetchPromise;
        }

        // ============================================
        // HOMEPAGE FEATURED PRODUCTS
        // ============================================
        function displayFeaturedProducts() {
            const grid = document.getElementById('homeFeaturedGrid');
            if (!grid) return;

            if (!products || products.length === 0) {
                // Keep any server-rendered cards; only blank + hide when there
                // is genuinely nothing to show. See EMPTY-SECTION RULE above.
                if (grid.querySelector('.product-card')) return;
                grid.innerHTML = '';
                setEmptySectionVisible('homeFeatured', false);
                return;
            }

            // Prefer explicitly featured products; fall back to first 5
            let featured = products.filter(p => p.featured == 1 || p.featured === true || p.featured === '1');
            if (featured.length === 0) featured = products.slice(0, 5);
            featured = featured.slice(0, 5);

            if (featured.length === 0) {
                if (grid.querySelector('.product-card')) return;
                grid.innerHTML = '';
                setEmptySectionVisible('homeFeatured', false);
                return;
            }

            setEmptySectionVisible('homeFeatured', true);

            grid.innerHTML = featured.map(product => {
                const hasSizes  = product.sizes && product.sizes.length > 0;
                const minPrice  = hasSizes
                    ? Math.min(...product.sizes.map(s => parseFloat(s.price) || 0))
                    : (parseFloat(product.price) || 0);
                const sizeLabel = getProductCardSizeLabel(product);
                return `
                    <div class="product-card" data-id="${product.id}" data-category="${escapeHtml(product.category || '')}" tabindex="0" role="button" aria-label="View ${escapeHtml(product.name)}">
                        <div class="product-image">
                            <div class="product-img">
                                <img src="${product.image_url || DEFAULT_MEDIA_FALLBACK}" onerror="${imageErrorHandler(DEFAULT_MEDIA_FALLBACK)}"
                                     alt="${escapeHtml(product.name)}"
                                     class="product-image-content"
                                     loading="lazy" decoding="async">
                            </div>
                        </div>
                        <div class="product-info">
                            <div class="product-name-text">${escapeHtml(product.name)}</div>
                            <div class="product-price">
                                <span class="price-amount">K${minPrice.toFixed(2)}${hasSizes ? '<span class="price-from">+</span>' : ''}</span>
                                ${sizeLabel ? `<span class="size-info">${escapeHtml(sizeLabel)}</span>` : ''}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            grid.querySelectorAll('.product-card').forEach(card => {
                card.addEventListener('click', function () {
                    const productId = this.getAttribute('data-id');
                    const product   = products.find(p => p.id === productId);
                    if (product) openProductModal(product);
                });
                card.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.click();
                    }
                });
            });

            refreshRevealAnimations(grid);
        }

        function displayProducts() {
            const productsGrid = document.getElementById('productsGrid');
            const productsLoading = document.getElementById('productsLoading');
            const productsEmpty = document.getElementById('productsEmpty');
            
            if (!productsGrid) return;
            
            if (productsLoading) productsLoading.style.display = 'none';
            
            if (!filteredProducts || filteredProducts.length === 0) {
                if (productsEmpty) productsEmpty.style.display = 'flex';
                productsGrid.innerHTML = '';
                return;
            }
            
            if (productsEmpty) productsEmpty.style.display = 'none';
            
            productsGrid.innerHTML = filteredProducts.map(product => {
                const hasSizes  = product.sizes && product.sizes.length > 0;
                const minPrice  = hasSizes
                    ? Math.min(...product.sizes.map(s => parseFloat(s.price) || 0))
                    : (parseFloat(product.price) || 0);
                const sizeLabel = getProductCardSizeLabel(product);
                return `
                    <div class="product-card" data-id="${product.id}" data-category="${escapeHtml(product.category || '')}" tabindex="0" role="button" aria-label="View ${escapeHtml(product.name)}">
                        <div class="product-image">
                            <div class="product-img">
                                <img src="${product.image_url || DEFAULT_MEDIA_FALLBACK}" onerror="${imageErrorHandler(DEFAULT_MEDIA_FALLBACK)}"
                                     alt="${escapeHtml(product.name)}"
                                     class="product-image-content"
                                     loading="lazy" decoding="async">
                            </div>
                        </div>
                        <div class="product-info">
                            <div class="product-name-text">${escapeHtml(product.name)}</div>
                            <div class="product-price">
                                <span class="price-amount">K${minPrice.toFixed(2)}${hasSizes ? '<span class="price-from">+</span>' : ''}</span>
                                ${sizeLabel ? `<span class="size-info">${escapeHtml(sizeLabel)}</span>` : ''}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            productsGrid.querySelectorAll('.product-card').forEach(card => {
                card.addEventListener('click', function () {
                    const productId = this.getAttribute('data-id');
                    const product   = products.find(p => p.id === productId);
                    if (product) openProductModal(product);
                });
                card.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.click();
                    }
                });
            });

            refreshRevealAnimations(productsGrid);
        }

        function filterProducts(category = 'all') {
            const productsGrid = document.getElementById('productsGrid');

            if (productsGrid) {
                productsGrid.classList.add('is-refreshing');
            }

            requestAnimationFrame(() => {
                if (category === 'all' || category === '') {
                    filteredProducts = [...products];
                } else {
                    const normalizedCategory = category.toLowerCase();
                    filteredProducts = products.filter(product => {
                        const productCategory = getProductCategoryRecord(product);
                        const possibleValues = [
                            product.category,
                            product.category_id,
                            productCategory?.slug,
                            productCategory?.name,
                            productCategory?.id
                        ].filter(Boolean).map(value => String(value).toLowerCase());
                        return possibleValues.includes(normalizedCategory);
                    });
                }
                
                currentCategory = category;
                displayProducts();
                updateActiveCategory(category);
                if (productsGrid) {
                    requestAnimationFrame(() => {
                        productsGrid.classList.remove('is-refreshing');
                    });
                }
            });
        }

        function searchProducts(searchTerm) {
            if (!searchTerm || searchTerm.length < 2) {
                filterProducts(currentCategory);
                return;
            }
            
            const term = searchTerm.toLowerCase();
            filteredProducts = products.filter(product => {
                const searchableText = [
                    product.name,
                    product.description,
                    product.category,
                    product.product_code,
                    product.id
                ].filter(Boolean).join(' ').toLowerCase();
                return searchableText.includes(term);
            });
            
            displayProducts();
        }

        function sortProducts(sortBy) {
            switch (sortBy) {
                case 'price-low':
                    filteredProducts.sort((a, b) => {
                        const aPrice = a.sizes && a.sizes.length > 0 ? Math.min(...a.sizes.map(s => s.price)) : a.price;
                        const bPrice = b.sizes && b.sizes.length > 0 ? Math.min(...b.sizes.map(s => s.price)) : b.price;
                        return aPrice - bPrice;
                    });
                    break;
                    
                case 'price-high':
                    filteredProducts.sort((a, b) => {
                        const aPrice = a.sizes && a.sizes.length > 0 ? Math.min(...a.sizes.map(s => s.price)) : a.price;
                        const bPrice = b.sizes && b.sizes.length > 0 ? Math.min(...b.sizes.map(s => s.price)) : b.price;
                        return bPrice - aPrice;
                    });
                    break;
                    
                case 'name-asc':
                    filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                    
                default:
                    break;
            }
            
            displayProducts();
        }

        function updateActiveCategory(category) {
            document.querySelectorAll('.category-nav-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.getAttribute('data-category') === category) {
                    btn.classList.add('active');
                }
            });
        }

        // ============================================
        // FAQ FUNCTIONS
        // ============================================
        // EMPTY-STATE RULE (Volume 1)
        // A collection-backed section resolves to exactly one of three states:
        //   1. has records  -> render them
        //   2. loaded, zero records -> render the CMS-managed empty copy
        //   3. load failed  -> render a distinct "temporarily unavailable" line
        // States 2 and 3 must never be conflated: an API failure previously
        // rendered as "no records", which reads as deliberately empty content.
        // Neither state leaves a spinner on screen and neither invents records.
        let faqsLoadFailed = false;

        async function loadFaqs(showLoadingIndicator = true) {
            const cached = lsCache.get('faqs', 30 * 60 * 1000);
            if (cached) {
                faqs = cached;
                faqsLoadFailed = false;
                displayFaqs();
                return faqs;
            }
            try {
                const data = await fetchAPI('get_faqs');
                faqs = Array.isArray(data) ? data : [];
                faqsLoadFailed = false;
                lsCache.set('faqs', faqs);
                displayFaqs();
                return faqs;
            } catch (error) {
                console.error('Error loading FAQs:', error);
                faqs = [];
                faqsLoadFailed = true;
                displayFaqs();
                return [];
            }
        }

        function displayFaqs() {
            const faqsContent = document.getElementById('faqsContent');
            if (!faqsContent) return;

            if (!faqs || faqs.length === 0) {
                const supplementsCopy = cmsPages?.storefront?.supplements || {};
                const message = faqsLoadFailed
                    ? 'We could not load this section just now. Please refresh the page or try again shortly.'
                    : (supplementsCopy.faqs_empty_text || 'Answers to common questions are being prepared and will appear here soon.');
                faqsContent.innerHTML = `<div class="empty-state empty-state-compact"><p>${escapeHtml(message)}</p></div>`;
                return;
            }
            
            faqsContent.innerHTML = faqs.map((faq) => {
                const isInitiallyOpen = false;
                return `
                <div class="faq-item${isInitiallyOpen ? ' active' : ''}" id="faq-${faq.id}">
                    <div class="faq-question" role="button" tabindex="0" aria-expanded="${isInitiallyOpen ? 'true' : 'false'}" aria-controls="faq-answer-${faq.id}">
                        <h3>${escapeHtml(faq.question)}</h3>
                        <span class="faq-toggle-icon" aria-hidden="true">${isInitiallyOpen ? '-' : '+'}</span>
                    </div>
                    <div class="faq-answer" id="faq-answer-${faq.id}">
                        <p>${escapeHtml(faq.answer)}</p>
                    </div>
                </div>`;
            }).join('');

            initializeFAQs();
        }

        function initializeFAQs() {
            const faqItems = document.querySelectorAll('.faq-item');

            faqItems.forEach(item => {
                const question = item.querySelector('.faq-question');
                if (!question) return;

                const setIcon = (active) => {
                    const icon = question.querySelector('.faq-toggle-icon');
                    if (icon) icon.textContent = active ? '-' : '+';
                };

                const toggleItem = () => {
                    // Close all others
                    faqItems.forEach(other => {
                        if (other !== item && other.classList.contains('active')) {
                            other.classList.remove('active');
                            const otherQ = other.querySelector('.faq-question');
                            if (otherQ) {
                                otherQ.setAttribute('aria-expanded', 'false');
                                const otherIcon = otherQ.querySelector('.faq-toggle-icon');
                                if (otherIcon) otherIcon.textContent = '+';
                            }
                        }
                    });

                    item.classList.toggle('active');
                    const isActive = item.classList.contains('active');
                    question.setAttribute('aria-expanded', String(isActive));
                    setIcon(isActive);
                };

                question.onclick = toggleItem;
                question.onkeydown = (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleItem(); }
                };
            });
        }

        // ============================================
        // CARE INSTRUCTIONS FUNCTIONS
        // ============================================
        // See the EMPTY-STATE RULE note above loadFaqs().
        let careLoadFailed = false;

        async function loadCareInstructions(showLoadingIndicator = true) {
            const cached = lsCache.get('careInstructions', 30 * 60 * 1000);
            if (Array.isArray(cached) && cached.length > 0) {
                careInstructions = cached;
                careLoadFailed = false;
                displayCareInstructions();
                return careInstructions;
            }
            try {
                const data = await fetchAPI('get_care_instructions');
                careInstructions = Array.isArray(data) ? data : [];
                careLoadFailed = false;
                lsCache.set('careInstructions', careInstructions);
                displayCareInstructions();
                return careInstructions;
            } catch (error) {
                console.error('Error loading care instructions:', error);
                careInstructions = [];
                careLoadFailed = true;
                displayCareInstructions();
                return [];
            }
        }

        // Maps a care-card title keyword to a representative local image.
        const CARE_IMAGE_MAP = {
            basket:   'assets/images/baskets/hero3.jpeg',
            bilum:    'assets/images/bilums/hero1.jpeg',
            pottery:  'assets/images/potteries/pot (1).jpeg',
            ceramic:  'assets/images/potteries/pot (1).jpeg',
            rug:      'assets/images/rugs/rg (1).jpeg',
            artisan:  'assets/images/artisians/art (1).jpeg',
            craft:    'assets/images/artisians/art (1).jpeg',
            general:  'assets/images/baskets/bskt (1).jpeg',
        };

        function getCareImage(title) {
            const key = (title || '').toLowerCase();
            for (const [word, path] of Object.entries(CARE_IMAGE_MAP)) {
                if (key.includes(word)) return path;
            }
            return CARE_IMAGE_MAP.general;
        }

        function displayCareInstructions() {
            const careGrid = document.getElementById('careGrid');
            if (!careGrid) return;

            if (!careInstructions || careInstructions.length === 0) {
                const supplementsCopy = cmsPages?.storefront?.supplements || {};
                const message = careLoadFailed
                    ? 'We could not load this section just now. Please refresh the page or try again shortly.'
                    : (supplementsCopy.care_empty_text || 'Care instructions are being prepared and will appear here soon.');
                careGrid.innerHTML = `<div class="empty-state empty-state-compact"><p>${escapeHtml(message)}</p></div>`;
                return;
            }

            careGrid.innerHTML = careInstructions.map(care => {
                const icon  = care.icon || 'fa-hand-sparkles';
                const title = escapeHtml(care.title || '');
                const items = Array.isArray(care.items) ? care.items : [];
                const normalizedItems = items
                    .map(item => {
                        if (typeof item === 'string') return item;
                        if (item && typeof item === 'object') {
                            return item.item || item.text || item.label || item.instruction || '';
                        }
                        return '';
                    })
                    .filter(item => typeof item === 'string' && item.trim() !== '');
                return `
                    <div class="care-card">
                        <div class="care-card-icon-panel">
                            <div class="care-icon">
                                <i class="fas ${icon}" aria-hidden="true"></i>
                            </div>
                            <h3>${title}</h3>
                        </div>
                        <div class="care-card-body">
                            <ul>
                                ${normalizedItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ============================================
        // SETTINGS FUNCTIONS
        // ============================================
        async function loadSettings(showLoadingIndicator = true) {
            const cached = lsCache.get('settings', 10 * 60 * 1000);
            if (cached) {
                settings = cached;
                updateSettings();
                if (typeof LufaCms !== 'undefined') {
                    LufaCms.applySettings(settings);
                }
                return settings;
            }
            try {
                if (window.__LUFA_USE_V2 && typeof LufaApi !== 'undefined' && LufaApi.getSettingsPublic) {
                    settings = await LufaApi.getSettingsPublic();
                } else {
                    settings = await fetchAPI('get_public_settings');
                }
                lsCache.set('settings', settings);
                updateSettings();
                if (typeof LufaCms !== 'undefined') {
                    LufaCms.applySettings(settings);
                }
                return settings;
            } catch (error) {
                console.error('Error loading settings:', error);
                if (window.__LUFA_SETTINGS && Object.keys(window.__LUFA_SETTINGS).length > 0) {
                    settings = window.__LUFA_SETTINGS;
                }
                updateSettings();
                if (typeof LufaCms !== 'undefined') {
                    LufaCms.applySettings(settings);
                }
                return settings;
            }
        }
        function updateSettings() {
            const contactPhone = document.getElementById('contactPhone');
            const contactEmail = document.getElementById('contactEmail');
            const contactWhatsApp = document.getElementById('contactWhatsApp');
            const contactPhoneAction = document.getElementById('contactPhoneAction');
            const contactEmailAction = document.getElementById('contactEmailAction');
            const contactWhatsAppAction = document.getElementById('contactWhatsAppAction');
            const businessAddressLine = document.getElementById('businessAddressLine');
            const businessDomicileLine = document.getElementById('businessDomicileLine');
            const businessWebsiteUrl = document.getElementById('businessWebsiteUrl');
            
            const phoneText = settings.store_phone || '';
            const emailText = settings.store_email || '';
            const socialFacebookUrl = settings.social_facebook || settings.facebook || '';
            const socialInstagramUrl = settings.social_instagram || settings.instagram || '';
            const socialTikTokUrl = settings.social_tiktok || settings.tiktok || '';
            const socialLinkedInUrl = settings.social_linkedin || settings.linkedin || '';
            const socialWhatsAppUrl = settings.social_whatsapp || settings.whatsapp || '';
            const whatsappText = socialWhatsAppUrl ? socialWhatsAppUrl.replace('https://wa.me/', '') : '';
            const domicileText = settings.country_of_domicile || 'Papua New Guinea';
            const businessUrl = settings.business_website_url || `${window.location.origin}${window.location.pathname}`;
            
            if (contactPhone) {
                contactPhone.href = `tel:${phoneText.replace(/\s+/g, '')}`;
                contactPhone.innerHTML = `<i class="fas fa-phone-alt"></i> <span>${phoneText}</span>`;
            }
            if (contactEmail) {
                contactEmail.href = `mailto:${emailText}`;
                contactEmail.innerHTML = `<i class="fas fa-envelope"></i> <span>${emailText}</span>`;
            }
            if (contactWhatsApp) {
                contactWhatsApp.href = socialWhatsAppUrl || '';
                contactWhatsApp.innerHTML = `<i class="fab fa-whatsapp"></i> <span>${whatsappText}</span>`;
            }
            if (contactPhoneAction) {
                contactPhoneAction.onclick = () => {
                    window.location.href = `tel:${phoneText.replace(/\s+/g, '')}`;
                };
            }
            if (contactEmailAction) {
                contactEmailAction.onclick = () => {
                    window.location.href = `mailto:${emailText}`;
                };
            }
            if (contactWhatsAppAction) {
                contactWhatsAppAction.onclick = () => {
                    window.open(socialWhatsAppUrl || '', '_blank');
                };
            }
            
            const footerTagline = document.getElementById('footerTagline');
            const footerDescription = document.getElementById('footerDescription');
            const copyrightText = document.getElementById('copyrightText');
            if (footerTagline) {
                footerTagline.textContent = settings.footer_tagline || '';
                footerTagline.style.display = settings.footer_tagline ? 'block' : 'none';
            }
            if (footerDescription) footerDescription.textContent = settings.footer_description || 'Directly sourcing authentic PNG crafts from rural artisans. Preserving cultural heritage through sustainable craftsmanship.';
            if (copyrightText) {
                if (!copyrightText.dataset.defaultHtml) copyrightText.dataset.defaultHtml = copyrightText.innerHTML;
                if (settings.footer_copyright) {
                    copyrightText.textContent = settings.footer_copyright;
                } else {
                    copyrightText.innerHTML = copyrightText.dataset.defaultHtml;
                }
            }
            if (businessAddressLine) businessAddressLine.textContent = settings.store_address || 'Port Moresby, Papua New Guinea';
            if (businessDomicileLine) businessDomicileLine.textContent = domicileText;
            if (businessWebsiteUrl) {
                businessWebsiteUrl.href = businessUrl;
                businessWebsiteUrl.textContent = businessUrl;
            }
            
            const socialLinks = {
                socialFacebook: socialFacebookUrl,
                socialInstagram: socialInstagramUrl,
                socialWhatsApp: socialWhatsAppUrl,
                socialTikTok: socialTikTokUrl,
                socialLinkedIn: socialLinkedInUrl
            };

            Object.entries(socialLinks).forEach(([id, url]) => {
                const link = document.getElementById(id);
                if (!link) return;
                link.href = url || '#';
                link.style.display = url ? 'inline-flex' : 'none';
            });
            
            const shippingFromAddress = document.getElementById('shippingFromAddress');
            if (shippingFromAddress) {
                shippingFromAddress.innerHTML = `
                    <p>${settings.store_name || 'Like to Love Collections'}</p>
                    <p>${settings.store_address || 'Port Moresby, Papua New Guinea'}</p>
                    <p>Country of Domicile: ${domicileText}</p>
                    <p>Website: ${businessUrl}</p>
                    <p>Phone: ${settings.store_phone || ''}</p>
                    <p>Email: ${settings.store_email || ''}</p>
                `;
            }
            
            const quoteHeaderPhone = document.getElementById('quoteHeaderPhone');
            const quoteHeaderEmail = document.getElementById('quoteHeaderEmail');
            const quoteLogoImg = document.querySelector('.quote-logo-img');
            const receiptBrandLogo = document.getElementById('receiptBrandLogo');
            const documentLogoUrl = getDocumentLogoUrl();
            
            if (quoteHeaderPhone) quoteHeaderPhone.textContent = settings.store_phone || '';
            if (quoteHeaderEmail) quoteHeaderEmail.textContent = settings.store_email || '';
            if (quoteLogoImg) quoteLogoImg.src = documentLogoUrl;
            if (receiptBrandLogo) receiptBrandLogo.src = documentLogoUrl;
            
            const contactInfoPhone = document.getElementById('contactInfoPhone');
            const contactInfoEmail = document.getElementById('contactInfoEmail');
            
            if (contactInfoPhone) contactInfoPhone.textContent = settings.store_phone || '';
            if (contactInfoEmail) contactInfoEmail.textContent = settings.store_email || '';
            
            const fumigationDescription = document.getElementById('fumigationDescription');
            if (fumigationDescription && settings.fumigation_fee) {
                fumigationDescription.textContent = `Add certified fumigation for categories that require export treatment (+K${Number(settings.fumigation_fee).toFixed(2)} per item).`;
            }
            
            const freightDescription = document.getElementById('freightDescription');
            if (freightDescription && settings.freight_fee) {
                freightDescription.textContent = `Professional packing and freight arrangement with DHL/FedEx/UPS (+K${Number(settings.freight_fee || 100).toFixed(2)})`;
            }
            
            const freightInfoContent = document.getElementById('freightInfoContent');
            if (freightInfoContent) {
                freightInfoContent.innerHTML = `
                    <p><strong>Payment:</strong> We do not accept online payments. Please select your pickup option and we will contact you within 24 hours to finalize arrangements.</p>
                    <p><strong>Port Moresby:</strong> Collection can be coordinated directly with our team after checkout.</p>
                    <p><strong>Outside Port Moresby:</strong> Delivery and freight costs are calculated after we review your destination details.</p>
                `;
            }
            
            const quoteNotesList = document.getElementById('quoteNotesList');
            if (quoteNotesList) {
                const fumigationCategories = categories
                    .filter(category => category.requires_fumigation)
                    .map(category => category.name)
                    .join(', ');
                // Approved published quote notes (Volume 1). The fumigation line
                // stays data-driven: it names the categories actually flagged
                // requires_fumigation rather than asserting a fixed list.
                quoteNotesList.innerHTML = `
                    <li>This quote includes product costs and fumigation service only.</li>
                    <li>Freight costs are not included and will be calculated separately based on destination.</li>
                    <li>Exchange rates are fetched in real time and may fluctuate.</li>
                    <li>Fumigation is required for international shipments for applicable categories${fumigationCategories ? `: ${escapeHtml(fumigationCategories)}` : ''}.</li>
                    <li>Shipping time: 7-14 business days for international shipments.</li>
                    <li>Customs duties and taxes are not included and are the recipient's responsibility.</li>
                    <li>Quote valid for 7 days due to currency fluctuations.</li>
                    <li>Contact ${settings.store_phone || ''} or ${settings.store_email || ''} to proceed.</li>
                `;
            }
        }

        function hasMeaningfulCmsValue(value) {
            if (typeof value === 'string') {
                return value.trim() !== '';
            }
            return value !== null && value !== undefined;
        }

        function preserveCmsSectionFields(existingSection = {}, nextSection = {}, criticalKeys = []) {
            const mergedSection = { ...(nextSection || {}) };

            criticalKeys.forEach((key) => {
                const existingValue = existingSection?.[key];
                const nextValue = nextSection?.[key];

                if (hasMeaningfulCmsValue(existingValue) && !hasMeaningfulCmsValue(nextValue)) {
                    mergedSection[key] = existingValue;
                }
            });

            return Object.keys(mergedSection).length > 0 ? mergedSection : (existingSection || nextSection || {});
        }

        function stabilizeCmsPagesPayload(nextPages) {
            if (!nextPages || typeof nextPages !== 'object') {
                return cmsPages;
            }

            const stablePages = {
                ...nextPages,
                hero: preserveCmsSectionFields(cmsPages?.hero, nextPages?.hero, [
                    'title_line1',
                    'title_line2',
                    'highlight_word',
                    'description',
                    'button1_text',
                    'button1_link',
                    'button2_text',
                    'button2_link',
                    'frame1_image',
                    'frame2_image',
                    'frame3_image',
                    'hero_image'
                ]),
                // No critical keys for this section. The call is kept so an empty
                // about payload still falls back to the previously loaded one.
                about: preserveCmsSectionFields(cmsPages?.about, nextPages?.about, [])
            };

            const storefront = nextPages?.storefront || {};
            stablePages.storefront = {
                ...storefront,
                homepage: preserveCmsSectionFields(cmsPages?.storefront?.homepage, storefront.homepage, [
                    'contact_title',
                    'contact_subtitle',
                    'contact_form_title'
                ]),
                shop: preserveCmsSectionFields(cmsPages?.storefront?.shop, storefront.shop, [
                    'hero_title',
                    'hero_subtitle'
                ]),
                blog: preserveCmsSectionFields(cmsPages?.storefront?.blog, storefront.blog, [
                    'hero_title',
                    'hero_subtitle',
                    'section_title',
                    'section_subtitle'
                ]),
                supplements: preserveCmsSectionFields(cmsPages?.storefront?.supplements, storefront.supplements, [
                    'hero_title',
                    'hero_subtitle'
                ])
            };

            return stablePages;
        }
        async function loadCmsPages(showLoadingIndicator = true) {
            const cmsCacheKey = 'cmsPages_v3_' + (window.__LUFA_CONTENT_HASH || '');
            const cached = lsCache.get(cmsCacheKey, 10 * 60 * 1000);
            // Guard: only use cache if it has real hero content (not the old empty-array form)
            const cachedHeroKeys = cached?.hero && !Array.isArray(cached.hero)
                ? Object.keys(cached.hero).length
                : 0;
            if (cached && cachedHeroKeys > 0) {
                const cmsChanged = JSON.stringify(cached) !== JSON.stringify(cmsPages);
                cmsPages = cached;
                if (cmsChanged) {
                    applyCmsPages();
                }
            }
            try {
                let result = null;

                // CMS page data may be nested when older content exists, so normalize it against the current schema.
                // sub-key that doesn't exist in the Phase 4+ API v2 DB structure.
                // Always prefer LufaApi.getCmsPages() (API v2) which reads the correct structure.
                if (window.__LUFA_USE_V2 && typeof LufaApi !== 'undefined' && LufaApi.getCmsPages) {
                    result = await LufaApi.getCmsPages();
                } else {
                    result = await fetchAPI('get_cms_pages', { _: Date.now() });
                }

                result = stabilizeCmsPagesPayload(result);

                // Guard: only apply if we got real hero data; never overwrite with empty
                if (result && result.hero && Object.keys(result.hero).length > 0) {
                    const cmsChanged = JSON.stringify(result) !== JSON.stringify(cmsPages);
                    cmsPages = result;
                    lsCache.set(cmsCacheKey, cmsPages);
                    if (cmsChanged) {
                        applyCmsPages();
                    }
                }
                return cmsPages;
            } catch (error) {
                console.error('Error loading CMS pages:', error);
                // Do NOT overwrite cmsPages ? bootstrap data (window.__LUFA_BOOTSTRAP_CMS)
                // was already applied in initializeApp(). Overwriting with empty would hide
                // the hero title and buttons.
                return cmsPages;
            }
        }

        async function loadDedicatedPagesCms(showLoadingIndicator = true) {
            const cacheKey = 'dedicatedPages_v1_' + (window.__LUFA_CONTENT_HASH || '');
            const cached = lsCache.get(cacheKey, 10 * 60 * 1000);
            if (cached && typeof cached === 'object') {
                const dedicatedChanged = JSON.stringify(cached) !== JSON.stringify(dedicatedPagesCms);
                dedicatedPagesCms = cached;
                if (dedicatedChanged) {
                    applyDedicatedPagesCms();
                }
            }

            const embedded = window.__LUFA_BOOTSTRAP_DEDICATED_PAGES || {};
            const dedicatedChanged = JSON.stringify(embedded) !== JSON.stringify(dedicatedPagesCms);
            dedicatedPagesCms = embedded;
            if (dedicatedChanged) applyDedicatedPagesCms();
            return dedicatedPagesCms;
        }

        function applyDedicatedPagesCms() {
            const blogCopy = cmsPages?.storefront?.blog || {};
            const supplementsCopy = cmsPages?.storefront?.supplements || {};
            const faqsPageCopy = dedicatedPagesCms?.faqs_page || {};
            const carePageCopy = dedicatedPagesCms?.care_page || {};
            const setText = (id, value, fallback = '') => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value || fallback;
                }
            };

            updatePageHeroImage(faqsPageCopy, 'faqsHeroImg', 'dp-faqs-title', 'dp-faqs-subtitle');
            updatePageHeroImage(carePageCopy, 'careHeroImg', 'dp-care-title', 'dp-care-subtitle');
            setText('dp-blog-title', blogCopy.hero_title, 'New Updates');
            setText('dp-blog-subtitle', blogCopy.hero_subtitle, 'Field updates, artisan spotlights, product drops, and behind-the-scenes moments from Like to Love Collections.');
            setText('blogSectionTitle', blogCopy.section_title, 'Latest Posts');
            setText('blogSectionSubtitle', blogCopy.section_subtitle, 'Published updates from Like to Love Collections');
            setText('blogHeroTitle', blogCopy.hero_title, 'Stories From The Weave');
            setText('blogHeroSubtitle', blogCopy.hero_subtitle, 'Field updates, artisan spotlights, product drops, and behind-the-scenes moments from Like to Love Collections.');
            updatePageHeroImage(blogCopy, 'blogHeroImg', 'dp-blog-title', 'dp-blog-subtitle');
            setText('supplementsHeroTitle', supplementsCopy.hero_title, 'Product Care & Information');
            setText('supplementsHeroSubtitle', supplementsCopy.hero_subtitle, 'Learn how to care for your handmade PNG treasures and find answers to common questions');
        }

        function applyCmsPages() {
            const hero = cmsPages?.hero || {};
            const about = cmsPages?.about || {};

            const heroContent = document.getElementById('heroContent');
            const heroBadge = document.getElementById('heroBadge');
            const heroBadgeText = document.getElementById('heroBadgeText');
            const heroTitleLine1 = document.getElementById('heroTitleLine1');
            const heroTitleLine2 = document.getElementById('heroTitleLine2');
            const heroDescription = document.getElementById('heroDescription');
            const heroActions = document.querySelector('.hero-actions');
            const heroBtn1Text = document.getElementById('heroBtn1Text');
            const heroBtn2Text = document.getElementById('heroBtn2Text');
            const heroBtn1 = document.getElementById('heroBtn1');
            const heroBtn2 = document.getElementById('heroBtn2');
            const heroStats = document.getElementById('heroStats');
            const stat1Icon = document.getElementById('stat1Icon');
            const stat1Number = document.getElementById('stat1Number');
            const stat1Label = document.getElementById('stat1Label');
            const stat2Icon = document.getElementById('stat2Icon');
            const stat2Number = document.getElementById('stat2Number');
            const stat2Label = document.getElementById('stat2Label');
            const stat3Icon = document.getElementById('stat3Icon');
            const stat3Number = document.getElementById('stat3Number');
            const stat3Label = document.getElementById('stat3Label');

            const heroTitleLine1Text = normalizeHeroText(hero.title_line1);
            const heroTitleLine2Text = normalizeHeroText(hero.title_line2);
            const heroHighlightText = normalizeHeroText(hero.highlight_word);
            const highlightBelongsToLine1 = heroTitleContainsHighlight(heroTitleLine1Text, heroHighlightText);
            const setElementVisibility = (element, isVisible) => {
                if (!element) return;
                element.hidden = !isVisible;
            };
            const setHeroStat = (iconId, numberElement, labelElement, iconName, fallbackIcon, numberValue, labelValue) => {
                const safeNumber = normalizeHeroText(numberValue);
                const safeLabel = normalizeHeroText(labelValue);
                const hasStatContent = Boolean(safeNumber || safeLabel);
                const statElement = numberElement?.closest('.stat') || labelElement?.closest('.stat');

                if (numberElement) numberElement.textContent = safeNumber;
                if (labelElement) labelElement.textContent = safeLabel;
                if (hasStatContent) {
                    setFontAwesomeIconClass(iconId, iconName, fallbackIcon);
                }
                setElementVisibility(statElement, hasStatContent);
                return hasStatContent;
            };
            const hasHeroLine1 = Boolean(heroTitleLine1Text);
            const hasHeroLine2 = Boolean(heroTitleLine2Text);
            const heroBadgeLabel = normalizeHeroText(hero.badge_text) || 'Home';
            const hasHeroBadge = Boolean(heroBadgeLabel);
            const hasHeroDescription = Boolean(normalizeHeroText(hero.description));
            const hasHeroButton1 = Boolean(normalizeHeroText(hero.button1_text));
            const hasHeroButton2 = Boolean(normalizeHeroText(hero.button2_text));

            if (heroBadgeText) heroBadgeText.textContent = heroBadgeLabel;
            setElementVisibility(heroBadge, hasHeroBadge);
            if (heroTitleLine1) {
                heroTitleLine1.innerHTML = buildHeroTitleLine(
                    heroTitleLine1Text,
                    heroHighlightText
                );
            }
            setElementVisibility(heroTitleLine1, hasHeroLine1);
            if (heroTitleLine2) {
                heroTitleLine2.innerHTML = buildHeroTitleLine(
                    heroTitleLine2Text,
                    highlightBelongsToLine1 ? '' : heroHighlightText
                );
            }
            setElementVisibility(heroTitleLine2, hasHeroLine2);
            if (heroDescription) heroDescription.textContent = hero.description || '';
            setElementVisibility(heroDescription, hasHeroDescription);
            if (heroBtn1Text) heroBtn1Text.textContent = hero.button1_text || '';
            if (heroBtn2Text) heroBtn2Text.textContent = hero.button2_text || '';
            setElementVisibility(heroBtn1, hasHeroButton1);
            setElementVisibility(heroBtn2, hasHeroButton2);
            if (heroBtn1) heroBtn1.href = hero.button1_link || '#';
            if (heroBtn2) heroBtn2.href = hero.button2_link || '#';
            setElementVisibility(heroActions, hasHeroButton1 || hasHeroButton2);

            const hasStat1 = setHeroStat('stat1Icon', stat1Number, stat1Label, hero.stat1_icon, 'fa-users', hero.stat1_number, hero.stat1_label);
            const hasStat2 = setHeroStat('stat2Icon', stat2Number, stat2Label, hero.stat2_icon, 'fa-map-marked-alt', hero.stat2_number, hero.stat2_label);
            const hasStat3 = setHeroStat('stat3Icon', stat3Number, stat3Label, hero.stat3_icon, 'fa-hand-holding-heart', hero.stat3_number, hero.stat3_label);
            setElementVisibility(heroStats, hasStat1 || hasStat2 || hasStat3);
            const aboutStoryTitle = document.getElementById('aboutStoryTitle');
            const aboutStorySubtitle = document.getElementById('aboutStorySubtitle');
            const aboutStoryHeading = document.getElementById('aboutStoryHeading');
            const aboutStoryP1 = document.getElementById('aboutStoryP1');
            const aboutStoryP2 = document.getElementById('aboutStoryP2');
            const detailCard1Title = document.getElementById('detailCard1Title');
            const detailCard1Text = document.getElementById('detailCard1Text');
            const detailCard1Icon = document.getElementById('detailCard1Icon');
            const detailCard2Title = document.getElementById('detailCard2Title');
            const detailCard2Text = document.getElementById('detailCard2Text');
            const detailCard2Icon = document.getElementById('detailCard2Icon');
            const detailCard3Title = document.getElementById('detailCard3Title');
            const detailCard3Text = document.getElementById('detailCard3Text');
            const detailCard3Icon = document.getElementById('detailCard3Icon');
            const visionTitle = document.getElementById('visionTitle');
            const visionText = document.getElementById('visionText');
            const missionTitle = document.getElementById('missionTitle');
            const missionText = document.getElementById('missionText');
            const craftSectionTitle = document.getElementById('craftSectionTitle');
            const craftSectionSubtitle = document.getElementById('craftSectionSubtitle');
            const setAboutIconClass = (element, iconName, fallback) => {
                if (!element) return;
                const normalized = String(iconName || fallback || '')
                    .trim()
                    .replace(/^fas\s+/, '')
                    .replace(/^fa\s+/, '');
                const iconClass = normalized && !normalized.startsWith('fa-')
                    ? `fa-${normalized.replace(/^[-\s]+/, '')}`
                    : normalized;
                element.className = iconClass ? `fas ${iconClass}` : `fas ${fallback}`;
            };

            if (aboutStoryTitle) aboutStoryTitle.textContent = about.story_title || '';
            if (aboutStorySubtitle) aboutStorySubtitle.textContent = about.story_subtitle || '';
            if (aboutStoryHeading) aboutStoryHeading.textContent = about.story_heading || '';
            if (aboutStoryP1) aboutStoryP1.textContent = about.story_paragraph1 || '';
            if (aboutStoryP2) aboutStoryP2.textContent = about.story_paragraph2 || '';
            if (detailCard1Title) detailCard1Title.textContent = about.detail_card1_title || '';
            if (detailCard1Text) detailCard1Text.textContent = about.detail_card1_text || '';
            if (detailCard2Title) detailCard2Title.textContent = about.detail_card2_title || '';
            if (detailCard2Text) detailCard2Text.textContent = about.detail_card2_text || '';
            if (detailCard3Title) detailCard3Title.textContent = about.detail_card3_title || '';
            if (detailCard3Text) detailCard3Text.textContent = about.detail_card3_text || '';
            setAboutIconClass(detailCard1Icon, about.detail_card1_icon, 'fa-map-marked-alt');
            setAboutIconClass(detailCard2Icon, about.detail_card2_icon, 'fa-graduation-cap');
            setAboutIconClass(detailCard3Icon, about.detail_card3_icon, 'fa-truck');
            if (visionTitle) visionTitle.textContent = about.vision_title || '';
            if (visionText) visionText.textContent = about.vision_text || '';
            if (missionTitle) missionTitle.textContent = about.mission_title || '';
            if (missionText) missionText.textContent = about.mission_text || '';
            if (craftSectionTitle) craftSectionTitle.textContent = about.craft_section_title || '';
            if (craftSectionSubtitle) craftSectionSubtitle.textContent = about.craft_section_subtitle || '';

            // Blog Hero
            const blog = cmsPages?.blog || {};
            const blogHeroTitle = document.getElementById('blogHeroTitle');
            const blogHeroSubtitle = document.getElementById('blogHeroSubtitle');
            if (blogHeroTitle) blogHeroTitle.textContent = blog.title || 'Stories From The Weave';
            if (blogHeroSubtitle) blogHeroSubtitle.textContent = blog.subtitle || 'Field updates, artisan spotlights, product drops, and behind-the-scenes moments from Like to Love Collections.';

            // Contact section titles -- set from server-bootstrap data
            const _sf = cmsPages?.storefront || {};
            const _hp = _sf.homepage || {};
            const _setIfEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            _setIfEl('contactSectionTitle',       _hp.contact_title        || '');
            _setIfEl('contactSectionSubtitle',    _hp.contact_subtitle     || '');
            _setIfEl('contactFormTitle',          _hp.contact_form_title   || '');

            applyDedicatedPagesCms();
            updateHeroImageFromSettings();
        }

        let latestUpdates = [];

        async function loadSocialPosts(showLoadingIndicator = true) {
            try {
                const data = await fetchAPI('get_social_posts');
                socialPosts = Array.isArray(data) ? data : [];
                return socialPosts;
            } catch (error) {
                console.error('Error loading social posts:', error);
                socialPosts = [];
                return [];
            }
        }

        async function loadLatestUpdates() {
            const cached = lsCache.get('latestUpdates', 10 * 60 * 1000);
            if (cached) {
                latestUpdates = cached;
                displayBlogUpdatesSection();
                return;
            }
            try {
                const data = await fetchAPI('get_updates');
                latestUpdates = Array.isArray(data) ? data : [];
                lsCache.set('latestUpdates', latestUpdates);
            } catch (error) {
                console.error('Error loading updates:', error);
                latestUpdates = [];
            }
            displayBlogUpdatesSection();
        }

        function displayBlogUpdatesSection() {
            const blogUpdatesGrid = document.getElementById('blogUpdatesGrid');
            if (!blogUpdatesGrid) return;

            const updatesSection = blogUpdatesGrid.closest('section');
            const catLabels = {
                announcement: 'Announcement',
                news: 'News',
                'artisan-story': 'Artisan Story',
                promotion: 'Promotion',
                event: 'Event',
                community: 'Community',
            };

            const updatesToRender = Array.isArray(latestUpdates) ? latestUpdates : [];
            if (updatesToRender.length === 0) {
                blogUpdatesGrid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-bullhorn"></i>
                        <p>No published posts yet.</p>
                    </div>`;
                if (updatesSection) updatesSection.style.display = '';
                return;
            }

            if (updatesSection) updatesSection.style.display = '';
            blogUpdatesGrid.innerHTML = updatesToRender.map(u => {
                const dateStr = u.publish_date || u.created_at;
                const catLabel = catLabels[u.category] || u.category || 'Update';
                const imgSrc = cssSafeImageUrl(u.image_url || 'assets/images/baskets/hero3.jpeg');
                const copySource = u.excerpt || u.content || u.description || u.title || ''; 
                const formattedDate = dateStr
                    ? new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                    : 'Latest update';
                return `
                    <article class="update-card">
                        <div class="update-card-image">
                            <img src="${imgSrc}" alt="${escapeHtml(u.title)}" loading="lazy" decoding="async">
                        </div>
                        <div class="update-card-body">
                            <div class="update-card-platforms">
                                <span class="update-platform">${escapeHtml(catLabel)}</span>
                            </div>
                            <div class="update-card-date">${formattedDate}</div>
                            <h3 class="update-card-title">${escapeHtml(u.title)}</h3>
                            <p class="update-card-copy">${escapeHtml(truncateText(copySource, 200))}</p>
                        </div>
                    </article>`;
            }).join('');
        }

        function displaySocialPostsSection() {
            displayBlogUpdatesSection();
        }

        // ============================================
        // PRODUCT MODAL FUNCTIONS
        // ============================================
        function openProductModal(product) {
            selectedProduct = product;
            selectedSize = null;
            
            const modalImage = document.getElementById('modalProductImage');
            const modalCategory = document.getElementById('modalProductCategory');
            const modalName = document.getElementById('modalProductName');
            const modalDescription = document.getElementById('modalProductDescription');
            const modalProductDimensions = document.getElementById('modalProductDimensions');
            const modalProductWeight = document.getElementById('modalProductWeight');
            const modalProductCode = document.getElementById('modalProductCode');
            const sizeSection = document.getElementById('sizeSection');
            const sizeOptions = document.getElementById('sizeOptions');
            const fumigationSection = document.getElementById('fumigationSection');
            
            if (!modalImage || !modalCategory || !modalName || !modalDescription) return;
            
            modalImage.innerHTML = `<img src="${product.image_url || DEFAULT_MEDIA_FALLBACK}" onerror="${imageErrorHandler(DEFAULT_MEDIA_FALLBACK)}" alt="${escapeHtml(product.name)}" style="width:100%;height:100%;object-fit:cover;">`;
            // Guard: category may be null/undefined if product has no category assigned
            const cat = product.category || product.category_name || product.category_code || 'Craft';
            modalCategory.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
            modalName.textContent = product.name;
            modalDescription.textContent = product.description;
            if (modalProductCode && product.product_code) {
                modalProductCode.textContent = product.product_code;
            }

            // Always populate weight, dimensions and category care instructions
            if (modalProductDimensions) {
                modalProductDimensions.textContent = product.dimensions || '-';
            }
            if (modalProductWeight) {
                modalProductWeight.textContent = product.weight || '-';
            }
            const careEl = document.getElementById('modalProductCare');
            if (careEl) {
                careEl.textContent = product.category_care ||
                    'Store away from direct sunlight. Spot-clean with a damp cloth. Natural fibres may flex with use - this is characteristic of all handwoven materials.';
            }

            const normalizedSizes = getNormalizedProductSizes(product);

            if (normalizedSizes.length > 0 && sizeSection && sizeOptions) {
                sizeSection.style.display = 'block';
                sizeOptions.innerHTML = '';
                normalizedSizes.forEach((size, index) => {
                    const sizeOption = document.createElement('div');
                    sizeOption.className = 'size-option';
                    if (index === 0) {
                        sizeOption.classList.add('active');
                        selectedSize = size;
                    }
                    sizeOption.innerHTML = `
                        <div class="size-info">
                            <div class="size-name">${escapeHtml(size.name)}</div>
                            <div class="size-details">${escapeHtml(size.dimensions || '')}</div>
                        </div>
                        <div class="size-price">K${size.price.toFixed(2)}</div>
                    `;
                    sizeOption.addEventListener('click', function() {
                        document.querySelectorAll('.size-option').forEach(opt => opt.classList.remove('active'));
                        this.classList.add('active');
                        selectedSize = size;
                        updateModalPrice();
                    });
                    sizeOptions.appendChild(sizeOption);
                });
                
                updateModalPrice();
            } else {
                if (sizeSection) sizeSection.style.display = 'none';
                const modalProductPrice = document.getElementById('modalProductPrice');
                const priceNote = document.getElementById('priceNote');
                
                if (modalProductPrice) modalProductPrice.textContent = `K${product.price.toFixed(2)}`;
                if (priceNote) priceNote.textContent = '';
            }
            
            const requiresFumigation = productRequiresFumigation(product);
            selectedFumigation = requiresFumigation;
            const fumigationCheckbox = document.querySelector('input[name="fumigation"][value="yes"]');
            if (fumigationSection) {
                fumigationSection.style.display = requiresFumigation ? 'block' : 'none';
            }
            if (fumigationCheckbox) {
                fumigationCheckbox.checked = requiresFumigation;
                fumigationCheckbox.disabled = !requiresFumigation;
            }
            
            const quantityInput = document.querySelector('.quantity-input');
            if (quantityInput) quantityInput.value = 1;
            
            const addToCartBtn = document.getElementById('addToCartBtn');
            if (addToCartBtn) {
                addToCartBtn.onclick = function(e) {
                    e.stopPropagation();
                    addToCart(product);
                    closeModal('productModal');
                    showNotification(`${product.name} added to cart!`, 'success');
                };
            }
            
            const fumigationCheckboxes = document.querySelectorAll('input[name="fumigation"]');
            fumigationCheckboxes.forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    selectedFumigation = requiresFumigation && this.checked && this.value === 'yes';
                });
            });
            
            displayRelatedProducts(product);
            openModal('productModal');
        }

        function displayRelatedProducts(product) {
            const section = document.getElementById('relatedProductsSection');
            const grid    = document.getElementById('relatedProductsGrid');
            if (!section || !grid) return;

            const related = products.filter(p =>
                p.id !== product.id &&
                p.category === product.category
            ).slice(0, 4);

            if (related.length === 0) {
                section.style.display = 'none';
                return;
            }

            section.style.display = 'block';

            grid.innerHTML = related.map(p => {
                const hasSizes = p.sizes && p.sizes.length > 0;
                const minPrice = hasSizes
                    ? Math.min(...p.sizes.map(s => parseFloat(s.price) || 0))
                    : (parseFloat(p.price) || 0);
                return `
                    <div class="product-card" data-id="${p.id}" data-category="${escapeHtml(p.category || '')}" tabindex="0" role="button" aria-label="View ${escapeHtml(p.name)}">
                        <div class="product-image"><div class="product-img">
                            <img src="${p.image_url || DEFAULT_MEDIA_FALLBACK}" alt="${escapeHtml(p.name)}" class="product-image-content" loading="lazy" decoding="async" onerror="${imageErrorHandler(DEFAULT_MEDIA_FALLBACK)}">
                        </div></div>
                        <div class="product-info">
                            <div class="product-name-text">${escapeHtml(p.name)}</div>
                            <div class="product-price">
                                <span class="price-amount">K${minPrice.toFixed(2)}${hasSizes ? '+' : ''}</span>
                            </div>
                        </div>
                    </div>`;
            }).join('');

            grid.querySelectorAll('.product-card').forEach(card => {
                card.addEventListener('click', function () {
                    const pid  = this.getAttribute('data-id');
                    const prod = products.find(p => p.id === pid);
                    if (prod) openProductModal(prod);
                });
                card.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
                });
            });
        }

        function updateModalPrice() {
            if (!selectedSize) return;
            
            const modalProductPrice = document.getElementById('modalProductPrice');
            const priceNote = document.getElementById('priceNote');
            const modalProductDimensions = document.getElementById('modalProductDimensions');
            const modalProductWeight = document.getElementById('modalProductWeight');
            
            if (modalProductPrice) modalProductPrice.textContent = `K${selectedSize.price.toFixed(2)}`;
            if (priceNote) priceNote.textContent = selectedSize.name;
            if (modalProductDimensions) modalProductDimensions.textContent = selectedSize.dimensions || 'N/A';
            if (modalProductWeight) modalProductWeight.textContent = selectedSize.weight || 'N/A';
        }

        // ============================================
        // CART FUNCTIONS
        // ============================================
        function addToCart(product) {
            const quantityInput = document.querySelector('.quantity-input');
            const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;
            let price, size, dimensions, weight, variantCode;

            if (getNormalizedProductSizes(product).length > 0 && selectedSize) {
                price = selectedSize.price;
                size = selectedSize.name;
                dimensions = selectedSize.dimensions;
                weight = selectedSize.weight;
                // Volume 5: carry the STABLE variant identifier. A variant used
                // to be addressed by its display name, so renaming one orphaned
                // every cart holding it, and a name that matched nothing fell
                // back to the base price server-side. variant_code is generated
                // once and never reused.
                variantCode = selectedSize.variant_code || null;
            } else {
                price = product.price;
                size = 'Standard Size';
                dimensions = product.dimensions;
                weight = product.weight;
                variantCode = null;
            }
            
            const weightMatch = weight ? weight.match(/(\d+\.?\d*)/) : null;
            const weightKg = weightMatch ? parseFloat(weightMatch[1]) : 0.5;
            
            const existingItem = cart.find(item => 
                item.id === product.id && 
                item.size === size &&
                item.fumigation === selectedFumigation
            );
            
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                const cartItem = {
                    id: product.id,
                    product_code: product.product_code || '',
                    name: product.name,
                    price: price,
                    image: product.image_url || '',
                    quantity: quantity,
                    category: product.category,
                    category_id: product.category_id || '',
                    size: size,
                    variant_code: variantCode,
                    dimensions: dimensions,
                    weight: weight,
                    weightKg: weightKg,
                    requires_fumigation: productRequiresFumigation(product),
                    fumigation: selectedFumigation
                };
                
                cart.push(cartItem);
            }
            
            updateCartUI();
            scheduleServerQuoteRefresh();
            
            const cartBtn = document.getElementById('cartBtn');
            const desktopCartBtn = document.getElementById('desktopCartBtn');
            
            if (cartBtn) cartBtn.classList.add('pulse-animation');
            if (desktopCartBtn) desktopCartBtn.classList.add('pulse-animation');
            setTimeout(() => {
                if (cartBtn) cartBtn.classList.remove('pulse-animation');
                if (desktopCartBtn) desktopCartBtn.classList.remove('pulse-animation');
            }, 600);

            return cart;
        }

        function removeFromCart(productId, size, fumigation) {
            cart = cart.filter(item => !(item.id === productId && item.size === size && item.fumigation === fumigation));
            updateCartUI();
            scheduleServerQuoteRefresh();
            showNotification('Item removed from cart', 'success');
            return cart;
        }

        function updateQuantity(productId, size, fumigation, change) {
            const item = cart.find(item => item.id === productId && item.size === size && item.fumigation === fumigation);
            if (item) {
                item.quantity += change;
                if (item.quantity < 1) {
                    removeFromCart(productId, size, fumigation);
                } else {
                    updateCartUI();
                    scheduleServerQuoteRefresh();
                }
            }

            return cart;
        }

        /**
         * Ask the server to re-price the cart, then redraw (Volume 5).
         *
         * Debounced, because quantity buttons fire in bursts. The redraw runs
         * whether or not the quote arrives — the local estimate keeps the UI
         * responsive — but the figures the customer acts on come from the
         * server as soon as it answers.
         *
         * Nothing about the layout changes: this only replaces the NUMBERS that
         * the existing markup already displays.
         */
        let _quoteRefreshTimer = null;
        function scheduleServerQuoteRefresh() {
            clearTimeout(_quoteRefreshTimer);
            _quoteRefreshTimer = setTimeout(async () => {
                await refreshServerQuote();
                updateCartUI();
                updateOrderPreview();
            }, 250);
        }

        function updateCartUI() {
            // Every cart mutation funnels through here — add, remove, quantity
            // change and clear — so this is the one place persistence belongs.
            persistCart();

            const totalItems = cart.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
            const cartCountElements = document.querySelectorAll('.cart-count');
            const itemsCountElements = document.querySelectorAll('.items-count');
            
            cartCountElements.forEach(element => {
                element.textContent = totalItems > 0 ? totalItems : '';
                element.style.display = totalItems > 0 ? 'flex' : 'none';
            });

            itemsCountElements.forEach(element => {
                element.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'}`;
            });
            
            const cartItems = document.getElementById('cartItems');
            const cartEmpty = document.getElementById('cartEmpty');
            const cartSummary = document.getElementById('cartSummary');
            
            if (!cartItems || !cartEmpty || !cartSummary) return;
            
            if (cart.length === 0) {
                cartEmpty.style.display = 'flex';
                cartSummary.style.display = 'none';
                shippingOption = '';
                document.querySelectorAll('input[name="shippingOption"]').forEach(cb => cb.checked = false);
            } else {
                cartEmpty.style.display = 'none';
                cartSummary.style.display = 'block';
                
                cartItems.innerHTML = '';
                cart.forEach(item => {
                    const cartItem = document.createElement('div');
                    cartItem.className = 'cart-item fade-in';
                    
                    const fumigationText = item.fumigation && item.requires_fumigation ? ' | Fumigation included' : '';
                    const productCodeText = item.product_code ? ` | ${escapeHtml(item.product_code)}` : '';
                    
                    cartItem.innerHTML = `
                        <div class="cart-item-image" style="background-image: url('${item.image || 'assets/images/logo.png'}')"></div>
                        <div class="cart-item-details">
                            <div class="cart-item-name">${escapeHtml(item.name)}</div>
                            <div class="cart-item-meta">${escapeHtml(item.category)} | ${escapeHtml(item.size)}${productCodeText}${fumigationText}</div>
                            <div class="cart-item-price">K${(item.price * item.quantity).toFixed(2)}</div>
                        </div>
                        <div class="cart-item-actions">
                            <div class="quantity-control">
                                <button class="quantity-btn minus" data-id="${item.id}" data-size="${item.size}" data-fumigation="${item.fumigation}" aria-label="Decrease quantity">
                                    <i class="fas fa-minus" aria-hidden="true"></i>
                                </button>
                                <span class="quantity" aria-label="Quantity: ${item.quantity}">${item.quantity}</span>
                                <button class="quantity-btn plus" data-id="${item.id}" data-size="${item.size}" data-fumigation="${item.fumigation}" aria-label="Increase quantity">
                                    <i class="fas fa-plus" aria-hidden="true"></i>
                                </button>
                            </div>
                            <button class="remove-btn" data-id="${item.id}" data-size="${item.size}" data-fumigation="${item.fumigation}" aria-label="Remove ${escapeHtml(item.name)} from cart">
                                <i class="fas fa-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    `;
                    
                    cartItems.appendChild(cartItem);
                });
                
                setTimeout(() => {
                    cartItems.querySelectorAll('.quantity-btn.minus').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const id = this.getAttribute('data-id');
                            const size = this.getAttribute('data-size');
                            const fumigation = this.getAttribute('data-fumigation') === 'true';
                            updateQuantity(id, size, fumigation, -1);
                        });
                    });
                    
                    cartItems.querySelectorAll('.quantity-btn.plus').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const id = this.getAttribute('data-id');
                            const size = this.getAttribute('data-size');
                            const fumigation = this.getAttribute('data-fumigation') === 'true';
                            updateQuantity(id, size, fumigation, 1);
                        });
                    });
                    
                    cartItems.querySelectorAll('.remove-btn').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const id = this.getAttribute('data-id');
                            const size = this.getAttribute('data-size');
                            const fumigation = this.getAttribute('data-fumigation') === 'true';
                            removeFromCart(id, size, fumigation);
                        });
                    });
                }, 100);
            }
            
            updateCartTotal();
        }

        function updateCartTotal() {
            // Chosen before anything else: a missing or evidence-less method must
            // stop the submission here, not after the server has been asked.
            const chosenPayment = selectedPaymentMethod();
            const receiptInput  = document.getElementById('paymentReceipt');
            const receiptFile   = (receiptInput && receiptInput.files && receiptInput.files[0]) || null;

            if (!chosenPayment.id) {
                showNotification('Please choose a payment method.', 'error');
                return;
            }
            if (chosenPayment.requiresReceipt && !receiptFile) {
                showNotification('Please attach your payment receipt for a bank transfer.', 'error');
                return;
            }
            if (!chosenPayment.requiresReceipt && receiptFile) {
                showNotification('A receipt is only accepted for bank transfer orders.', 'error');
                return;
            }

            const subtotal = calculateSubtotal(cart);
            const fumigationFee = calculateFumigationFee(cart);
            const freightFee = getSelectedShippingFee();
            const total = subtotal + fumigationFee + freightFee;
            
            const cartSubtotal = document.getElementById('cartSubtotal');
            const cartTotal = document.getElementById('cartTotal');
            const fumigationCost = document.getElementById('fumigationCost');
            const fumigationItem = document.getElementById('fumigationItem');
            
            if (cartSubtotal) cartSubtotal.textContent = `K${subtotal.toFixed(2)}`;
            if (cartTotal) cartTotal.textContent = `K${total.toFixed(2)}`;
            
            if (fumigationFee > 0) {
                if (fumigationCost) fumigationCost.textContent = `K${fumigationFee.toFixed(2)}`;
                if (fumigationItem) fumigationItem.style.display = 'flex';
            } else {
                if (fumigationItem) fumigationItem.style.display = 'none';
            }
        }

        // ============================================
        // ORDER FUNCTIONS
        // ============================================
        /**
         * The idempotency key for the CURRENT checkout attempt.
         *
         * Generated once when the customer starts submitting and reused for
         * every retry of that same submission, which is the whole point: a key
         * regenerated per attempt identifies nothing. Cleared only after the
         * order is accepted, so a dropped connection followed by a second click
         * returns the first order instead of creating a second one.
         */
        let checkoutIdempotencyKey = null;

        /**
         * The payment method the customer chose.
         *
         * Read from the radio the SERVER rendered. body.php builds those inputs
         * from CheckoutPolicy::describeAvailable(), which is the same class that
         * decides whether to accept the identifier, so the value submitted here
         * cannot drift from the value the server allows.
         *
         * Release 58aba31 hard-coded 'invoice' at this point. The server has
         * never accepted that, so every guest order returned 422
         * PAYMENT_METHOD_UNAVAILABLE.
         */
        function selectedPaymentMethod() {
            const checked = document.querySelector('#paymentOptions input[name="paymentMethod"]:checked');
            if (!checked) return { id: '', requiresReceipt: false };
            return {
                id: checked.value,
                requiresReceipt: checked.dataset.requiresReceipt === '1',
            };
        }

        /** Show or hide the receipt field for the current selection. */
        function syncReceiptVisibility() {
            const section = document.getElementById('paymentReceiptSection');
            if (!section) return;
            const needed = selectedPaymentMethod().requiresReceipt;
            section.hidden = !needed;
            const input = document.getElementById('paymentReceipt');
            if (input && !needed) input.value = '';
        }

        document.addEventListener('change', (e) => {
            if (e.target && e.target.name === 'paymentMethod') syncReceiptVisibility();
        });

        async function submitOrder(orderType = 'order') {
            const shippingMethod = getSelectedShippingMethod();

            // FAIL CLOSED (Volume 5). Refresh the authoritative quote before
            // submitting. If the validator cannot be reached, the customer is
            // told and the submission stops here — previously the adapter
            // fabricated a successful validation and checkout carried on.
            const quote = await refreshServerQuote();
            if (!quote) {
                const err = new Error(serverQuoteError?.message || 'We could not check your cart. Please try again.');
                err.code = serverQuoteError?.code;
                err.details = serverQuoteError?.details;
                throw err;
            }

            const subtotal = calculateSubtotal(cart);
            const fumigationFee = calculateFumigationFee(cart);
            const total = calculateOrderTotal(cart);

            if (!checkoutIdempotencyKey) {
                checkoutIdempotencyKey = LufaApi.newIdempotencyKey();
            }

            const orderData = {
                customer_name: document.getElementById('fullName').value,
                customer_email: document.getElementById('email').value,
                customer_phone: document.getElementById('phone').value,
                country: document.getElementById('country').value,
                shipping_address: `${document.getElementById('address').value}, ${document.getElementById('city').value}, ${document.getElementById('postalCode').value}`,
                city: document.getElementById('city').value,
                province: document.getElementById('province').value,
                // What the customer chose. The backend resolves the product,
                // the variant and the price from these — nothing else in this
                // item is used for anything commercial.
                items: cart.map(item => ({
                    id: item.id,
                    product_id: item.id,
                    // Same rule as the quote: never transmit a placeholder
                    // variant name, or the order is refused exactly as the
                    // quote was.
                    ...cartItemVariantFields(item),
                    quantity: item.quantity,
                    // Sent so the server can warn when the displayed price has
                    // moved. It is never used to price the order.
                    price: item.price,
                })),
                // Retained for the confirmation screen and for older admin
                // views that still read them. The backend IGNORES every one of
                // these and recalculates; sending a different figure changes
                // nothing except a logged mismatch.
                subtotal: subtotal,
                fumigation_fee: fumigationFee,
                shipping_method: shippingMethod,
                total: total,
                order_type: orderType,
                payment_method: chosenPayment.id,
                payment_reference: (document.getElementById('paymentReference') || {}).value || ''
                // Deliberately no longer sent: shipping_fee (the server decides
                // the freight state), order_number and quote_number (allocated
                // server-side from a locked counter), and status.
            };

            try {
                const result = await LufaApi.createOrder(orderData, {
                    'Idempotency-Key': checkoutIdempotencyKey,
                }, receiptFile);

                if (result && result.success) {
                    // Accepted. Retire the key so a genuinely new order later
                    // is not mistaken for a retry of this one.
                    checkoutIdempotencyKey = null;
                    return result.data;
                }

                const error = new Error(result?.error || result?.message || 'Failed to submit order');
                error.code = result?.code;
                error.details = result?.details;

                // A rejected cart means the customer must change something, so
                // the next attempt is a DIFFERENT order and needs a new key.
                // A transport failure is not — that key must survive so the
                // retry is recognised as one.
                if (result?.code === 'CHECKOUT_VALIDATION_FAILED' || result?.code === 'INSUFFICIENT_STOCK') {
                    checkoutIdempotencyKey = null;
                    serverQuote = null;   // force a fresh quote before resubmitting
                }
                throw error;
            } catch (error) {
                console.error('Error submitting order:', error);
                throw error;
            }
        }

        function updateOrderPreview() {
            const orderPreview = document.getElementById('orderPreview');
            if (!orderPreview) return;
            
            const subtotal = calculateSubtotal(cart);
            const fumigationFee = calculateFumigationFee(cart);
            const freightFee = getSelectedShippingFee();
            const total = subtotal + fumigationFee + freightFee;
            
            let shippingText = 'Quote Request (Custom shipping cost will be calculated based on your location)';
            if (getSelectedShippingMethod() === 'freight') {
                shippingText = `Freight Service Included (+K${Number(settings.freight_fee || 100).toFixed(2)})`;
            } else if (getSelectedShippingMethod() === 'pickup') {
                shippingText = 'Store Pickup (Free)';
            }
            
            const fumigationCount = calculateFumigationUnits(cart);
            const fumigationText = fumigationCount > 0 ? `Fumigation: ${fumigationCount} item(s) (+K${fumigationFee.toFixed(2)})` : 'No fumigation';
            
            orderPreview.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>Items:</strong> ${cart.reduce((sum, item) => sum + item.quantity, 0)} items
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Subtotal:</strong> K${subtotal.toFixed(2)}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>${fumigationText}</strong>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Shipping:</strong> ${shippingText}
                </div>
                <div style="font-weight: bold; color: var(--primary-brown);">
                    <strong>Total:</strong> K${total.toFixed(2)}
                </div>
            `;
        }

        function generateQuote() {
            const subtotal = calculateSubtotal(cart);
            const fumigationFee = calculateFumigationFee(cart);
            const freightFee = getSelectedShippingFee();

            const countrySelect = document.getElementById('country');
            if (!countrySelect) return;

            const countryCode = countrySelect.value;
            if (!countryCode) return;
            const selectedOption = countrySelect.options[countrySelect.selectedIndex];

            let totalWeightKg = 0;
            
            cart.forEach(item => {
                const weightMatch = item.weight ? item.weight.match(/(\d+\.?\d*)/) : null;
                const itemWeight = weightMatch ? parseFloat(weightMatch[1]) : 0.5;
                totalWeightKg += itemWeight * item.quantity;
            });
            
            const totalKina = subtotal + fumigationFee + freightFee;

            const now = new Date();
            const generatedQuoteNumber = buildReferenceNumber('LB-QT');
            const quoteNumber = document.getElementById('quoteNumber');
            const quoteDate = document.getElementById('quoteDate');
            
            if (quoteNumber) {
                quoteNumber.textContent = generatedQuoteNumber;
            }
            
            if (quoteDate) {
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                quoteDate.textContent = now.toLocaleDateString('en-US', options);
            }
            
            const address = document.getElementById('address');
            const city = document.getElementById('city');
            const postalCode = document.getElementById('postalCode');
            const shippingDestination = document.getElementById('shippingDestination');
            
            if (shippingDestination) {
                let countryText = selectedOption.text;
                
                shippingDestination.innerHTML = `
                    <p><strong>${escapeHtml(document.getElementById('fullName')?.value || 'Customer')}</strong></p>
                    <p>${address?.value || 'Not provided'}</p>
                    <p>${city?.value || 'Not provided'}, ${document.getElementById('province')?.value || 'Province'}, ${postalCode?.value || 'Not provided'}</p>
                    <p>${countryText}</p>
                `;
            }
            
            const freightCalculationDetails = document.getElementById('freightCalculationDetails');
            if (freightCalculationDetails) {
                freightCalculationDetails.innerHTML = `
                    <div style="margin-bottom: 4px;">
                        <strong>Total Weight:</strong> ${totalWeightKg.toFixed(2)} kg
                    </div>
                    <div style="margin-bottom: 4px;">
                        <strong>Note:</strong> Freight cost calculation shown for reference only. Actual freight cost will be calculated separately upon order confirmation.
                    </div>
                `;
            }
            
            const quoteItems = document.getElementById('quoteItems');
            if (quoteItems) {
                quoteItems.innerHTML = '';
                cart.forEach(item => {
                    const quoteItem = document.createElement('div');
                    quoteItem.className = 'quote-item';
                    const fumigationText = item.fumigation && item.requires_fumigation ? ' | Fumigation included' : '';
                    const productCodeText = item.product_code ? `${escapeHtml(item.product_code)} | ` : '';
                    
                    quoteItem.innerHTML = `
                        <div class="quote-item-details">
                            <div class="quote-item-name">${escapeHtml(item.name)}</div>
                            <div class="quote-item-meta">${productCodeText}${escapeHtml(item.size)} | Qty: ${item.quantity}${fumigationText}</div>
                        </div>
                        <div class="quote-item-price">K${(item.price * item.quantity).toFixed(2)}</div>
                    `;
                    quoteItems.appendChild(quoteItem);
                });
            }
            
            const quoteSubtotal = document.getElementById('quoteSubtotal');
            const quoteFumigation = document.getElementById('quoteFumigation');
            const quoteTotalKina = document.getElementById('quoteTotalKina');

            if (quoteSubtotal) quoteSubtotal.textContent = `K${subtotal.toFixed(2)}`;
            if (quoteFumigation) quoteFumigation.textContent = `K${fumigationFee.toFixed(2)}`;
            if (quoteTotalKina) quoteTotalKina.textContent = `K${totalKina.toFixed(2)}`;

            lastQuoteData = {
                quote_number: generatedQuoteNumber,
                quote_date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                customer_name: document.getElementById('fullName')?.value || '',
                customer_email: document.getElementById('email')?.value || '',
                customer_phone: document.getElementById('phone')?.value || '',
                country: selectedOption.text,
                country_code: countryCode,
                shipping_method: getSelectedShippingMethod(),
                shipping_fee: freightFee,
                subtotal: subtotal,
                fumigation_fee: fumigationFee,
                total_kina: totalKina,
                items: cart.map(item => ({ ...item })),
                shipping_address: [
                    document.getElementById('address')?.value,
                    document.getElementById('city')?.value,
                    document.getElementById('province')?.value,
                    document.getElementById('postalCode')?.value,
                    selectedOption.text
                ].filter(Boolean).join(', ')
            };
            
            closeModal('checkoutModal');
            openModal('quoteModal');
        }

        function downloadQuote() {
            if (isDownloadingQuote) {
                showNotification('Quote is already being generated. Please wait...', 'info');
                return;
            }
            
            isDownloadingQuote = true;
            
            try {
                const quoteContent = document.querySelector('.quote-content').cloneNode(true);
                const documentLogoUrl = getDocumentLogoUrl();

                const logoImg = quoteContent.querySelector('.quote-logo-img');
                if (logoImg) logoImg.src = documentLogoUrl;

                const actions = quoteContent.querySelector('.quote-actions');
                if (actions) actions.remove();
                
                const closeButtons = quoteContent.querySelectorAll('.modal-close, .btn-close, [onclick*="close"]');
                closeButtons.forEach(btn => btn.remove());
                
                const elementsWithOnclick = quoteContent.querySelectorAll('[onclick]');
                elementsWithOnclick.forEach(el => el.removeAttribute('onclick'));
                
                const downloadWindow = window.open('', '_blank');
                
                downloadWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <title>L2L Collections Quote - ${document.getElementById('quoteNumber')?.textContent || 'Quote'}</title>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet">
                            <style>
                                * { box-sizing: border-box; margin: 0; padding: 0; }
                                body { font-family: 'Montserrat', Arial, sans-serif; padding: 30px; background: white; color: #333; line-height: 1.5; }
                                .quote-header { background: white; color: #333; padding: 25px; border-bottom: 2px solid #1B4332; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
                                .quote-logo { display: flex; align-items: center; gap: 15px; }
                                .quote-logo-img { width: 60px; height: 60px; object-fit: contain; background: #f8f9fa; padding: 8px; border-radius: 8px; }
                                .quote-logo-text h2 { font-family: 'Playfair Display', serif; font-size: 24px; margin: 0 0 5px 0; color: #1B4332; }
                                .quote-logo-text p { font-size: 12px; color: #6c757d; margin: 0; font-style: italic; }
                                .quote-contact-info { text-align: right; font-size: 12px; line-height: 1.6; }
                                .quote-contact-info i { margin-right: 5px; color: #1B4332; }
                                .quote-details { padding: 0 20px; }
                                .quote-info { display: flex; justify-content: space-between; margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
                                .quote-number, .quote-date { font-weight: 600; }
                                h3 { font-size: 18px; color: #1B4332; margin: 25px 0 15px 0; font-family: 'Playfair Display', serif; }
                                .quote-shipping-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; background: #f8f9fa; padding: 20px; border-radius: 5px; }
                                .shipping-from h4, .shipping-to h4 { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: #1B4332; }
                                .shipping-address p, #shippingDestination p { margin: 5px 0; font-size: 14px; }
                                .freight-calculator { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 25px; }
                                .quote-items { margin: 25px 0; }
                                .quote-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e9ecef; }
                                .quote-item:last-child { border-bottom: none; }
                                .quote-item-details { flex: 1; }
                                .quote-item-name { font-weight: 600; margin-bottom: 3px; }
                                .quote-item-meta { font-size: 12px; color: #6c757d; }
                                .quote-item-price { font-weight: 700; color: #1B4332; }
                                .summary-table { margin: 20px 0; background: #f8f9fa; padding: 20px; border-radius: 5px; }
                                .summary-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e9ecef; }
                                .summary-row:last-child { border-bottom: none; }
                                .total-row { font-weight: bold; border-top: 2px solid #dee2e6; padding-top: 15px; margin-top: 10px; font-size: 16px; }
                                .note-row { background: #fff3cd; padding: 12px; border-radius: 4px; margin: 15px 0; color: #856404; }
                                .quote-notes { background: #EDF4F0; padding: 20px; border-radius: 5px; margin: 25px 0; border-left: 4px solid #1B4332; }
                                .quote-notes h3 { margin-top: 0; display: flex; align-items: center; gap: 8px; }
                                .quote-notes ul { list-style: none; padding-left: 0; }
                                .quote-notes li { padding: 5px 0 5px 20px; position: relative; }
                                .quote-notes li:before { content: "\\2022"; color: #1B4332; font-weight: bold; position: absolute; left: 0; }
                                .footer-note { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 11px; }
                                @media print { body { padding: 0; } .no-print { display: none; } }
                            </style>
                        </head>
                        <body>
                            ${quoteContent.outerHTML}
                            <div class="footer-note">
                                <p>This is a computer-generated quote. No signature required.</p>
                                <p>Country of domicile: ${settings.country_of_domicile || 'Papua New Guinea'} | Website: ${settings.business_website_url || `${window.location.origin}${window.location.pathname}`}</p>
                                <p>Generated on: ${new Date().toLocaleString()}</p>
                            </div>
                        </body>
                    </html>
                `);
                
                downloadWindow.document.close();
                
                setTimeout(() => {
                    downloadWindow.focus();
                    downloadWindow.print();
                    
                    setTimeout(() => {
                        isDownloadingQuote = false;
                    }, 3000);
                }, 500);
                
                showNotification('Quote generated successfully. Use browser print to save as PDF.', 'success');
                
            } catch (error) {
                console.error('Error generating quote:', error);
                showNotification('Failed to generate quote. Please try again.', 'error');
                isDownloadingQuote = false;
            }
        }

        function downloadReceipt() {
            if (isDownloadingQuote) {
                showNotification('Receipt is already being generated. Please wait...', 'info');
                return;
            }
            
            isDownloadingQuote = true;
            
            try {
                const documentLogoUrl = getDocumentLogoUrl();
                const orderData = lastOrderData || { 
                    order_number: document.getElementById('orderNumber').textContent,
                    order_date: document.getElementById('orderDate').textContent,
                    shipping_method: document.getElementById('shippingMethod').textContent,
                    items: cart,
                    subtotal: calculateSubtotal(cart),
                    fumigation_fee: calculateFumigationFee(cart),
                    total: calculateOrderTotal(cart)
                };
                
                const orderNumber = orderData.order_number || 'N/A';
                const orderDate = orderData.order_date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                const shippingMethod = orderData.shipping_method || 'Quote Request';
                const items = orderData.items || [];
                
                let itemsHTML = '';
                items.forEach(item => {
                    const fumigationText = item.fumigation && item.requires_fumigation ? ' (Fumigation Included)' : '';
                    const productCodeText = item.product_code ? `${escapeHtml(item.product_code)} - ` : '';
                    itemsHTML += `
                        <tr>
                            <td>${productCodeText}${escapeHtml(item.name)} (${escapeHtml(item.size)})${fumigationText}</td>
                            <td>${item.quantity}</td>
                            <td>K${(item.price * item.quantity).toFixed(2)}</td>
                        </tr>
                    `;
                });
                
                const subtotal = orderData.subtotal || items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const fumigationFee = orderData.fumigation_fee || calculateFumigationFee(items);
                const total = orderData.total || subtotal + fumigationFee;
                
                const downloadWindow = window.open('', '_blank');
                
                downloadWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <title>L2L Collections Receipt - ${orderNumber}</title>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet">
                            <style>
                                * { box-sizing: border-box; margin: 0; padding: 0; }
                                body { font-family: 'Montserrat', Arial, sans-serif; padding: 40px; background: white; color: #333; line-height: 1.6; }
                                .receipt { max-width: 700px; margin: 0 auto; border: 1px solid #ddd; padding: 30px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                                .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1B4332; padding-bottom: 20px; }
                                .logo { width: 80px; height: 80px; margin: 0 auto 10px; }
                                .logo img { width: 100%; height: 100%; object-fit: contain; }
                                h1 { font-size: 24px; color: #1B4332; margin-bottom: 5px; }
                                .subtitle { font-size: 14px; color: #666; }
                                .order-info { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                                .info-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
                                .info-row:last-child { border-bottom: none; }
                                .label { font-weight: 600; color: #333; }
                                .value { color: #666; }
                                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                                th { background: #1B4332; color: white; padding: 10px; text-align: left; }
                                td { padding: 10px; border-bottom: 1px solid #ddd; }
                                .totals { margin-top: 20px; border-top: 2px solid #333; padding-top: 10px; }
                                .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
                                .grand-total { font-weight: 700; font-size: 1.2rem; color: #1B4332; border-top: 1px solid #333; padding-top: 10px; margin-top: 10px; }
                                .contact { margin-top: 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #ddd; padding-top: 20px; }
                                @media print { body { padding: 0; } .receipt { border: none; box-shadow: none; } }
                            </style>
                        </head>
                        <body>
                            <div class="receipt">
                                <div class="header">
                                    <div class="logo">
                                        <img src="${documentLogoUrl}" alt="Like to Love Collections">
                                    </div>
                                    <h1>Like to Love Collections</h1>
                                    <div class="subtitle">Curated Elegance - Authentic Craftsmanship</div>
                                </div>
                                
                                <div class="order-info">
                                    <div class="info-row"><span class="label">Order Number:</span> <span class="value">${orderNumber}</span></div>
                                    <div class="info-row"><span class="label">Order Date:</span> <span class="value">${orderDate}</span></div>
                                    <div class="info-row"><span class="label">Shipping Method:</span> <span class="value">${shippingMethod}</span></div>
                                    <div class="info-row"><span class="label">Currency:</span> <span class="value">PGK</span></div>
                                </div>
                                
                                <h3>Order Items</h3>
                                <table>
                                    <thead><tr><th>Item (Size)</th><th>Qty</th><th>Total</th></tr></thead>
                                    <tbody>${itemsHTML || '<tr><td colspan="3">No items</td></tr>'}</tbody>
                                </table>
                                
                                <div class="totals">
                                    <div class="total-row"><span class="label">Subtotal:</span> <span>K${subtotal.toFixed(2)}</span></div>
                                    <div class="total-row"><span class="label">Fumigation Fee:</span> <span>K${fumigationFee.toFixed(2)}</span></div>
                                    <div class="total-row grand-total"><span class="label">Total:</span> <span>K${total.toFixed(2)}</span></div>
                                </div>
                                
                                <div class="contact">
                                    <p><strong>${settings.store_name || 'Like to Love Collections'}</strong><br>${settings.store_address || 'Port Moresby, Papua New Guinea'}<br>Country of Domicile: ${settings.country_of_domicile || 'Papua New Guinea'}<br>Website: ${settings.business_website_url || `${window.location.origin}${window.location.pathname}`}<br>Phone: ${settings.store_phone || ''}<br>Email: ${settings.store_email || ''}</p>
                                    <p>Thank you for choosing ${settings.store_name || 'Like to Love Collections'}.</p>
                                </div>
                            </div>
                        </body>
                    </html>
                `);
                
                downloadWindow.document.close();
                
                setTimeout(() => {
                    downloadWindow.focus();
                    downloadWindow.print();
                    
                    setTimeout(() => {
                        isDownloadingQuote = false;
                    }, 3000);
                }, 500);
                
                showNotification('Receipt generated successfully. Use browser print to save as PDF.', 'success');
                
            } catch (error) {
                console.error('Error generating receipt:', error);
                showNotification('Failed to generate receipt. Please try again.', 'error');
                isDownloadingQuote = false;
            }
        }

        function printQuote() {
            downloadQuote();
        }

        function getDocumentLogoUrl() {
            const fallbackUrl = new URL('public/assets/images/logo.png?v=20260819', window.location.href).toString();

            if (!settings || !settings.logo_url) {
                return fallbackUrl;
            }

            try {
                return new URL(settings.logo_url, window.location.href).toString();
            } catch (_error) {
                return fallbackUrl;
            }
        }

        async function processOrder(isQuote = false) {
            showLoading(true);
            
            try {
                const cartSnapshot = cart.map(item => ({ ...item }));
                const orderResult = await submitOrder(isQuote ? 'quote' : 'order');
                
                const now = new Date();
                const orderNumber = document.getElementById('orderNumber');
                const orderDate = document.getElementById('orderDate');
                const shippingMethod = document.getElementById('shippingMethod');
                const shippingMethodItem = document.getElementById('shippingMethodItem');
                const orderModalTitle = document.getElementById('orderModalTitle');
                
                lastOrderData = {
                    order_number: orderResult?.order_number || buildReferenceNumber(isQuote ? 'LB-QR' : 'LB-ORD'),
                    quote_number: isQuote ? (orderResult?.quote_number || lastQuoteData?.quote_number || null) : null,
                    order_type: isQuote ? 'quote' : 'order',
                    receipt_number: buildReferenceNumber('LB-RC'),
                    order_date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                    customer_name: document.getElementById('fullName')?.value || '',
                    customer_email: document.getElementById('email')?.value || '',
                    customer_phone: document.getElementById('phone')?.value || '',
                    shipping_address: [
                        document.getElementById('address')?.value,
                        document.getElementById('city')?.value,
                        document.getElementById('province')?.value,
                        document.getElementById('postalCode')?.value,
                        document.getElementById('country')?.value
                    ].filter(Boolean).join(', '),
                    items: cartSnapshot,
                    subtotal: calculateSubtotal(cartSnapshot),
                    fumigation_fee: calculateFumigationFee(cartSnapshot),
                    payment_method: orderResult?.payment_method || 'invoice',
                    payment_status: orderResult?.payment_status || 'pending_invoice',
                    payment_reference: orderResult?.payment_reference || '',
                    pickup_location_name: orderResult?.pickup_location_name || '',
                    pickup_location_address: orderResult?.pickup_location_address || ''
                };
                
                if (orderNumber) {
                    orderNumber.textContent = lastOrderData.order_number;
                }
                
                if (orderDate) {
                    orderDate.textContent = lastOrderData.order_date;
                }
                
                let shippingText = '';
                if (isQuote) {
                    shippingText = 'Formal Quotation Request';
                } else {
                    if (getSelectedShippingMethod() === 'freight') {
                        shippingText = `Freight Service (+K${Number(settings.freight_fee || 100).toFixed(2)})`;
                    } else if (getSelectedShippingMethod() === 'pickup') {
                        shippingText = 'Store Pickup';
                    } else {
                        shippingText = 'Quote Request';
                    }
                }
                
                if (shippingMethod) shippingMethod.textContent = shippingText;
                lastOrderData.shipping_method = shippingText;
                
                let shippingFee = getSelectedShippingFee();
                lastOrderData.total = lastOrderData.subtotal + lastOrderData.fumigation_fee + shippingFee;
                
                if (shippingMethodItem && shippingText) {
                    shippingMethodItem.style.display = 'flex';
                }

                const pickupLocationItem = document.getElementById('pickupLocationItem');
                const pickupLocationValue = document.getElementById('pickupLocationValue');
                if (pickupLocationItem && pickupLocationValue) {
                    if (lastOrderData.pickup_location_name) {
                        pickupLocationValue.textContent = lastOrderData.pickup_location_address
                            ? `${lastOrderData.pickup_location_name} -- ${lastOrderData.pickup_location_address}`
                            : lastOrderData.pickup_location_name;
                        pickupLocationItem.style.display = 'flex';
                    } else {
                        pickupLocationItem.style.display = 'none';
                    }
                }

                updatePaymentConfirmationUI(lastOrderData);
                
                updateOrderItemsList(lastOrderData.items);
                
                cart = [];
                cart = [];
                updateCartUI();
                
                const checkoutForm = document.getElementById('checkoutForm');
                if (checkoutForm) checkoutForm.reset();
                
                document.querySelectorAll('input[name="shippingOption"]').forEach(cb => cb.checked = false);
                
                isQuoteRequest = false;
                
                closeModal('checkoutModal');
                closeModal('quoteModal');
                openModal('orderModal');
                
                const confirmationMessage = document.querySelector('.confirmation-message');
                if (confirmationMessage) {
                    if (isQuote) {
                        confirmationMessage.textContent = 'Thank you for accepting the quote. Your request has been recorded and our team will contact you within 24 hours with the next steps.';
                    } else {
                        confirmationMessage.textContent = 'Thank you for your order. Our team will contact you within 24 hours to finalize arrangements.';
                    }
                }
                if (orderModalTitle) {
                    orderModalTitle.textContent = isQuote ? 'Quotation Request Received' : 'Order Confirmed!';
                }
            } catch (error) {
                console.error('Error processing order:', error);
                showNotification('Failed to process order. Please try again.', 'error');
            } finally {
                showLoading(false);
            }
        }


        function updateOrderItemsList(items = []) {
            const orderItemsList = document.getElementById('orderItemsList');
            const orderItemsDetails = document.getElementById('orderItemsDetails');

            if (!orderItemsList || !orderItemsDetails) return;
            
            orderItemsList.innerHTML = '';
            
            items.forEach(item => {
                const itemDetail = document.createElement('div');
                itemDetail.className = 'item-detail';
                const fumigationText = item.fumigation && item.requires_fumigation ? ' | Fumigation included' : '';
                const productCodeText = item.product_code ? `${escapeHtml(item.product_code)} | ` : '';
                
                itemDetail.innerHTML = `
                    <div>
                        <div class="item-name">${productCodeText}${escapeHtml(item.name)}</div>
                        <div class="item-quantity">${escapeHtml(item.size)} | Qty: ${item.quantity}${fumigationText}</div>
                    </div>
                    <div class="item-total">K${(item.price * item.quantity).toFixed(2)}</div>
                `;
                orderItemsList.appendChild(itemDetail);
            });
            
            if (items.length > 0) {
                orderItemsDetails.style.display = 'block';
            } else {
                orderItemsDetails.style.display = 'none';
            }
        }

        // ============================================
        // CONTACT FORM FUNCTIONS
        // ============================================
        async function submitContactForm(formData) {
            try {
                const result = await LufaApi.submitContact(formData);
                if (result && result.success) return true;
                throw new Error(result?.error || result?.message || 'Failed to submit message');
            } catch (error) {
                console.error('Error submitting contact form:', error);
                throw error;
            }
        }

        // ============================================
        // NEWSLETTER FUNCTION
        // ============================================
        async function subscribeNewsletter(email) {
            try {
                const result = await LufaApi.subscribeNewsletter(email);
                if (result && result.success) return true;
                throw new Error(result?.error || result?.message || 'Failed to subscribe');
            } catch (error) {
                console.error('Error subscribing to newsletter:', error);
                throw error;
            }
        }

        // ============================================
        // THEME FUNCTIONS
        // ============================================
        // ============================================
        // ANIMATION FUNCTIONS
        // ============================================
        let revealObserver = null;

        function setupPageAnimations() {
            document.body.classList.add('reveal-ready');
            if (!revealObserver) {
                revealObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('reveal-visible');
                            revealObserver.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
            }
            refreshRevealAnimations();
        }

        function registerRevealTargets(selectors, effect = 'up', baseDelay = 0, scope = document) {
            const elements = scope.querySelectorAll(selectors);
            elements.forEach((element, index) => {
                if (element.dataset.revealBound) return;
                // Carousel cards stay visible -- they animate via the scroll loop
                if (element.closest('.craft-slider-viewport')) {
                    element.classList.add('reveal-visible');
                    return;
                }
                element.dataset.revealBound = 'true';
                element.classList.add('reveal-on-scroll');
                if (effect === 'scale') element.classList.add('reveal-scale');
                else if (effect === 'fade') element.classList.add('reveal-fade');
                else if (effect === 'left') element.classList.add('reveal-left');
                if (baseDelay > 0) {
                    element.style.setProperty('--reveal-delay', `${(index % 6) * baseDelay}s`);
                }
                if (revealObserver) {
                    revealObserver.observe(element);
                } else {
                    element.classList.add('reveal-visible');
                }
            });
        }

        function refreshRevealAnimations(scope = document) {
            registerRevealTargets('.hero-content', 'up', 0, scope);
            registerRevealTargets('.hero-actions .btn', 'up', 0.06, scope);
            registerRevealTargets('.hero-stats .stat', 'scale', 0.08, scope);
            registerRevealTargets('.section-header', 'up', 0.05, scope);
            registerRevealTargets('.product-card, .care-card, .update-card, .faq-item', 'up', 0.06, scope);
            registerRevealTargets('.mission-card', 'left', 0.05, scope);
        }

        function animateHeroNumbers() {
            const counters = document.querySelectorAll('.stat-number[data-count]');
            
            counters.forEach(counter => {
                const target = parseInt(counter.getAttribute('data-count'));
                const increment = target / 100;
                let current = 0;
                
                const updateCounter = () => {
                    if (current < target) {
                        current += increment;
                        counter.textContent = Math.ceil(current) + (counter.textContent.includes('+') ? '+' : '');
                        setTimeout(updateCounter, 20);
                    } else {
                        counter.textContent = target + (counter.textContent.includes('+') ? '+' : '');
                    }
                };
                
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            updateCounter();
                            observer.unobserve(entry.target);
                        }
                    });
                });
                
                observer.observe(counter);
            });
        }
        // ============================================
        // NAVIGATION FUNCTIONS
        // ============================================
        // Sync the nav-link active highlight to the current page.
        // Home uses section-based highlighting (one button at a time);
        // all dedicated pages match by data-page.
        function updateNavActive(page) {
            document.querySelectorAll('.nav-link[data-page]').forEach(l => l.classList.remove('active'));

            if (page === 'home') {
                const homeBtn = document.querySelector('.nav-link[href="#hero"]');
                if (homeBtn) homeBtn.classList.add('active');
            } else {
                document.querySelectorAll(`.nav-link[data-page="${page}"]`)
                    .forEach(l => l.classList.add('active'));
            }
        }

        function showPage(page, options = {}) {
            if (isLoading) return;
            const { updateHash = true, href = '' } = options;

            currentPage = page;
            updateNavActive(page);

            document.querySelectorAll('.page-content').forEach(content => {
                content.classList.remove('active');
            });

            if (page === 'home') {
                const homePage = document.getElementById('homePage');
                if (homePage) homePage.classList.add('active');
                setHeroVisibility(true);
            } else if (page === 'shop') {
                const shopPage = document.getElementById('shopPage');
                if (shopPage) shopPage.classList.add('active');
                setHeroVisibility(false);
                updatePageHeroImage(cmsPages && cmsPages.storefront && cmsPages.storefront.shop ? cmsPages.storefront.shop : {}, 'shopHeroImg', 'shopHeroTitle', 'shopHeroSubtitle');

                if (!productsLoaded) {
                    loadProducts();
                } else {
                    if (!filteredProducts || filteredProducts.length === 0) {
                        filteredProducts = [...products];
                    }
                    displayProducts();
                }
            } else if (page === 'blog') {
                const blogPage = document.getElementById('blogPage');
                if (blogPage) blogPage.classList.add('active');
                setHeroVisibility(false);
                updatePageHeroImage(cmsPages && cmsPages.storefront && cmsPages.storefront.blog ? cmsPages.storefront.blog : {}, 'blogHeroImg', 'dp-blog-title', 'dp-blog-subtitle');
            } else if (page === 'faqs') {
                const fp = document.getElementById('faqsPage');
                if (fp) fp.classList.add('active');
                setHeroVisibility(false);
                loadFaqs(false);
            } else if (page === 'care') {
                const cp = document.getElementById('carePage');
                if (cp) cp.classList.add('active');
                setHeroVisibility(false);
                loadCareInstructions(false);
            } else if (page === 'terms') {
                const termsPage = document.getElementById('termsPage');
                if (termsPage) termsPage.classList.add('active');
                setHeroVisibility(false);
            } else if (page === 'privacy') {
                const privacyPage = document.getElementById('privacyPage');
                if (privacyPage) privacyPage.classList.add('active');
                setHeroVisibility(false);
            } else if (page === 'delivery') {
                const pg = document.getElementById('deliveryPage');
                if (pg) pg.classList.add('active');
                setHeroVisibility(false);
            } else if (page === 'returns') {
                const pg = document.getElementById('returnsPage');
                if (pg) pg.classList.add('active');
                setHeroVisibility(false);
            } else if (page === 'export') {
                const pg = document.getElementById('exportPage');
                if (pg) pg.classList.add('active');
                setHeroVisibility(false);
            }

            if (updateHash) {
                syncBrowserRoute(page, href);
            }

            window.scrollTo(0, 0);
            closeMobileMenu();

            const searchBar = document.getElementById('searchBar');
            if (searchBar) searchBar.classList.remove('active');
        }

        function setupNavigationObservers() {
            const navLinks = document.querySelectorAll('.nav-link[href^="#"]');

            // Build sectionId --' nav link map (first matching link wins)
            const sectionLinkMap = {};
            navLinks.forEach(link => {
                const href = link.getAttribute('href') || '';
                if (href.startsWith('#')) {
                    const id = href.slice(1);
                    if (!sectionLinkMap[id]) sectionLinkMap[id] = link;
                }
            });

            // Only observe sections that actually have a nav link
            const targets = Object.keys(sectionLinkMap)
                .map(id => document.getElementById(id))
                .filter(Boolean);

            if (!targets.length) return;

            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;

                    const id = entry.target.getAttribute('id');
                    const matchLink = sectionLinkMap[id];
                    if (!matchLink) return;

                    const dataPage = matchLink.getAttribute('data-page');

                    // Deactivate every nav link that shares the same data-page group,
                    // then activate only the one for this exact section.
                    // This gives "one button at a time" within the same page-group.
                    navLinks.forEach(l => {
                        if (l.getAttribute('data-page') === dataPage) {
                            l.classList.remove('active');
                        }
                    });
                    matchLink.classList.add('active');
                });
            }, {
                root: null,
                // Section activates when its top enters the upper half of the viewport
                rootMargin: '0px 0px -55% 0px',
                threshold: 0
            });

            targets.forEach(el => observer.observe(el));
        }

        function toggleMobileMenu() {
            const headerRight = document.querySelector('.header-right');
            const mobileMenuToggle = document.getElementById('mobileMenuToggle');
            
            if (!headerRight || !mobileMenuToggle) return;
            
            const isActive = headerRight.classList.contains('active');
            closeSearch();
            headerRight.classList.toggle('active');
            mobileMenuToggle.classList.toggle('active');
            mobileMenuToggle.setAttribute('aria-expanded', !isActive);
            
            if (!isActive) {
                mobileMenuToggle.setAttribute('aria-label', 'Close navigation menu');
                document.body.style.overflow = 'hidden';
            } else {
                mobileMenuToggle.setAttribute('aria-label', 'Open navigation menu');
                document.body.style.overflow = 'auto';
            }
        }

        function closeMobileMenu() {
            const headerRight = document.querySelector('.header-right');
            const mobileMenuToggle = document.getElementById('mobileMenuToggle');
            
            if (headerRight) headerRight.classList.remove('active');
            if (mobileMenuToggle) {
                mobileMenuToggle.classList.remove('active');
                mobileMenuToggle.setAttribute('aria-expanded', 'false');
                mobileMenuToggle.setAttribute('aria-label', 'Open navigation menu');
            }
            
            document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
                dropdown.classList.remove('active');
                const menu = dropdown.querySelector('.dropdown-menu');
                if (menu) menu.classList.remove('active');
            });
            
            document.body.style.overflow = 'auto';
        }

        // ============================================
        // SEARCH FUNCTIONS
        // ============================================
        function toggleSearch() {
            const searchBar = document.getElementById('searchBar');
            if (!searchBar) return;
            
            const isActive = searchBar.classList.contains('active');
            closeMobileMenu();
            
            if (!isActive) {
                searchBar.classList.add('active');
                const searchInput = document.querySelector('.search-input');
                if (searchInput) searchInput.focus();
                document.body.style.overflow = 'hidden';
            } else {
                closeSearch();
            }
        }

        function closeSearch() {
            const searchBar = document.getElementById('searchBar');
            const searchResults = document.getElementById('globalSearchResults');
            if (searchBar) {
                searchBar.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
            if (searchResults) {
                searchResults.classList.remove('active');
                searchResults.innerHTML = '';
            }
        }

        function buildGlobalSearchResults(searchTerm) {
            const normalizedTerm = searchTerm.trim().toLowerCase();
            if (normalizedTerm.length < 2) return [];

            const results = [];
            const pushResult = (result) => {
                if (!result.title || !result.description) return;
                results.push(result);
            };

            products.forEach(product => {
                const haystack = [
                    product.name,
                    product.description,
                    product.category,
                    product.product_code,
                    product.id
                ].filter(Boolean).join(' ').toLowerCase();

                if (haystack.includes(normalizedTerm)) {
                    pushResult({
                        type: 'Product',
                        icon: 'fas fa-box-open',
                        title: product.name,
                        description: truncateText(product.description || `${product.category} | ${product.product_code || product.id}`, 120),
                        meta: product.product_code || product.category || 'Product',
                        page: 'shop',
                        category: getCategoryKey(getProductCategoryRecord(product) || product.category),
                        productId: product.id
                    });
                }
            });

            categories.forEach(category => {
                const haystack = [category.name, category.description, category.code].filter(Boolean).join(' ').toLowerCase();
                if (haystack.includes(normalizedTerm)) {
                    pushResult({
                        type: 'Category',
                        icon: 'fas fa-tags',
                        title: category.name,
                        description: truncateText(category.description || `Browse ${category.name} products`, 120),
                        meta: category.code || 'Collection',
                        page: 'shop',
                        category: getCategoryKey(category)
                    });
                }
            });

            const hero = cmsPages?.hero || {};
            const about = cmsPages?.about || {};
            const cmsItems = [
                {
                    type: 'Homepage',
                    icon: 'fas fa-home',
                    title: [hero.title_line1, hero.title_line2].filter(Boolean).join(' ').trim() || 'Homepage',
                    description: hero.description || '',
                    page: 'home',
                    section: 'hero',
                    meta: 'Hero section'
                },
                {
                    type: 'About',
                    icon: 'fas fa-book-open',
                    title: about.story_title || 'Our Story',
                    description: `${about.story_paragraph1 || ''} ${about.story_paragraph2 || ''}`,
                    page: 'home',
                    section: 'about',
                    meta: 'About Like to Love Collections'
                }
            ];

            cmsItems.forEach(item => {
                const haystack = [item.title, item.description, item.meta].join(' ').toLowerCase();
                if (haystack.includes(normalizedTerm)) {
                    pushResult(item);
                }
            });

            faqs.forEach(faq => {
                const haystack = [faq.question, faq.answer].join(' ').toLowerCase();
                if (haystack.includes(normalizedTerm)) {
                    pushResult({
                        type: 'FAQ',
                        icon: 'fas fa-question-circle',
                        title: faq.question,
                        description: truncateText(faq.answer, 140),
                        meta: 'Frequently asked question',
                        page: 'faqs',
                        section: 'faqsPage'
                    });
                }
            });

            careInstructions.forEach(care => {
                const haystack = [care.title, ...(care.items || [])].join(' ').toLowerCase();
                if (haystack.includes(normalizedTerm)) {
                    pushResult({
                        type: 'Care',
                        icon: 'fas fa-hand-sparkles',
                        title: care.title,
                        description: truncateText((care.items || []).join(' | '), 140),
                        meta: 'Care instructions',
                        page: 'care',
                        section: 'carePage'
                    });
                }
            });

            socialPosts.filter(post => (post.status || 'published') === 'published').forEach(post => {
                const haystack = [post.title, post.content, ...(post.platforms || [])].filter(Boolean).join(' ').toLowerCase();
                if (haystack.includes(normalizedTerm)) {
                    pushResult({
                        type: 'Social',
                        icon: 'fas fa-bullhorn',
                        title: post.title || 'Social update',
                        description: truncateText(post.content, 140),
                        meta: (post.platforms || []).map(platform => getPlatformMeta(platform).label).join(', ') || 'Latest update',
                        page: 'home',
                        section: 'updates'
                    });
                }
            });

            return results.slice(0, 10);
        }

        function renderGlobalSearchResults(searchTerm) {
            const searchResults = document.getElementById('globalSearchResults');
            if (!searchResults) return;

            currentSearchResults = buildGlobalSearchResults(searchTerm);

            if (searchTerm.trim().length < 2) {
                searchResults.innerHTML = '';
                searchResults.classList.remove('active');
                return;
            }

            if (currentSearchResults.length === 0) {
                searchResults.innerHTML = `
                    <div class="search-empty">
                        <i class="fas fa-search"></i>
                        <div>No results found for "${escapeHtml(searchTerm)}"</div>
                    </div>
                `;
                searchResults.classList.add('active');
                return;
            }

            searchResults.innerHTML = currentSearchResults.map((result, index) => `
                <button type="button" class="search-result-item" data-search-index="${index}">
                    <div class="search-result-type"><i class="${result.icon}"></i>${escapeHtml(result.type)}</div>
                    <div class="search-result-title">${escapeHtml(result.title)}</div>
                    <div class="search-result-description">${escapeHtml(result.description)}</div>
                    <div class="search-result-meta">${escapeHtml(result.meta || '')}</div>
                </button>
            `).join('');
            searchResults.classList.add('active');
        }

        async function openSearchResult(result) {
            if (!result) return;

            if (result.page === 'shop') {
                showPage('shop');
                if (!productsLoaded) {
                    await loadProducts(false);
                }

                const shopSearch = document.getElementById('shopSearch');
                if (result.category) {
                    filterProducts(result.category);
                }
                if (result.productId) {
                    const product = products.find(item => item.id === result.productId);
                    if (shopSearch) shopSearch.value = result.title;
                    if (product) {
                        searchProducts(result.title);
                        setTimeout(() => openProductModal(product), 120);
                    }
                }
            } else {
                showPage(result.page || 'home');
                setTimeout(() => {
                    const target = result.section ? document.getElementById(result.section) || document.querySelector(`#${result.section}`) : null;
                    if (target) {
                        const headerHeight = document.querySelector('header')?.offsetHeight || 0;
                        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 12;
                        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
                    }
                }, 120);
            }

            closeSearch();
        }

        function globalSearch() {
            const searchInput = document.getElementById('globalSearchInput');
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.trim();
            renderGlobalSearchResults(searchTerm);

            if (currentSearchResults.length > 0) {
                openSearchResult(currentSearchResults[0]);
            }
        }

        // ============================================
        // MODAL FUNCTIONS
        // ============================================
        function openModal(modalId) {
            const modal = document.getElementById(modalId);
            if (!modal) return;
            
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (!modal) return;
            
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        function closeModals() {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
            document.body.style.overflow = 'auto';
        }

        function openCartModal() {
            updateCartUI();
            openModal('cartModal');
        }

        // ============================================
        // LEGAL PAGES FUNCTIONS
        // ============================================
        // -- Legal pages -- API v2 with JSON sections (no HTML tags) --
        async function loadLegalPages() {
            // Cache key includes the CMS content hash so any admin save immediately
            // invalidates this cache on the next page load (no stale-content window).
            const cacheKey = 'legalPages_v2_' + (window.__LUFA_CONTENT_HASH || '');
            const cached = lsCache.get(cacheKey, 30 * 60 * 1000);
            if (cached && cached.terms_title) {
                legalPages = buildLegalPagesMap(cached);
                ['terms','privacy','delivery','returns','export'].forEach(t => displayLegalPage(t));
                return;
            }
            // Legal markup is already embedded in index.html for the static build.
            return;
        }

        // Maps lb_cms_sections legal fields -- {terms:{title,subtitle,sections:[...]}, ...}
        function buildLegalPagesMap(raw) {
            function parseSections(v) {
                if (!v) return [];
                if (Array.isArray(v)) return v;
                const t = String(v).trimStart();
                if (t.startsWith('[')) {
                    try { const a = JSON.parse(v); if (Array.isArray(a)) return a; } catch(_) {}
                }
                const text = String(v).replace(/<[^>]+>/g,' ').replace(/\s{2,}/g,' ').trim();
                return text ? [{ heading: '', content: text }] : [];
            }
            const MAP = {
                terms:    { tf:'terms_title',    sf:'terms_subtitle',    cf:'terms_content' },
                privacy:  { tf:'privacy_title',  sf:'privacy_subtitle',  cf:'privacy_content' },
                delivery: { tf:'delivery_title', sf:'delivery_subtitle', cf:'delivery_content' },
                returns:  { tf:'returns_title',  sf:'returns_subtitle',  cf:'returns_content' },
                export:   { tf:'export_title',   sf:'export_subtitle',   cf:'export_content' },
            };
            const out = {};
            Object.entries(MAP).forEach(([key, {tf, sf, cf}]) => {
                out[key] = {
                    title:    raw[tf]  || '',
                    subtitle: raw[sf]  || '',
                    sections: parseSections(raw[cf] || ''),
                };
            });
            return out;
        }

        const LEGAL_PAGE_META = {
            terms:    { containerId: 'termsContent',    titleId: 'termsHeroTitle',    subtitleId: 'termsHeroSubtitle',    title: 'Terms of Service' },
            privacy:  { containerId: 'privacyContent',  titleId: 'privacyHeroTitle',  subtitleId: 'privacyHeroSubtitle',  title: 'Privacy Policy' },
            delivery: { containerId: 'deliveryContent', titleId: 'deliveryHeroTitle', subtitleId: 'deliveryHeroSubtitle', title: 'Delivery Policy' },
            returns:  { containerId: 'returnsContent',  titleId: 'returnsHeroTitle',  subtitleId: 'returnsHeroSubtitle',  title: 'Returns & Refund Policy' },
            export:   { containerId: 'exportContent',   titleId: 'exportHeroTitle',   subtitleId: 'exportHeroSubtitle',   title: 'Export Restrictions' },
        };

        function displayLegalPage(type) {
            const meta = LEGAL_PAGE_META[type];
            if (!meta) return;
            const container = document.getElementById(meta.containerId);
            if (!container) return;

            const page     = legalPages[type];
            const sections = page?.sections || [];

            // Sync hero title/subtitle from CMS data
            const titleEl    = document.getElementById(meta.titleId);
            const subtitleEl = document.getElementById(meta.subtitleId);
            if (titleEl    && page?.title)    titleEl.textContent    = page.title;
            if (subtitleEl && page?.subtitle) subtitleEl.textContent = page.subtitle;

            if (!page || !sections.length) {
                // Matches the server-rendered empty state in body.php.
                container.innerHTML = `
                    <div class="legal-empty">
                        <i class="fas fa-file-alt"></i>
                        <p>For details of this policy, please <a href="#contact" data-page="home">contact us</a> and our team will be glad to help.</p>
                    </div>`;
                return;
            }

            // Render each {heading, content} section -- no HTML tags required from admin.
            // Title and subtitle are already in the hero section above; render sections only.
            // Uses class "legal-item" (not "legal-section") to avoid the CSS rule that gives
            // the <section class="legal-section"> page wrapper its 5rem top/bottom padding.
            const sectionsHtml = sections.map(s => {
                const headHtml = s.heading
                    ? `<h3 class="legal-item-heading">${escapeHtml(s.heading)}</h3>` : '';
                const bodyHtml = (s.content || '').split(/\n\n+/)
                    .map(p => p.trim()).filter(Boolean)
                    .map(p => `<p>${escapeHtml(p).replace(/\n/g,'<br>')}</p>`)
                    .join('');
                return `<div class="legal-item">${headHtml}<div class="legal-item-body">${bodyHtml}</div></div>`;
            }).join('');

            container.innerHTML = `<div class="legal-content-body">${sectionsHtml}</div>`;
        }

        // ============================================
        // DATA REFRESH - REDUCED FREQUENCY
        // ============================================
        function startDataRefresh() {
            // Refresh every 15 minutes instead of 5 minutes
            setInterval(async () => {
                if (document.visibilityState === 'visible') {
                    await refreshData();
                }
            }, 900000);
        }

        async function refreshData() {
            try {
                await Promise.all([
                    loadCategories(false),
                    loadProducts(false),
                    loadFaqs(false),
                    loadCareInstructions(false),
                    loadSettings(false),
                    loadCmsPages(false),
                    loadDedicatedPagesCms(false),
                    loadLatestUpdates()
                ]);

                if (currentPage === 'home') {
                    displayCraftCategories();
                } else if (currentPage === 'shop' && productsLoaded) {
                    // Only refresh products if they're stale
                    const cached = getCachedProducts();
                    if (!cached) {
                        loadProducts();
                    }
                } else if (currentPage === 'terms') {
                    displayLegalPage('terms');
                } else if (currentPage === 'privacy') {
                    displayLegalPage('privacy');
                }
                
                updateCategoryNav();
                updateFooterCategories();
                updateHeroImageFromSettings();
                displayBlogUpdatesSection();
                // (No success logging: a live storefront should leave the
                //  browser console clean so a genuine error stands out.
                //  The failure below is still reported.)
            } catch (error) {
                console.error('Error refreshing data:', error);
            }
        }

        // ============================================
        // NOTIFICATION FUNCTIONS
        // ============================================
        function showNotification(message, type = 'success') {
            const notification = document.getElementById('notification');
            if (!notification) return;
            
            const icon = notification.querySelector('i');
            const messageEl = notification.querySelector('.notification-message');
            
            if (!icon || !messageEl) return;
            
            switch (type) {
                case 'error':
                    icon.className = 'fas fa-exclamation-circle';
                    notification.style.borderLeftColor = 'var(--error)';
                    break;
                case 'warning':
                    icon.className = 'fas fa-exclamation-triangle';
                    notification.style.borderLeftColor = 'var(--warning)';
                    break;
                default:
                    icon.className = 'fas fa-check-circle';
                    notification.style.borderLeftColor = 'var(--success)';
            }
            
            messageEl.textContent = message;
            notification.classList.add('show');
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, 5000);
            
            const closeBtn = notification.querySelector('.notification-close');
            if (closeBtn) {
                closeBtn.onclick = function() {
                    notification.classList.remove('show');
                };
            }
        }

        // ============================================
        // UTILITY FUNCTIONS
        // ============================================
        function escapeHtml(unsafe) {
            if (!unsafe) return '';
            return String(unsafe)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // ============================================
        // EVENT LISTENERS SETUP
        // ============================================
        function setupEventListeners() {
            const mobileMenuToggle = document.getElementById('mobileMenuToggle');
            const headerRight = document.querySelector('.header-right');
            
            if (mobileMenuToggle && headerRight) {
                mobileMenuToggle.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleMobileMenu();
                });

                document.addEventListener('click', function(e) {
                    if (!headerRight.contains(e.target) && !mobileMenuToggle.contains(e.target) && headerRight.classList.contains('active')) {
                        closeMobileMenu();
                    }
                });
            }

            // Shared handler for any element with data-page
            function handleDataPageClick(e) {
                e.preventDefault();
                const el = e.currentTarget;
                const href = el.getAttribute('href') || '';
                const page = el.getAttribute('data-page');
                const category = el.getAttribute('data-category');

                if (!page) return;

                if (category) {
                    if (productsLoaded) {
                        showPage(page, { href });
                        filterProducts(category);
                        updateActiveCategory(category);
                    } else {
                        pendingCategory = category;
                        showPage(page, { href });
                    }
                } else {
                    showPage(page, { href });
                    // Only scroll to the hash anchor when navigating WITHIN the home page
                    // (e.g. #about, #contact). For dedicated full-page routes
                    // (faqs, care, blog) showPage() already
                    // manages the scroll to top ? do not chase the anchor further.
                    const DEDICATED_PAGES = ['faqs','care','blog','terms','privacy','delivery','returns','export','shop'];
                    // href must name an actual target. The brand link in the
                    // header is href="#" with no fragment, and
                    // document.querySelector('#') is a SyntaxError, so clicking
                    // the logo threw an uncaught
                    //   "'#' is not a valid selector"
                    // on every home navigation. Nothing visibly broke, which is
                    // why it survived — but it fired on the busiest link on the
                    // site and buried real errors in the console.
                    if (href.length > 1 && href.startsWith('#') && !DEDICATED_PAGES.includes(page)) {
                        setTimeout(() => {
                            const target = document.querySelector(href);
                            if (target) {
                                const headerHeight = document.querySelector('header')?.offsetHeight || 0;
                                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
                                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
                            }
                        }, 100);
                    }
                }
                closeMobileMenu();
            }

            // Wire .nav-link[data-page] (navigation links)
            // Wire .nav-link[data-page] (navigation links)
            document.querySelectorAll('.nav-link[data-page]').forEach(link => {
                link.addEventListener('click', handleDataPageClick);
            });

            // Wire ALL other elements with data-page (CTA buttons, footer links, hero buttons, etc.)
            document.querySelectorAll('[data-page]:not(.nav-link)').forEach(el => {
                // Avoid wiring the same element twice
                if (!el.dataset.pageWired) {
                    el.dataset.pageWired = '1';
                    el.addEventListener('click', handleDataPageClick);
                }
            });

            const searchBtn = document.getElementById('searchBtn');
            const mobileSearchBtn = document.getElementById('mobileSearchBtn');
            const searchBar = document.getElementById('searchBar');
            const searchClose = document.getElementById('searchClose');
            const globalSearchInput = document.getElementById('globalSearchInput');
            const globalSearchBtn = document.getElementById('globalSearchBtn');
            
            if (searchBtn && searchBar) {
                searchBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleSearch();
                });
            }
            
            if (mobileSearchBtn && searchBar) {
                mobileSearchBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleSearch();
                });
            }
            
            if (searchClose && searchBar) {
                searchClose.addEventListener('click', function(e) {
                    e.stopPropagation();
                    closeSearch();
                });
            }
            
            if (globalSearchInput) {
                globalSearchInput.addEventListener('input', debounce(function(e) {
                    renderGlobalSearchResults(e.target.value);
                }, 200));
                globalSearchInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        globalSearch();
                    }
                });
            }
            
            if (globalSearchBtn) {
                globalSearchBtn.addEventListener('click', globalSearch);
            }

            const globalSearchResults = document.getElementById('globalSearchResults');
            if (globalSearchResults) {
                globalSearchResults.addEventListener('click', function(e) {
                    const resultButton = e.target.closest('[data-search-index]');
                    if (!resultButton) return;
                    const result = currentSearchResults[Number(resultButton.getAttribute('data-search-index'))];
                    openSearchResult(result);
                });
            }

            document.addEventListener('click', function(e) {
                const searchBar = document.getElementById('searchBar');
                const searchBtn = document.getElementById('searchBtn');
                const mobileSearchBtn = document.getElementById('mobileSearchBtn');
                
                if (searchBar && searchBar.classList.contains('active')) {
                    if (!searchBar.contains(e.target) && 
                        e.target !== searchBtn && !searchBtn?.contains(e.target) && 
                        e.target !== mobileSearchBtn && !mobileSearchBtn?.contains(e.target)) {
                        closeSearch();
                    }
                }
            });

            document.addEventListener('keydown', function(e) {
                const searchBar = document.getElementById('searchBar');
                if (e.key === 'Escape' && searchBar && searchBar.classList.contains('active')) {
                    closeSearch();
                }
            });

            const shopSearch = document.getElementById('shopSearch');
            if (shopSearch) {
                shopSearch.addEventListener('input', debounce(function(e) {
                    const searchTerm = e.target.value.toLowerCase();
                    if (searchTerm.length > 2) {
                        searchProducts(searchTerm);
                    } else if (searchTerm.length === 0) {
                        filterProducts(currentCategory);
                    }
                }, 500));
            }

            const sortProductsSelect = document.getElementById('sortProducts');
            if (sortProductsSelect) {
                sortProductsSelect.addEventListener('change', function(e) {
                    sortProducts(e.target.value);
                });
            }


            document.addEventListener('click', function(e) {
                if (e.target.closest('.category-nav-btn')) {
                    const btn = e.target.closest('.category-nav-btn');
                    e.preventDefault();
                    
                    document.querySelectorAll('.category-nav-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    const category = btn.getAttribute('data-category');
                    filterProducts(category);
                    closeMobileMenu();
                }
            });
            
            const cartBtn = document.getElementById('cartBtn');
            const desktopCartBtn = document.getElementById('desktopCartBtn');
            
            if (cartBtn) {
                cartBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openCartModal();
                });
            }
            
            if (desktopCartBtn) {
                desktopCartBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openCartModal();
                });
            }
            
            const continueShoppingBtn = document.getElementById('continueShoppingBtn');
            const continueShopping = document.getElementById('continueShopping');
            
            if (continueShoppingBtn) continueShoppingBtn.addEventListener('click', closeModals);
            if (continueShopping) continueShopping.addEventListener('click', closeModals);
            
            const proceedCheckout = document.getElementById('proceedCheckout');
            if (proceedCheckout) {
                proceedCheckout.addEventListener('click', function() {
                    if (cart.length === 0) {
                        showNotification('Your cart is empty. Add some beautiful curated items to get started.', 'error');
                        return;
                    }
                    
                    updateOrderPreview();
                    closeModal('cartModal');
                    openModal('checkoutModal');
                });
            }
            
            const backToCart = document.getElementById('backToCart');
            if (backToCart) {
                backToCart.addEventListener('click', function() {
                    closeModal('checkoutModal');
                    openModal('cartModal');
                });
            }
            
            const shippingOptions = document.querySelectorAll('input[name="shippingOption"]');
            shippingOptions.forEach(option => {
                option.addEventListener('change', function() {
                    if (this.checked) {
                        shippingOptions.forEach(otherOption => {
                            if (otherOption !== this) {
                                otherOption.checked = false;
                            }
                        });
                    }
                    updateCartTotal();
                    // Volume 5: the freight STATE depends on this choice, and
                    // the server decides it, so re-price when it changes.
                    scheduleServerQuoteRefresh();
                });
            });

            const checkoutForm = document.getElementById('checkoutForm');
            if (checkoutForm) {
                checkoutForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    if (validateCheckoutForm()) {
                        processOrder(false);
                    }
                });
            }

            const placeOrderBtn = document.getElementById('placeOrderBtn');
            if (placeOrderBtn) {
                placeOrderBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (validateCheckoutForm()) {
                        processOrder(false);
                    }
                });
            }
            
            const requestQuoteBtn = document.getElementById('requestQuoteBtn');
            if (requestQuoteBtn) {
                requestQuoteBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (validateCheckoutForm()) {
                        isQuoteRequest = true;
                        generateQuote();
                    }
                });
            }
            
            const closeOrder = document.getElementById('closeOrder');
            if (closeOrder) {
                closeOrder.addEventListener('click', function() {
                    closeModal('orderModal');
                    showPage('home');
                });
            }
            
            const printOrder = document.getElementById('printOrder');
            if (printOrder) {
                let printInProgress = false;
                printOrder.addEventListener('click', function() { 
                    if (!printInProgress) {
                        printInProgress = true;
                        window.print();
                        setTimeout(() => { printInProgress = false; }, 2000);
                    }
                });
            }

            const downloadReceiptBtn = document.getElementById('downloadReceipt');
            if (downloadReceiptBtn) {
                downloadReceiptBtn.addEventListener('click', function() {
                    downloadReceipt();
                });
            }
            
            const quoteClose = document.getElementById('quoteClose');
            const backToCheckout = document.getElementById('backToCheckout');
            const acceptQuote = document.getElementById('acceptQuote');
            const printQuoteBtn = document.getElementById('printQuote');
            const downloadQuoteBtn = document.getElementById('downloadQuote');
            
            if (quoteClose) quoteClose.addEventListener('click', function() { closeModal('quoteModal'); });
            if (backToCheckout) backToCheckout.addEventListener('click', function() {
                closeModal('quoteModal');
                openModal('checkoutModal');
            });
            if (acceptQuote) acceptQuote.addEventListener('click', function() {
                closeModal('quoteModal');
                processOrder(true);
            });
            
            if (printQuoteBtn) {
                printQuoteBtn.addEventListener('click', function() { 
                    printQuote(); 
                });
            }
            if (downloadQuoteBtn) {
                downloadQuoteBtn.addEventListener('click', function() {
                    downloadQuote();
                });
            }
            
            document.querySelectorAll('.modal-close').forEach(btn => {
                btn.addEventListener('click', function() {
                    const modal = this.closest('.modal');
                    if (modal) {
                        const modalId = modal.id;
                        closeModal(modalId);
                    }
                });
            });
            
            document.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.addEventListener('click', function() {
                    const modal = this.closest('.modal');
                    if (modal) {
                        const modalId = modal.id;
                        closeModal(modalId);
                    }
                });
            });
            
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closeModals();
                    closeSearch();
                }
            });
            
            const contactForm = document.getElementById('contactForm');
            if (contactForm) {
                contactForm.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    
                    const formData = {
                        name: document.getElementById('contactName').value,
                        email: document.getElementById('contactEmailField').value,
                        subject: document.getElementById('contactSubject').value,
                        message: document.getElementById('contactMessage').value,
                        phone: ''
                    };
                    
                    if (validateContactForm(formData)) {
                        setButtonLoading(contactForm.querySelector('button[type="submit"]'), true);
                        
                        try {
                            await submitContactForm(formData);
                            showNotification('Thank you for your message! We will get back to you soon.', 'success');
                            this.reset();
                        } catch (error) {
                            showNotification('Failed to send message. Please try again.', 'error');
                        } finally {
                            setButtonLoading(contactForm.querySelector('button[type="submit"]'), false);
                        }
                    }
                });
            }
            
            const newsletterSubscribe = document.getElementById('newsletterSubscribe');
            const newsletterEmail = document.getElementById('newsletterEmail');

            if (newsletterSubscribe && newsletterEmail) {
                newsletterSubscribe.addEventListener('click', async function() {
                    const email = newsletterEmail.value.trim();

                    if (!email) {
                        showNotification('Please enter your email address', 'error');
                        return;
                    }

                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email)) {
                        showNotification('Please enter a valid email address', 'error');
                        return;
                    }

                    setButtonLoading(newsletterSubscribe, true);

                    try {
                        await subscribeNewsletter(email);
                        showNotification('Thank you for subscribing to our newsletter!', 'success');
                        newsletterEmail.value = '';
                    } catch (error) {
                        showNotification('Failed to subscribe. Please try again.', 'error');
                    } finally {
                        setButtonLoading(newsletterSubscribe, false);
                    }
                });
            }

            // Homepage newsletter form (separate from footer newsletter)
            const homeNewsletterForm = document.getElementById('homeNewsletterForm');
            if (homeNewsletterForm) {
                homeNewsletterForm.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const emailInput = document.getElementById('homeNewsletterEmail');
                    const submitBtn  = document.getElementById('homeNewsletterSubmit');
                    const email = emailInput ? emailInput.value.trim() : '';

                    if (!email) {
                        showNotification('Please enter your email address', 'error');
                        return;
                    }
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email)) {
                        showNotification('Please enter a valid email address', 'error');
                        return;
                    }

                    if (submitBtn) setButtonLoading(submitBtn, true);
                    try {
                        await subscribeNewsletter(email);
                        showNotification('Thank you for subscribing!', 'success');
                        if (emailInput) emailInput.value = '';
                    } catch (err) {
                        showNotification('Failed to subscribe. Please try again.', 'error');
                    } finally {
                        if (submitBtn) setButtonLoading(submitBtn, false);
                    }
                });
            }
            
            window.addEventListener('scroll', function() {
                const header = document.querySelector('header');
                if (window.scrollY > 50) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            });
            
            document.addEventListener('click', function(e) {
                if (e.target.closest('.quantity-btn.minus')) {
                    const input = e.target.closest('.quantity-selector').querySelector('.quantity-input');
                    if (input && parseInt(input.value) > 1) {
                        input.value = parseInt(input.value) - 1;
                    }
                }
                
                if (e.target.closest('.quantity-btn.plus')) {
                    const input = e.target.closest('.quantity-selector').querySelector('.quantity-input');
                    if (input && parseInt(input.value) < 10) {
                        input.value = parseInt(input.value) + 1;
                    }
                }
            });
        }

        // ============================================
        // FORM VALIDATION FUNCTIONS
        // ============================================
        function validateCheckoutForm() {
            // Cart must have items
            if (!cart || cart.length === 0) {
                showNotification('Your cart is empty. Add items before checking out.', 'error');
                return false;
            }

            // Required customer fields
            const requiredFields = ['fullName', 'email', 'phone', 'country', 'address', 'city', 'postalCode', 'province'];
            for (const fieldId of requiredFields) {
                const field = document.getElementById(fieldId);
                if (!field || !field.value.trim()) {
                    const label = field?.previousElementSibling?.textContent?.replace('*', '').trim() || fieldId;
                    showNotification(`Please fill in the ${label} field`, 'error');
                    field?.focus();
                    return false;
                }
            }

            const email = document.getElementById('email');
            if (email && email.value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email.value)) {
                    showNotification('Please enter a valid email address', 'error');
                    email.focus();
                    return false;
                }
            }

            const phone = document.getElementById('phone');
            if (phone && phone.value) {
                const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,}$/;
                if (!phoneRegex.test(phone.value)) {
                    showNotification('Please enter a valid phone number', 'error');
                    phone.focus();
                    return false;
                }
            }

            return true;
        }

        function validateContactForm(data) {
            if (!data.name || !data.name.trim()) {
                showNotification('Please enter your name', 'error');
                return false;
            }
            
            if (!data.email || !data.email.trim()) {
                showNotification('Please enter your email address', 'error');
                return false;
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data.email)) {
                showNotification('Please enter a valid email address', 'error');
                return false;
            }
            
            if (!data.subject || !data.subject.trim()) {
                showNotification('Please enter a subject', 'error');
                return false;
            }
            
            if (!data.message || !data.message.trim()) {
                showNotification('Please enter your message', 'error');
                return false;
            }
            
            return true;
        }

        // ============================================
        // HANDLE PAGE VISIBILITY
        // ============================================
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                refreshData();
            }
        });

        window.addEventListener('online', function() {
            showNotification('You are back online', 'success');
            refreshData();
        });

        window.addEventListener('offline', function() {
            showNotification('You are offline. Some features may not work.', 'warning');
        });

















