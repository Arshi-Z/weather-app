// پیاده‌سازی اعمال‌شده (پیشنهاد ۲ — تأیید ارشیا، ۲۲ نوامبر ۲۰۲۶) — وظیفهٔ id=1، ایجنت «توسعه‌دهنده فرانت‌اند» (id=5)
// فقط JS ظاهری: تغییر گرادیان پس‌زمینه با وضعیت هوا، نمایش/پنهان اسکلت بارگذاری،
/// اسکرول نوار ساعتی و بنر آفلاین. منطق fetch، پردازش داده و اعتبارسنجی مال ایجنت جاوااسکریپت (id=7) است
// و در این فایل نیست. هیچ دادهٔ کاربری به‌صورت ناامن وارد صفحه نمی‌شود.
(function () {
  'use strict';

  var CONDITIONS = ['sunny', 'cloudy', 'rainy', 'snowy', 'night', 'stormy', 'foggy'];

  // تغییر گرادیان پس‌زمینه بر اساس وضعیت هوا (مقدار از data-condition خوانده می‌شود)
  function setCondition(condition) {
    if (CONDITIONS.indexOf(condition) === -1) { condition = 'sunny'; }
    document.body.setAttribute('data-condition', condition);
  }

  // نمایش اسکلت بارگذاری به‌جای محتوای کارت قهرمان
  function showHeroSkeleton(show) {
    var skeleton = document.getElementById('heroSkeleton');
    var content = document.getElementById('heroContent');
    var error = document.getElementById('heroError');
    if (!skeleton || !content || !error) { return; }
    skeleton.hidden = !show;
    content.hidden = show;
    error.hidden = true;
    document.getElementById('loadingAnnouncer').textContent = show ? 'در حال دریافت اطلاعات هوا…' : '';
  }

  // نمایش خطا با دکمهٔ «تلاش دوباره» (علت خطا را ایجنت جاوااسکریپت با textContent می‌نویسد)
  function showHeroError(message) {
    var skeleton = document.getElementById('heroSkeleton');
    var content = document.getElementById('heroContent');
    var error = document.getElementById('heroError');
    if (!skeleton || !content || !error) { return; }
    skeleton.hidden = true;
    content.hidden = true;
    error.hidden = false;
    if (message) { document.getElementById('errorCause').textContent = message; }
  }

  // بنر آفلاین
  function updateOfflineBanner() {
    var banner = document.getElementById('offlineBanner');
    if (banner) { banner.hidden = navigator.onLine; }
  }

  // دکمه‌های جلو/عقب نوار ساعتی (فقط در دسکتاپ دیده می‌شوند)
  function bindHourlyScroll() {
    var list = document.getElementById('hourlyList');
    var prev = document.getElementById('hourlyPrev');
    var next = document.getElementById('hourlyNext');
    if (!list || !prev || !next) { return; }
    var step = 220;
    prev.addEventListener('click', function () { list.scrollBy({ left: step, behavior: 'smooth' }); });
    next.addEventListener('click', function () { list.scrollBy({ left: -step, behavior: 'smooth' }); });
  }

  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  updateOfflineBanner();
  bindHourlyScroll();

  // در دسترس ایجنت جاوااسکریپت برای اتصال منطق داده (بدون تغییر ظاهر)
  window.weatherVisual = { setCondition: setCondition, showHeroSkeleton: showHeroSkeleton, showHeroError: showHeroError };
})();
