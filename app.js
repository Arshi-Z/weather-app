// پیاده‌سازی اعمال‌شده (پیشنهاد ۴ — تأیید ارشیا، ۲۲ نوامبر ۲۰۲۶) — وظیفهٔ id=4، ایجنت «توسعه‌دهنده جاوااسکریپت» (id=7)
// منطق دادهٔ وب‌اپ آب و هوا: دادهٔ زندهٔ Open-Meteo (رایگان، بدون کلید) جای دادهٔ نمونه (data-sample) را می‌گیرد.
// این فایل با یک خط <script src="app.js"></script> پس از visual.js به index.html وصل شده است.
// - هیچ دادهٔ کاربر یا API با innerHTML یا eval وارد صفحه نمی‌شود؛ همه‌چیز با textContent و createElement ساخته می‌شود.
// - HTML/CSS تغییر نکرده است؛ همهٔ ویژگی‌های لازم (role=option ،aria-selected ،aria-activedescendant ،
//   متن پنهان فارسی وضعیت ساعتی، role=img روی آیکون روزانه) از همین‌جا با JS تنظیم می‌شوند.
// - آیکون قهرمان فعلاً همان SVG خورشید در index.html می‌ماند؛ مجموعهٔ SVG یکدست وضعیت‌ها هنوز تحویل نشده است
//   (یادداشت بازِ بازبینی طراح، بخش ۴ گزارش weather-app-review.md) و تغییرش با ایجنت فرانت‌اند است.
// - میلهٔ دمای روزانه با --min/--max داده‌محور می‌شود، اما CSS فعلی از این متغیرها استفاده نمی‌کند
//   (یادداشت بازِ بازبینی، بخش ۳ مورد ۴)؛ اصلاح CSS با ایجنت فرانت‌اند است.
// - جهت اسکرول نوار ساعتی در RTL (یادداشت بازِ بازبینی، بخش ۳ مورد ۵) در visual.js است و باید در مرورگرها تست شود؛ این فایل به آن دست نمی‌زند.
(function () {
  'use strict';

  var GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  var FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  var HISTORY_KEY = 'weather-recent-cities';
  var CACHE_KEY = 'weather-last';
  var HISTORY_MAX = 5;
  var SUGGEST_MAX = 5;
  var HOURLY_COUNT = 12;
  var DAILY_COUNT = 7;
  var FETCH_TIMEOUT_MS = 10000;
  var SEARCH_DEBOUNCE_MS = 300;

  var DEFAULT_CITY = { name: 'تهران', country: 'ایران', latitude: 35.69439, longitude: 51.42151, timezone: 'Asia/Tehran' };

  // پیام‌های UX دقیقاً مطابق بخش ۵ سند طرح (workspace/agent-panel/weather-uiux-design.md)
  var MSG = {
    networkError: 'اتصال به سرویس هواشناسی برقرار نشد. دوباره تلاش کنید.',
    cityNotFound: 'شهری با این نام پیدا نشد.',
    geoDenied: 'برای نمایش هوای موقعیت شما، دسترسی به موقعیت را در مرورگر فعال کنید.',
    geoUnsupported: 'مرورگر شما موقعیت مکانی را پشتیبانی نمی‌کند.',
    loading: 'در حال دریافت اطلاعات هوا…'
  };

  // نگاشت کد WMO به برچسب فارسی، کلید وضعیت (گرادیان پس‌زمینه) و ایموجی موقت
  // (ایموجی موقت است؛ جایگزینی با SVG یکدست با طراح/فرانت‌اند است — بازبینی بخش ۴)
  function conditionFor(code, isDay) {
    var night = isDay === 0;
    if (code === 0) { return night ? { key: 'night', label: 'آسمان صاف در شب', icon: '🌙' } : { key: 'sunny', label: 'آسمانی صاف', icon: '☀️' }; }
    if (code === 1 || code === 2) { return night ? { key: 'night', label: 'کمی ابری در شب', icon: '🌙' } : { key: 'sunny', label: 'کمی ابری', icon: '🌤️' }; }
    if (code === 3) { return { key: 'cloudy', label: 'ابری', icon: '☁️' }; }
    if (code === 45 || code === 48) { return { key: 'foggy', label: 'مه‌آلود', icon: '🌫️' }; }
    if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) { return { key: 'rainy', label: 'نم‌نم باران', icon: '🌦️' }; }
    if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67 || code === 80 || code === 81 || code === 82) { return { key: 'rainy', label: 'بارانی', icon: '🌧️' }; }
    if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) { return { key: 'snowy', label: 'برفی', icon: '🌨️' }; }
    if (code === 95 || code === 96 || code === 99) { return { key: 'stormy', label: 'طوفانی', icon: '⛈️' }; }
    return night ? { key: 'night', label: 'نامشخص', icon: '🌙' } : { key: 'sunny', label: 'نامشخص', icon: '☀️' };
  }

  var WIND_DIRS = ['شمالی', 'شمال شرقی', 'شرقی', 'جنوب شرقی', 'جنوبی', 'جنوب غربی', 'غربی', 'شمال غربی'];
  function windDirFa(deg) {
    if (typeof deg !== 'number' || isNaN(deg)) { return ''; }
    return WIND_DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }

  var faDigits = new Intl.NumberFormat('fa-IR');
  function faNum(value) {
    if (value === null || value === undefined || value === '') { return '—'; }
    var n = typeof value === 'number' ? Math.round(value) : value;
    return faDigits.format(n);
  }
  function faText(value) {
    return String(value).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; });
  }

  function jalaliDate(isoDate, tz) {
    try {
      var d = new Date(isoDate + 'T12:00:00');
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(d);
    } catch (e) { return ''; }
  }
  function weekdayFa(isoDate, tz) {
    try {
      var d = new Date(isoDate + 'T12:00:00');
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', timeZone: tz }).format(d);
    } catch (e) { return ''; }
  }

  function $(id) { return document.getElementById(id); }

  // پل به visual.js (فقط JS ظاهری)؛ اگر نبود، حداقل لازم را همین‌جا انجام بده
  var visual = window.weatherVisual || {
    setCondition: function (c) { document.body.setAttribute('data-condition', c); },
    showHeroSkeleton: function (show) { var s = $('heroSkeleton'), c = $('heroContent'), e = $('heroError'); if (s) { s.hidden = !show; } if (c) { c.hidden = show; } if (e) { e.hidden = true; } },
    showHeroError: function (message) { var s = $('heroSkeleton'), c = $('heroContent'), e = $('heroError'); if (s) { s.hidden = true; } if (c) { c.hidden = true; } if (e) { e.hidden = false; } if (message) { var cause = $('errorCause'); if (cause) { cause.textContent = message; } } }
  };

  function fetchJson(url, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || FETCH_TIMEOUT_MS);
    return fetch(url, { signal: controller.signal }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    }).catch(function (err) { clearTimeout(timer); throw err; });
  }

  function searchCities(query) {
    var params = new URLSearchParams({ name: query, count: String(SUGGEST_MAX), language: 'fa', format: 'json' });
    return fetchJson(GEO_URL + '?' + params.toString()).then(function (data) {
      return (data.results || []).map(function (r) {
        return { name: r.name, country: r.country || '', latitude: r.latitude, longitude: r.longitude, timezone: r.timezone || 'UTC' };
      });
    });
  }

  function fetchForecast(city) {
    var params = new URLSearchParams({
      latitude: String(city.latitude),
      longitude: String(city.longitude),
      current: 'temperature_2m,relative_humidity_2m,is_day,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation_probability',
      hourly: 'temperature_2m,weather_code,precipitation_probability',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: city.timezone || 'auto',
      forecast_days: '7'
    });
    return fetchJson(FORECAST_URL + '?' + params.toString());
  }

  // ---------- تاریخچه (فقط در مرورگر کاربر) ----------
  function loadHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX))); } catch (e) { /* ذخیرهٔ تاریخچه اختیاری است */ }
  }
  function addToHistory(city) {
    var list = loadHistory().filter(function (c) { return !(c.latitude === city.latitude && c.longitude === city.longitude); });
    list.unshift({ name: city.name, country: city.country || '', latitude: city.latitude, longitude: city.longitude, timezone: city.timezone || 'UTC' });
    saveHistory(list);
    renderHistory();
  }

  function renderHistory() {
    var wrap = $('recentSearches'), list = $('recentList');
    if (!wrap || !list) { return; }
    var items = loadHistory();
    list.replaceChildren();
    if (!items.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    items.forEach(function (city) {
      var li = document.createElement('li');
      li.textContent = city.country ? city.name + '، ' + city.country : city.name;
      li.addEventListener('click', function () { selectCity(city, true); });
      list.appendChild(li);
    });
  }

  // ---------- رندر ----------
  function setText(id, value) { var el = $(id); if (el) { el.textContent = value; } }

  function renderCurrent(city, data) {
    var cur = data.current || {};
    var cond = conditionFor(cur.weather_code, cur.is_day);
    visual.setCondition(cond.key);
    setText('cityName', city.name);
    var datePart = (cur.time || '').slice(0, 10);
    setText('jalaliDate', jalaliDate(datePart, city.timezone || 'UTC'));
    setText('localTime', faText((cur.time || '').slice(11, 16)));
    setText('currentTemp', faNum(cur.temperature_2m));
    setText('conditionText', cond.label);
    var icon = $('conditionIcon');
    if (icon) { icon.setAttribute('aria-label', cond.label); }
    var daily = data.daily || {};
    setText('tempMax', faNum(daily.temperature_2m_max ? daily.temperature_2m_max[0] : null) + '°');
    setText('tempMin', faNum(daily.temperature_2m_min ? daily.temperature_2m_min[0] : null) + '°');
    setText('humidity', faNum(cur.relative_humidity_2m));
    setText('windSpeed', faNum(cur.wind_speed_10m));
    setText('windDir', windDirFa(cur.wind_direction_10m));
    setText('pressure', faNum(cur.surface_pressure));
    setText('precipChance', faNum(cur.precipitation_probability));
    // اگر احتمال بارش از API نیامد، کارت بارش را پنهان کن (بخش خالی، نه خطا)
    var precipEl = $('precipChance');
    if (precipEl && (cur.precipitation_probability === null || cur.precipitation_probability === undefined)) {
      var card = precipEl.parentElement && precipEl.parentElement.parentElement;
      if (card) { card.hidden = true; }
    }
  }

  function renderHourly(data) {
    var list = $('hourlyList'), empty = $('hourlyEmpty');
    if (!list) { return; }
    var hourly = data.hourly || {};
    var times = hourly.time || [];
    var temps = hourly.temperature_2m || [];
    var codes = hourly.weather_code || [];
    var curTime = (data.current && data.current.time) || '';
    var startHour = curTime.slice(0, 13) + ':00';
    var start = 0;
    for (var i = 0; i < times.length; i++) { if (times[i] >= startHour) { start = i; break; } start = i; }
    var slice = [];
    for (var j = start; j < Math.min(times.length, start + HOURLY_COUNT); j++) { slice.push(j); }
    list.replaceChildren();
    if (!slice.length) {
      list.hidden = true;
      if (empty) { empty.hidden = false; }
      return;
    }
    list.hidden = false;
    if (empty) { empty.hidden = true; }
    slice.forEach(function (idx, k) {
      var cond = conditionFor(codes[idx], 1);
      var li = document.createElement('li');
      li.className = 'hourly-item';
      var hour = document.createElement('span');
      hour.textContent = k === 0 ? 'اکنون' : faNum(parseInt(times[idx].slice(11, 13), 10));
      if (k === 0) { hour.className = 'hourly-now'; }
      var icon = document.createElement('span');
      icon.className = 'hourly-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = cond.icon;
      // یادآوری بازبینی طراح (مورد ۱): متن پنهان فارسی وضعیت برای صفحه‌خوان
      var sr = document.createElement('span');
      sr.className = 'visually-hidden';
      sr.textContent = cond.label;
      var temp = document.createElement('span');
      temp.className = 'hourly-temp';
      temp.textContent = faNum(temps[idx]) + '°';
      li.appendChild(hour);
      li.appendChild(icon);
      li.appendChild(sr);
      li.appendChild(temp);
      list.appendChild(li);
    });
  }

  function renderDaily(city, data) {
    var list = $('dailyList'), empty = $('dailyEmpty');
    if (!list) { return; }
    var daily = data.daily || {};
    var days = daily.time || [];
    var codes = daily.weather_code || [];
    var maxs = daily.temperature_2m_max || [];
    var mins = daily.temperature_2m_min || [];
    list.replaceChildren();
    if (!days.length) {
      list.hidden = true;
      if (empty) { empty.hidden = false; }
      return;
    }
    list.hidden = false;
    if (empty) { empty.hidden = true; }
    for (var i = 0; i < Math.min(days.length, DAILY_COUNT); i++) {
      var cond = conditionFor(codes[i], 1);
      var row = document.createElement('li');
      row.className = 'daily-row';
      var day = document.createElement('span');
      day.className = 'daily-day';
      day.textContent = i === 0 ? 'امروز' : weekdayFa(days[i], city.timezone || 'UTC');
      var icon = document.createElement('span');
      icon.className = 'daily-icon';
      icon.setAttribute('role', 'img'); // یادآوری بازبینی طراح (مورد ۲): بدون role بیشتر صفحه‌خوان‌ها aria-label را نادیده می‌گیرند
      icon.setAttribute('aria-label', cond.label);
      icon.textContent = cond.icon;
      var temps = document.createElement('span');
      temps.className = 'daily-temps';
      var min = document.createElement('span');
      min.textContent = faNum(mins[i]) + '°';
      var bar = document.createElement('span');
      bar.className = 'temp-bar';
      bar.setAttribute('aria-hidden', 'true');
      bar.style.setProperty('--min', String(mins[i]));
      bar.style.setProperty('--max', String(maxs[i]));
      var max = document.createElement('span');
      max.textContent = faNum(maxs[i]) + '°';
      temps.appendChild(min);
      temps.appendChild(bar);
      temps.appendChild(max);
      row.appendChild(day);
      row.appendChild(icon);
      row.appendChild(temps);
      list.appendChild(row);
    }
  }

  function renderAll(city, data) {
    renderCurrent(city, data);
    renderHourly(data);
    renderDaily(city, data);
  }

  // ---------- بارگذاری شهر ----------
  var currentCity = DEFAULT_CITY;
  var lastRequest = null;

  function loadCity(city, opts) {
    opts = opts || {};
    currentCity = city;
    lastRequest = { city: city };
    closeSuggestions();
    var geoBtn = $('geoBtn');
    var retryBtn = $('retryBtn');
    if (geoBtn) { geoBtn.disabled = true; }
    if (retryBtn) { retryBtn.disabled = true; }
    visual.showHeroSkeleton(true);
    var announcer = $('loadingAnnouncer');
    if (announcer) { announcer.textContent = MSG.loading; }
    return fetchForecast(city).then(function (data) {
      if (geoBtn) { geoBtn.disabled = false; }
      if (retryBtn) { retryBtn.disabled = false; }
      visual.showHeroSkeleton(false);
      renderAll(city, data);
      if (!opts.silent) { addToHistory(city); }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ city: city, data: data, savedAt: Date.now() })); } catch (e) { /* کش اختیاری است */ }
    }).catch(function () {
      if (geoBtn) { geoBtn.disabled = false; }
      if (retryBtn) { retryBtn.disabled = false; }
      // آفلاین با کش: آخرین دادهٔ ذخیره‌شده را نشان بده (همان وعدهٔ بنر آفلاین)
      if (!navigator.onLine) {
        try {
          var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
          if (cached && cached.data) {
            visual.showHeroSkeleton(false);
            renderAll(cached.city, cached.data);
            return;
          }
        } catch (e) { /* بدون کش، خطا نشان بده */ }
      }
      visual.showHeroError(MSG.networkError);
    });
  }

  function selectCity(city, fromHistory) {
    var input = $('cityInput');
    if (input) { input.value = city.name; }
    hideSearchEmpty();
    loadCity(city);
  }

  // ---------- جست‌وجو و پیشنهادها ----------
  var searchTimer = null;
  var searchAbort = null;
  var suggestions = [];
  var activeIndex = -1;
  var searchEmptyDefault = '';

  function hideSearchEmpty() { var el = $('searchEmpty'); if (el) { el.hidden = true; } }
  function showSearchEmpty(text) {
    var el = $('searchEmpty');
    if (!el) { return; }
    el.textContent = text || searchEmptyDefault;
    el.hidden = false;
  }

  function closeSuggestions() {
    var list = $('suggestions');
    var input = $('cityInput');
    if (list) { list.replaceChildren(); list.hidden = true; }
    if (input) {
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    suggestions = [];
    activeIndex = -1;
  }

  function openSuggestions(items) {
    var list = $('suggestions');
    var input = $('cityInput');
    if (!list || !input) { return; }
    list.replaceChildren();
    suggestions = items;
    activeIndex = -1;
    if (!items.length) { closeSuggestions(); return; }
    items.forEach(function (city, idx) {
      var li = document.createElement('li');
      li.id = 'suggestion-' + idx;
      li.setAttribute('role', 'option'); // یادآوری بازبینی طراح (مورد ۳)
      li.setAttribute('aria-selected', 'false');
      li.textContent = city.country ? city.name + '، ' + city.country : city.name;
      li.addEventListener('click', function () { selectCity(city); });
      li.addEventListener('mouseenter', function () { setActive(idx); });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function setActive(idx) {
    var list = $('suggestions');
    var input = $('cityInput');
    if (!list || !input) { return; }
    var items = list.children;
    for (var i = 0; i < items.length; i++) { items[i].setAttribute('aria-selected', i === idx ? 'true' : 'false'); }
    activeIndex = idx;
    if (idx >= 0 && items[idx]) {
      input.setAttribute('aria-activedescendant', items[idx].id); // یادآوری بازبینی طراح (مورد ۳)
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function runSearch(query) {
    if (searchAbort) { searchAbort.abort(); }
    searchAbort = new AbortController();
    var signal = searchAbort.signal;
    var params = new URLSearchParams({ name: query, count: String(SUGGEST_MAX), language: 'fa', format: 'json' });
    fetch(GEO_URL + '?' + params.toString(), { signal: signal }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    }).then(function (data) {
      var items = (data.results || []).map(function (r) {
        return { name: r.name, country: r.country || '', latitude: r.latitude, longitude: r.longitude, timezone: r.timezone || 'UTC' };
      });
      if (!items.length) {
        closeSuggestions();
        showSearchEmpty();
        return;
      }
      hideSearchEmpty();
      openSuggestions(items);
    }).catch(function (err) {
      if (err && err.name === 'AbortError') { return; }
      closeSuggestions();
    });
  }

  function bindSearch() {
    var input = $('cityInput');
    var form = $('searchForm');
    var empty = $('searchEmpty');
    if (empty) { searchEmptyDefault = empty.textContent; }
    if (!input) { return; }
    input.addEventListener('input', function () {
      hideSearchEmpty();
      var q = input.value.trim();
      if (searchTimer) { clearTimeout(searchTimer); }
      if (q.length < 2) { closeSuggestions(); return; }
      searchTimer = setTimeout(function () { runSearch(q); }, SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!suggestions.length) { return; }
        e.preventDefault();
        var next = e.key === 'ArrowDown'
          ? (activeIndex + 1) % suggestions.length
          : (activeIndex - 1 + suggestions.length) % suggestions.length;
        setActive(next);
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          selectCity(suggestions[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        closeSuggestions();
      }
    });
    input.addEventListener('blur', function () {
      // مکث کوتاه تا کلیک روی پیشنهاد پیش از بسته‌شدن ثبت شود
      setTimeout(closeSuggestions, 150);
    });
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) { selectCity(suggestions[activeIndex]); return; }
        var q = input.value.trim();
        if (q.length < 2) { return; }
        searchCities(q).then(function (items) {
          if (!items.length) { showSearchEmpty(); return; }
          selectCity(items[0]);
        }).catch(function () { showSearchEmpty(MSG.networkError); });
      });
    }
    var clearBtn = $('recentClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        saveHistory([]);
        renderHistory();
      });
    }
  }

  // ---------- موقعیت من ----------
  function bindGeo() {
    var btn = $('geoBtn');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
      if (!navigator.geolocation) { showSearchEmpty(MSG.geoUnsupported); return; }
      btn.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        btn.disabled = false;
        var city = { name: 'موقعیت من', country: '', latitude: pos.coords.latitude, longitude: pos.coords.longitude, timezone: 'auto' };
        hideSearchEmpty();
        loadCity(city);
      }, function () {
        btn.disabled = false;
        // طبق طرح: اگر اجازه داده نشد، تهران می‌ماند و پیام توضیحی می‌آید
        showSearchEmpty(MSG.geoDenied);
      }, { timeout: 10000 });
    });
  }

  function bindRetry() {
    var btn = $('retryBtn');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
      if (lastRequest) { loadCity(lastRequest.city); }
    });
  }

  function bindOnline() {
    window.addEventListener('online', function () {
      // اگر صفحه در حالت خطاست، با وصل‌شدن دوباره تلاش کن
      var err = $('heroError');
      if (err && !err.hidden && lastRequest) { loadCity(lastRequest.city); }
    });
  }

  function init() {
    bindSearch();
    bindGeo();
    bindRetry();
    bindOnline();
    renderHistory();
    if (!navigator.onLine) {
      try {
        var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && cached.data) {
          renderAll(cached.city, cached.data);
          return;
        }
      } catch (e) { /* بدون کش، تلاش عادی */ }
    }
    loadCity(DEFAULT_CITY, { silent: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
