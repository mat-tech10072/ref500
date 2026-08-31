(() => {
  'use strict';
  // One-time purge of cached L2L content: a returning visitor's localStorage
  // could otherwise re-apply the old brand's settings/CMS text after deploy.
  try {
    if (localStorage.getItem('bnbCachePurge') !== '1') {
      ['lufa_products_v2','lufa_categories','lufa_cms_pages','lufa_faqs','lufa_locations','lufa_care','lufa_settings','lufa_community','lufaContentVersion'].forEach(k => localStorage.removeItem(k));
      localStorage.setItem('bnbCachePurge', '1');
    }
  } catch (e) {}
  const PHONE = '67571991469';
  const EMAIL = 'bnbservice733@gmail.com';
  const FACEBOOK = 'https://www.facebook.com/profile.php?id=61593895735393';
  const INSTAGRAM = 'https://www.instagram.com/bnb_barber36?igsi=anUzamw1dzVha3Zv';
  const wa = message => `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;
  const generalMessage = 'Hello BNB, I would like to enquire about your services.';
  const setText = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value; };
  const setHTML = (selector, value) => { const el = document.querySelector(selector); if (el) el.innerHTML = value; };

  function serviceCard(image, title, text, anchor) {
    return `<a class="product-card bnb-service-card" href="${anchor}" aria-label="Learn about ${title}">
      <div class="product-image"><img class="bnb-service-card-image" src="${image}" alt="" loading="lazy" decoding="async"></div>
      <div class="product-info"><div class="product-name-text">${title}</div><div class="product-price">${text}</div></div>
    </a>`;
  }
  function contentCard(icon, title, items) {
    return `<article class="bnb-content-card"><i class="fas ${icon}" aria-hidden="true"></i><h3>${title}</h3><ul>${items.map(item => `<li>${item}</li>`).join('')}</ul></article>`;
  }
  function docCard(icon, title, text) {
    return `<article class="bnb-doc-card"><i class="fas ${icon}" aria-hidden="true"></i><h3>${title}</h3><p>${text}</p></article>`;
  }

  function updateBrand() {
    document.title = 'BNB Stationery, Printing & Consultancy Services | Kundiawa, Simbu';
    document.querySelectorAll('.logo picture,.footer-logo picture').forEach(picture => {
      const logo = document.createElement('img');
      logo.src = 'public/assets/images/bnblogo-transparent.png';
      logo.alt = 'BNB Stationery, Printing & Consultancy Services logo';
      logo.className = `${picture.closest('.footer-logo') ? 'footer-logo-image' : 'logo-image'} bnb-brand-logo`;
      picture.replaceWith(logo);
    });
    setHTML('.logo-text', 'BNB <span>Consultancy</span>');
    setHTML('.footer-logo-text', 'BNB <span>Consultancy</span>');
    document.querySelector('header')?.setAttribute('aria-label', 'BNB website header');
  }

  function updateNavigation() {
    const nav = document.querySelector('#mainNav ul');
    if (nav) nav.innerHTML = [
      ['Home','#hero'],['About','#about'],['Printing','#printing'],['Consultancy','#consultancy'],['Business Support','#business-support'],['Contact','#contact']
    ].map(([label,href], i) => `<li><a href="${href}" class="nav-link${i===0?' active':''}">${label}</a></li>`).join('');
    const contact = document.querySelector('.header-contact-btn');
    // No data-page: the legacy [data-page] click handler runs showPage(),
    // which ends in window.scrollTo(0,0) and would yank the user back to
    // the top. Plain hash anchors go through our smooth-scroll delegation.
    if (contact) { contact.href = `mailto:${EMAIL}`; contact.textContent = 'Email Us'; contact.removeAttribute('target'); contact.removeAttribute('rel'); contact.removeAttribute('data-page'); contact.setAttribute('aria-label', 'Email BNB'); }
    document.querySelectorAll('#mainNav a').forEach(link => link.addEventListener('click', () => {
      document.querySelector('#mainNav')?.classList.remove('active'); document.body.classList.remove('menu-open');
    }));
    document.querySelectorAll('#mobileSearchBtn,#cartBtn,#searchBtn,#searchToggle,#cartToggle,.desktop-search-btn,.desktop-cart-btn').forEach(button => button.remove());
    // No search UI remains, so drop the search bar itself (its legacy
    // listeners all guard on the element's existence).
    document.getElementById('searchBar')?.remove();
  }

  function updateHero() {
    document.querySelector('#hero')?.setAttribute('aria-label', 'BNB Stationery, Printing and Consultancy Services');
    setHTML('#heroTitleLine1', 'BNB Stationery, Printing');
    setText('#heroTitleLine2', '& Consultancy Services');
    setText('#heroDescription', 'Stationery and printing services based in Kundiawa, barber services based in Port Moresby, and mobile business assistance available by appointment.');
    const primary = document.querySelector('#heroBtn1'); if (primary) { primary.href='#services'; primary.style.display='inline-flex'; primary.removeAttribute('data-page'); }
    setText('#heroBtn1Text','View Our Services');
    const secondary = document.querySelector('#heroBtn2'); if (secondary) { secondary.href=wa(generalMessage); secondary.target='_blank'; secondary.rel='noopener'; secondary.removeAttribute('data-page'); }
    setText('#heroBtn2Text','WhatsApp Us');
    document.querySelector('#heroStats')?.remove();
    const heroPanels=[
      '<img src="images/hero1.jpg" alt="BNB barber services in Port Moresby">',
      '<img src="images/hero2.jpg" alt="BNB printing services in Kundiawa">',
      '<img src="images/hero3.jpg" alt="BNB business documentation services">'
    ];
    document.querySelectorAll('.hero-frames .hero-frame').forEach((frame,i)=>{ if(heroPanels[i]) frame.innerHTML=heroPanels[i]; });
  }

  function updateOverview() {
    const section = document.querySelector('#homeFeatured'); if (!section) return;
    section.id = 'services'; section.setAttribute('aria-label','BNB services overview');
    setText('#homeFeaturedTitle','Services Designed to Support You and Your Business');
    setText('#services .section-subtitle','Stationery and printing in Kundiawa, barber services in Port Moresby, and mobile business assistance by appointment.');
    const grid = document.querySelector('#homeFeaturedGrid');
    if (grid) grid.innerHTML = serviceCard('images/ChatGPT Image Aug 31, 2026, 06_42_46 PM.png','01. Stationery & Printing','Based in Kundiawa for printing, photocopying, scanning and document typing.','#printing') + serviceCard('images/barber-service.png','02. Barber Service','Based in Port Moresby and available by appointment.','#mobile-services') + serviceCard('images/ChatGPT Image Aug 31, 2026, 06_42_57 PM.png','03. Mobile Business Assistance','Registration, documentation and related support delivered as a mobile service.','#consultancy') + serviceCard('images/ChatGPT Image Aug 31, 2026, 06_43_01 PM.png','04. Mobile Design Support','Business logos, flyers and promotional materials, available by appointment.','#design-support');
    const footer = section.querySelector('.home-featured-footer'); if (footer) footer.innerHTML = `<a class="btn btn-outline" href="${wa(generalMessage)}" target="_blank" rel="noopener">Enquire About Services</a>`;
  }

  function updateAbout() {
    setText('#aboutStoryTitle','Your Local Printing & Business Support Partner');
    setText('#aboutStorySubtitle','ABOUT BNB'); setText('#aboutStoryHeading','BNB Stationery, Printing & Consultancy Services');
    setText('#aboutStoryP1','BNB is based in Kundiawa for stationery and printing, provides barber services from Port Moresby, and offers mobile business assistance by appointment. From its base at the Warasimbu Travellers Inn, BNB supports individuals, entrepreneurs and organisations with everyday essentials such as printing, photocopying, scanning and document typing. Mobile services bring business registration assistance, professional document preparation and promotional materials directly to customers, with appointments arranged over the phone or WhatsApp.');
    setText('#aboutStoryP2','Whether customers require documents to be printed, assistance with business registration, help preparing professional documents or promotional materials, BNB provides multiple services from one convenient location.');
    const mv = document.querySelector('.mission-vision-section'); if (mv) mv.innerHTML = '<div class="bnb-feature-labels"><span>Printing</span><span>Business Support</span><span>Documentation</span><span>Consultancy</span></div>';
  }

  // Continuous looping carousel for the mobile view (<768px). Two clone cards
  // sit on each side of the real set so every step slides to an adjacent DOM
  // card; landing on a clone silently remaps scrollLeft by one set-width, so
  // the loop never visibly jumps. Desktop keeps the static grid: clones and
  // listeners are torn down whenever the viewport crosses the breakpoint.
  function initLoopCarousel(viewport, track, prevBtn, nextBtn) {
    const real = [...track.children];
    const n = real.length; if (!viewport || n < 2 || !prevBtn || !nextBtn) return;
    const BUFFER = Math.min(2, n - 1);
    const mq = window.matchMedia('(max-width: 767px)');
    let cleanup = null;

    const makeClone = card => {
      const clone = card.cloneNode(true);
      clone.classList.add('bnb-clone');
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('a,button,input,[tabindex]').forEach(el => el.setAttribute('tabindex', '-1'));
      return clone;
    };

    function setup() {
      real.slice(-BUFFER).reverse().forEach(card => track.insertBefore(makeClone(card), track.firstChild));
      real.slice(0, BUFFER).forEach(card => track.appendChild(makeClone(card)));
      const cards = () => [...track.children];
      let domIdx = BUFFER, busy = false, settleTimer = null, busyGuard = null, lastTap = 0;

      function centerOn(idx, instant) {
        const card = cards()[idx]; if (!card) return;
        const vpRect = viewport.getBoundingClientRect(), cRect = card.getBoundingClientRect();
        const target = viewport.scrollLeft + (cRect.left + cRect.width / 2) - (vpRect.left + vpRect.width / 2);
        // Snap must be off for programmatic scrolls, or 'x mandatory' can
        // intercept mid-flight and settle one card short of the target.
        viewport.style.scrollSnapType = 'none';
        if (instant) {
          viewport.style.scrollBehavior = 'auto';
          viewport.scrollLeft = target;
          requestAnimationFrame(() => { viewport.style.scrollSnapType = 'x mandatory'; viewport.style.scrollBehavior = ''; });
        } else {
          viewport.scrollTo({ left: target, behavior: 'smooth' });
          setTimeout(() => { viewport.style.scrollSnapType = 'x mandatory'; }, 420);
        }
      }
      function remapIfNeeded() {
        if (domIdx < BUFFER)      { domIdx += n; centerOn(domIdx, true); return true; }
        if (domIdx >= BUFFER + n) { domIdx -= n; centerOn(domIdx, true); return true; }
        return false;
      }
      function release() { busy = false; clearTimeout(busyGuard); }
      function goTo(idx) {
        if (busy) return;
        busy = true; domIdx = idx; centerOn(domIdx, false);
        clearTimeout(busyGuard); busyGuard = setTimeout(release, 900);
      }
      const onScroll = () => {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          const vpCx = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
          let best = 0, bestDist = Infinity;
          cards().forEach((c, i) => {
            const dist = Math.abs(c.getBoundingClientRect().left + c.offsetWidth / 2 - vpCx);
            if (dist < bestDist) { bestDist = dist; best = i; }
          });
          domIdx = best;
          if (!remapIfNeeded()) release();
        }, 100);
      };
      // A tap fires both 'touchend' and a synthetic 'click'; without
      // de-duplication one press advances two cards.
      const tap = fn => e => {
        const now = Date.now();
        if (now - lastTap < 350) return;
        lastTap = now; e.preventDefault(); fn();
      };
      const goPrev = tap(() => goTo(domIdx - 1)), goNext = tap(() => goTo(domIdx + 1));
      viewport.addEventListener('scroll', onScroll, { passive: true });
      prevBtn.addEventListener('click', goPrev); nextBtn.addEventListener('click', goNext);
      prevBtn.addEventListener('touchend', goPrev, { passive: false });
      nextBtn.addEventListener('touchend', goNext, { passive: false });
      prevBtn.disabled = false; nextBtn.disabled = false;
      requestAnimationFrame(() => centerOn(domIdx, true));
      cleanup = () => {
        clearTimeout(settleTimer); clearTimeout(busyGuard);
        viewport.removeEventListener('scroll', onScroll);
        prevBtn.removeEventListener('click', goPrev); nextBtn.removeEventListener('click', goNext);
        prevBtn.removeEventListener('touchend', goPrev); nextBtn.removeEventListener('touchend', goNext);
        track.querySelectorAll('.bnb-clone').forEach(clone => clone.remove());
        viewport.style.scrollSnapType = ''; viewport.style.scrollBehavior = '';
        viewport.scrollLeft = 0;
      };
    }
    function apply() { if (cleanup) { cleanup(); cleanup = null; } if (mq.matches) setup(); }
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply);
  }

  function updatePrinting() {
    const section = document.querySelector('#homeCollections'); if (!section) return;
    section.id='printing'; section.style.display='block'; section.setAttribute('aria-label','Printing and document services');
    setText('#craftSectionTitle','Printing & Document Services'); setText('#craftSectionSubtitle','Convenient printing and document services for individuals and businesses.');
    const grid=section.querySelector('#craftGrid'); if(!grid) return;
    // The legacy renderer (displayCraftCategories) re-runs on tab refocus,
    // 'online' events and a 15-minute interval, and keys on #craftGrid.
    // Renaming the id makes it bail permanently instead of overwriting these
    // cards with L2L categories and re-arming its own carousel closures.
    grid.id='bnbPrintGrid';
    grid.innerHTML=[
      ['fa-print','PRINTING','Colour printing<br>Black & white printing'],['fa-copy','PHOTOCOPYING','Black & white photocopying'],['fa-file-import','SCANNING','Hard copy to digital copy<br>Document scanning<br>Scan editing assistance'],['fa-keyboard','TYPING','Typing of written documents<br>Document preparation']
    ].map(([icon,title,text])=>`<div class="craft-card-wrapper"><div class="craft-card"><div class="bnb-service-icon"><i class="fas ${icon}" aria-hidden="true"></i></div><div class="craft-button-container"><a class="btn btn-outline craft-btn" href="${wa(`Hello BNB, I would like to enquire about your ${title.toLowerCase()} services.`)}" target="_blank" rel="noopener"><span>Contact Us</span><i class="fas fa-arrow-right"></i></a></div></div><div class="craft-card-caption"><h3 class="craft-card-title">${title}</h3><p class="craft-card-desc">${text}</p></div></div>`).join('');
    // Clone-replace the viewport and nav buttons to shed every listener the
    // legacy carousel attached to them, then run our own loop on the clones.
    const oldViewport=grid.closest('.craft-slider-viewport');
    let viewport=oldViewport;
    if(oldViewport){viewport=oldViewport.cloneNode(true);oldViewport.replaceWith(viewport);}
    const swapButton=id=>{const btn=document.getElementById(id);if(!btn)return null;const copy=btn.cloneNode(true);btn.replaceWith(copy);return copy;};
    const prev=swapButton('craftPrev'), next=swapButton('craftNext');
    const track=viewport?viewport.querySelector('.craft-grid'):null;
    if(track) initLoopCarousel(viewport,track,prev,next);
  }

  function insertBusinessSections() {
    if (document.querySelector('#consultancy')) return;
    const hours = document.querySelector('#homeNewsletter'); if (!hours) return;
    hours.insertAdjacentHTML('beforebegin', `
      <section class="bnb-section bnb-mobile-service" id="mobile-services" aria-label="Mobile barber service"><div class="container"><div class="section-header"><h2 class="section-title">Mobile Barber Service</h2><p class="section-subtitle">Convenient barber service delivered by appointment. Contact BNB to confirm availability and service location.</p></div><div class="bnb-section-cta"><p>Book the mobile barber service.</p><a class="btn btn-primary" href="${wa('Hello BNB, I would like to book the mobile barber service.')}" target="_blank" rel="noopener">Book on WhatsApp</a></div></div></section>
      <section class="bnb-section bnb-mobile-service" id="consultancy" aria-label="Mobile business consultancy services"><div class="container"><div class="section-header"><h2 class="section-title">Business Registration & Consultancy Assistance</h2><p class="section-subtitle">Mobile assistance for individuals, entrepreneurs and businesses with registration, renewals, amendments and other business-related processes.</p></div><div class="bnb-content-grid">${contentCard('fa-building','IPA Registration',['Business Name','Company','Association','Business Group'])}${contentCard('fa-sync-alt','Renewals & Amendments',['Company amendments','Foreign company amendments','Change of company name','Change of business name'])}${contentCard('fa-file-invoice','IRC / TIN Assistance',['TIN lodgement for businesses','Personal TIN lodgement','Assistance with related documentation'])}</div></div></section>
      <section class="bnb-section bnb-mobile-service" id="business-support" aria-label="Mobile business documentation services"><div class="container"><div class="section-header"><h2 class="section-title">Professional Business Document Assistance</h2><p class="section-subtitle">Mobile support with common business documentation and professional materials, available by appointment.</p></div><div class="bnb-carousel" id="bnbDocsCarousel"><button type="button" class="carousel-nav-btn bnb-car-prev" aria-label="Previous document service"><i class="fas fa-chevron-left" aria-hidden="true"></i></button><div class="bnb-carousel-viewport"><div class="bnb-doc-grid bnb-carousel-track">${docCard('fa-address-card','Business Profile','Present your business information clearly.')}${docCard('fa-envelope-open-text','Cover Letter','Prepare a professional introduction.')}${docCard('fa-file-signature','Business Proposal','Structure your business opportunity.')}${docCard('fa-folder-open','Business Documentation','Assistance with related documents.')}</div></div><button type="button" class="carousel-nav-btn bnb-car-next" aria-label="Next document service"><i class="fas fa-chevron-right" aria-hidden="true"></i></button></div><div class="bnb-section-cta"><p>Need help preparing your business documents?</p><a class="btn btn-primary" href="${wa('Hello BNB, I would like help preparing my business documents.')}" target="_blank" rel="noopener">Get Assistance</a></div></div></section>
      <section class="bnb-section bnb-mobile-service" id="design-support" aria-label="Mobile design and promotional services"><div class="container"><div class="section-header"><h2 class="section-title">Promote Your Business</h2><p class="section-subtitle">Mobile assistance for businesses, organisations and individuals with promotional and branding materials.</p></div><div class="bnb-doc-grid">${docCard('fa-pen-nib','Business Logo','A visual identity for your business.')}${docCard('fa-file-image','Business Flyer','Share your services and information.')}${docCard('fa-tags','Promotional Sales Flyer','Promote an offer or sales campaign.')}${docCard('fa-hand-holding-heart','Fundraising Flyer','Support a fundraising activity.')}</div></div></section>
      <section class="bnb-section" id="how-it-works" aria-label="How BNB services work"><div class="container"><div class="section-header"><h2 class="section-title">Getting Started Is Simple</h2></div><div class="bnb-steps-grid">${[['01','Contact Us','Tell BNB which service you require.'],['02','Confirm the Service','For mobile services, agree on the appointment time and location.'],['03','We Assist You','BNB provides the booked service or prepares the requested work.'],['04','Complete Your Service','Receive your service, documents or further instructions.']].map(([n,t,p])=>`<article class="bnb-step-card"><span class="bnb-step-number">${n}</span><h3>${t}</h3><p>${p}</p></article>`).join('')}</div></div></section>`);
    const docsCarousel = document.querySelector('#bnbDocsCarousel');
    if (docsCarousel) initLoopCarousel(
      docsCarousel.querySelector('.bnb-carousel-viewport'),
      docsCarousel.querySelector('.bnb-carousel-track'),
      docsCarousel.querySelector('.bnb-car-prev'),
      docsCarousel.querySelector('.bnb-car-next')
    );
  }

  function updateValues() {
    setText('#impactSectionTitle','Convenient Business Support in One Place'); setText('#impactSectionSubtitle','WHY CHOOSE BNB');
    const grid=document.querySelector('.home-impact-grid'); if(grid) grid.innerHTML=[['01','KUNDIAWA BASE','Stationery and printing services based in Kundiawa.'],['02','MOBILE SERVICES','Barber and business assistance available by appointment.'],['03','DIRECT COMMUNICATION','Quickly contact BNB through phone or WhatsApp.'],['04','MULTIPLE SERVICES','Practical personal and business support from one provider.']].map(([n,l,d])=>`<div class="home-impact-card"><div class="home-impact-overlay"><div class="home-impact-number">${n}</div><div class="home-impact-label">${l}</div><p>${d}</p></div></div>`).join('');
  }

  const schedule={0:[13,17],1:[7,17],2:[7,17],3:[7,17],4:[7,17],5:[7,12],6:null};
  function businessStatus(){const png=new Date(Date.now()+10*3600000),day=png.getUTCDay(),hour=png.getUTCHours()+png.getUTCMinutes()/60,today=schedule[day],open=!!today&&hour>=today[0]&&hour<today[1];let next='';if(!open){for(let add=0;add<8;add++){const d=(day+add)%7,s=schedule[d];if(s&&(add>0||hour<s[0])){next=`Opens ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d]} at ${s[0]>12?s[0]-12:s[0]}:00 ${s[0]>=12?'PM':'AM'}`;break;}}}return{open,next};}
  function updateHours(){const section=document.querySelector('#homeNewsletter');if(!section)return;section.setAttribute('aria-label','Opening hours');const status=businessStatus();section.querySelector('.home-newsletter-inner').innerHTML=`<h2 class="home-newsletter-title">Visit Us During Business Hours</h2><p class="home-newsletter-subtitle">Opening hours are calculated using Papua New Guinea time (UTC+10).</p><div class="bnb-hours-grid"><div class="bnb-hours-row"><span>Monday – Thursday</span><strong>7:00 AM – 5:00 PM</strong></div><div class="bnb-hours-row"><span>Friday</span><strong>7:00 AM – 12:00 PM</strong></div><div class="bnb-hours-row"><span>Saturday</span><strong>Hours not listed</strong></div><div class="bnb-hours-row"><span>Sunday</span><strong>1:00 PM – 5:00 PM</strong></div></div><div class="bnb-status ${status.open?'open':''}" id="bnbOpenStatus"><i class="fas fa-circle" aria-hidden="true"></i><span>${status.open?'Open Now':'Closed'}</span>${status.next?`<small>${status.next}</small>`:''}</div>`;}

  function updateContact(){setText('#contactSectionTitle','Visit the Kundiawa Base or Book a Mobile Service');setText('#contactSectionSubtitle','Stationery and printing are based in Kundiawa. Mobile barber and business assistance services are available by appointment.');const phone=document.querySelector('#contactPhone');if(phone){phone.href='tel:+67579243217';phone.innerHTML='<i class="fas fa-phone-alt"></i><span>Stationery: 7924 3217</span>';}let appointments=document.querySelector('#contactAppointments');const contactList=document.querySelector('.contact-details-list');if(!appointments&&contactList){appointments=document.createElement('a');appointments.id='contactAppointments';appointments.className='contact-link';contactList.appendChild(appointments);}if(appointments){appointments.href='tel:+67571991469';appointments.innerHTML='<i class="fas fa-calendar-check"></i><span>Appointments & Services: 7199 1469</span>';}let email=document.querySelector('#contactEmail');if(!email&&contactList){email=document.createElement('a');email.id='contactEmail';email.className='contact-link';contactList.appendChild(email);}if(email){email.href=`mailto:${EMAIL}`;email.innerHTML=`<i class="fas fa-envelope"></i><span>${EMAIL}</span>`;}const whatsapp=document.querySelector('#contactWhatsApp');if(whatsapp){whatsapp.style.display='flex';whatsapp.href=wa(generalMessage);whatsapp.innerHTML='<i class="fab fa-whatsapp"></i><span>WhatsApp Appointments: 7199 1469</span>';}setText('.contact-hours','Monday–Thursday 7AM–5PM | Friday 7AM–12PM | Sunday 1PM–5PM');const address=document.querySelector('.contact-info .contact-card:not(.contact-card-combined) .contact-details');if(address)address.innerHTML='<h3>Stationery & Printing Base</h3><div class="bnb-address"><p class="bnb-address-name">BNB Stationery, Printing & Consultancy Services</p><p>Warasimbu Travellers Inn<br>Kundiawa, Simbu Province<br>Papua New Guinea</p><p><strong>Mobile by appointment:</strong> Barber and business assistance services.</p></div><a class="bnb-map-placeholder" href="https://www.google.com/maps/search/?api=1&query=Warasimbu+Travellers+Inn+Kundiawa+Papua+New+Guinea" target="_blank" rel="noopener" aria-label="Open the BNB location in Google Maps"><span><i class="fas fa-map-marked-alt"></i><br>View on Google Maps<br><small>Warasimbu Travellers Inn, Kundiawa</small></span></a><p><a class="btn btn-outline" href="https://www.google.com/maps/search/?api=1&query=Warasimbu+Travellers+Inn+Kundiawa+Papua+New+Guinea" target="_blank" rel="noopener">Get Directions</a></p>';document.querySelector('.contact-form')?.remove();
  }

  function updateFooter(){setHTML('.footer-logo-text','BNB <span>Consultancy</span>');setText('#footerDescription','Stationery and printing based in Kundiawa, with mobile barber and business assistance services by appointment.');setText('#footerTagline','Warasimbu Travellers Inn, Kundiawa | 7924 3217');const facebook=document.querySelector('#socialFacebook');if(facebook)facebook.href=FACEBOOK;const instagram=document.querySelector('#socialInstagram');if(instagram)instagram.href=INSTAGRAM;const socialStrip=document.querySelector('.footer-social-strip');if(socialStrip&&!document.querySelector('#socialEmail'))socialStrip.insertAdjacentHTML('beforeend',`<a href="mailto:${EMAIL}" class="footer-social-icon" aria-label="Email BNB" id="socialEmail"><i class="fas fa-envelope" aria-hidden="true"></i></a>`);const sections=document.querySelectorAll('.footer-content .footer-section');if(sections[1])sections[1].innerHTML='<h3>Services</h3><ul><li>Stationery & Printing — Kundiawa</li><li>Mobile Barber Service</li><li>Mobile IPA & TIN Assistance</li><li>Mobile Business Documents</li><li>Mobile Promotional Support</li></ul>';if(sections[2])sections[2].innerHTML='<h3>Quick Links</h3><ul><li><a href="#hero">Home</a></li><li><a href="#about">About</a></li><li><a href="#printing">Printing</a></li><li><a href="#mobile-services">Barber</a></li><li><a href="#consultancy">Consultancy</a></li><li><a href="#business-support">Business Support</a></li><li><a href="#contact">Contact</a></li></ul>';document.querySelector('.footer-policies-section')?.remove();setHTML('#copyrightText','&copy; 2026 BNB Stationery, Printing &amp; Consultancy Services. All Rights Reserved. | Crafted by <a href="https://craftsytedesigns.com" target="_blank" rel="noopener" style="color: var(--accent-gold);">CraftSyte Designs</a>');}
  // In-page navigation. The legacy hash router treats every unknown hash as
  // 'home' and its showPage() ends with window.scrollTo(0,0), so a native
  // anchor click jumps to the section and is then yanked back to the top.
  // preventDefault + pushState never fires hashchange, so the router stays
  // out of it; scrolling compensates for the sticky header height.
  function smoothScrollTo(id){
    const target=document.getElementById(id); if(!target) return false;
    const header=document.querySelector('header');
    const top=target.getBoundingClientRect().top+window.pageYOffset-(header?header.offsetHeight:0)+1;
    window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
    return true;
  }
  function setupNavigation(){
    if(document.body._bnbNavInit) return;
    document.body._bnbNavInit=true;
    document.addEventListener('click',e=>{
      const link=e.target.closest('a[href^="#"]');
      if(!link) return;
      const id=link.getAttribute('href').slice(1);
      if(!id||!document.getElementById(id)) return;
      e.preventDefault();
      smoothScrollTo(id);
      history.pushState(null,'','#'+id);
      const navLinks=document.querySelectorAll('#mainNav .nav-link');
      if(link.closest('#mainNav')) navLinks.forEach(a=>a.classList.toggle('active',a===link));
      document.querySelector('.header-right')?.classList.remove('active');
      const toggle=document.getElementById('mobileMenuToggle');
      if(toggle){toggle.classList.remove('active');toggle.setAttribute('aria-expanded','false');}
      document.body.style.overflow='auto';
    });
    // Do not schedule a delayed scroll during initial page load. Navigation
    // clicks still use smoothScrollTo(), but landing/reloading stays stable.
  }

  function addFloatingWhatsapp(){if(document.querySelector('.bnb-floating-whatsapp'))return;document.body.insertAdjacentHTML('beforeend',`<a class="bnb-floating-whatsapp" href="${wa(generalMessage)}" target="_blank" rel="noopener" aria-label="Contact BNB on WhatsApp"><i class="fab fa-whatsapp" aria-hidden="true"></i></a>`);}
  function integrate(){updateBrand();updateNavigation();updateHero();updateOverview();updateAbout();updatePrinting();insertBusinessSections();updateValues();updateHours();updateContact();updateFooter();addFloatingWhatsapp();setupNavigation();
    // Remove (not hide) the L2L-only DOM: hidden shop/blog/faq/care/legal
    // pages and the e-commerce modals. Runs after the legacy init pass, and
    // every later legacy write to these ids is guarded, so removal is safe.
    document.querySelectorAll('.page-content:not(#homePage)').forEach(page=>page.remove());
    ['productModal','cartModal','checkoutModal','quoteModal','orderModal'].forEach(id=>document.getElementById(id)?.remove());
  }
  document.addEventListener('DOMContentLoaded',()=>{integrate();setTimeout(integrate,250);setTimeout(integrate,900);setInterval(updateHours,60000);});
})();
