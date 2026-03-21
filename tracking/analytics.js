/**
 * WebsiteProfiling Analytics - Privacy-first, cookie-free tracking
 * Embed: <script src="/tracking.js" data-site="SITE_ID" async></script>
 */
(function () {
  'use strict';
  var script = document.currentScript || document.querySelector('script[data-site]');
  var siteId = script ? script.getAttribute('data-site') : 'default';
  var endpoint = script ? (script.getAttribute('data-endpoint') || '/api/v1/analytics/events') : '/api/v1/analytics/events';

  function getSessionId() {
    var id = sessionStorage.getItem('_wp_sid');
    if (!id) {
      id = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      sessionStorage.setItem('_wp_sid', id);
    }
    return id;
  }

  function getDevice() {
    var w = window.innerWidth;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  function getBrowser() {
    var ua = navigator.userAgent;
    if (/Edge\/|Edg\//.test(ua)) return 'Edge';
    if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    return 'Other';
  }

  function getUtm() {
    try {
      var params = new URLSearchParams(window.location.search);
      return {
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        utm_term: params.get('utm_term') || undefined,
        utm_content: params.get('utm_content') || undefined,
      };
    } catch (e) {
      return {};
    }
  }

  function cleanObject(obj) {
    var out = {};
    for (var k in obj) {
      if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
    }
    return out;
  }

  function send(eventType, customData) {
    var payload = {
      site_id: siteId,
      event_type: eventType || 'pageview',
      page_url: window.location.href,
      referrer: document.referrer || '',
      session_id: getSessionId(),
      device: getDevice(),
      browser: getBrowser(),
      timestamp: new Date().toISOString(),
      custom_data: cleanObject(Object.assign({}, getUtm(), customData || {})),
    };

    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, body);
    } else {
      fetch(endpoint, {
        method: 'POST',
        body: body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(function () {});
    }
  }

  // Track pageview on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { send('pageview'); });
  } else {
    send('pageview');
  }

  // Expose track function for custom events
  window.wpAnalytics = { track: send };

  // Track SPA navigation (pushState)
  var _pushState = history.pushState;
  history.pushState = function () {
    _pushState.apply(history, arguments);
    setTimeout(function () { send('pageview'); }, 0);
  };
  window.addEventListener('popstate', function () { send('pageview'); });

  // Track outbound link clicks
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (el && el.href && el.hostname !== window.location.hostname) {
      send('outbound_click', { destination: el.href });
    }
  });
})();
