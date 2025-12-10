// ===========================================
// 定数・設定
// ===========================================
const SEARCH_DELAY_MS = 300;
const DEFAULT_COLOR = '#4285f4';

const CACHE_CONFIG = {
  theme: { key: 'dashboardTheme' },
  weather: { key: 'weatherCache', duration: 10 * 60 * 1000 },      // 10分
  holidays: { key: 'holidaysCache', duration: 24 * 60 * 60 * 1000 }, // 24時間
  events: { key: 'calendarEventsCache', duration: 5 * 60 * 1000 },   // 5分
  calendarList: { key: 'calendarListCache', duration: 60 * 60 * 1000 }, // 1時間
  shortcuts: { key: 'shortcuts' }
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const WEATHER_CODES = {
  0: { icon: '☀️', desc: '快晴' },
  1: { icon: '🌤️', desc: '晴れ' },
  2: { icon: '⛅', desc: '曇りがち' },
  3: { icon: '☁️', desc: '曇り' },
  45: { icon: '🌫️', desc: '霧' },
  48: { icon: '🌫️', desc: '霧氷' },
  51: { icon: '🌧️', desc: '小雨' },
  53: { icon: '🌧️', desc: '雨' },
  55: { icon: '🌧️', desc: '強い雨' },
  61: { icon: '🌧️', desc: '小雨' },
  63: { icon: '🌧️', desc: '雨' },
  65: { icon: '🌧️', desc: '強い雨' },
  71: { icon: '🌨️', desc: '小雪' },
  73: { icon: '🌨️', desc: '雪' },
  75: { icon: '🌨️', desc: '大雪' },
  80: { icon: '🌦️', desc: 'にわか雨' },
  81: { icon: '🌦️', desc: 'にわか雨' },
  82: { icon: '⛈️', desc: '激しいにわか雨' },
  95: { icon: '⛈️', desc: '雷雨' },
  96: { icon: '⛈️', desc: '雷雨（雹）' },
  99: { icon: '⛈️', desc: '激しい雷雨（雹）' }
};

// ===========================================
// DOM要素
// ===========================================
const elements = {
  themeSelect: document.getElementById('theme-select'),
  clockTime: document.getElementById('clock-time'),
  clockDate: document.getElementById('clock-date'),
  searchInput: document.getElementById('search-input'),
  weather: document.getElementById('weather'),
  shortcuts: document.getElementById('shortcuts'),
  monthCalendar: document.getElementById('month-calendar'),
  calendarEvents: document.getElementById('calendar-events'),
  eventModal: document.getElementById('event-modal'),
  modalBody: document.getElementById('modal-body'),
  modalClose: document.getElementById('modal-close'),
  shortcutModal: document.getElementById('shortcut-modal'),
  shortcutModalClose: document.getElementById('shortcut-modal-close'),
  shortcutModalTitle: document.getElementById('shortcut-modal-title'),
  shortcutForm: document.getElementById('shortcut-form'),
  shortcutTitle: document.getElementById('shortcut-title'),
  shortcutUrl: document.getElementById('shortcut-url'),
  shortcutDelete: document.getElementById('shortcut-delete')
};

// ===========================================
// キャッシュユーティリティ
// ===========================================
let allCacheData = null;

async function loadAllCache() {
  try {
    const keys = Object.values(CACHE_CONFIG).map(c => c.key);
    allCacheData = await chrome.storage.local.get(keys);
  } catch (e) {
    console.warn('Cache load error:', e);
    allCacheData = {};
  }
}

function getCache(config) {
  const cache = allCacheData?.[config.key];
  if (cache && (!config.duration || Date.now() - cache.timestamp < config.duration)) {
    return cache;
  }
  return null;
}

async function setCache(config, data) {
  const cacheData = { ...data, timestamp: Date.now() };
  if (allCacheData) allCacheData[config.key] = cacheData;
  try {
    await chrome.storage.local.set({ [config.key]: cacheData });
  } catch (e) {
    console.warn(`Cache write error (${config.key}):`, e);
  }
}

// ===========================================
// ユーティリティ関数
// ===========================================
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(text) {
  return text ? String(text).replace(/[&<>"']/g, c => escapeMap[c]) : '';
}

function isValidColor(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

function isValidHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}

function formatDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function sortEventsByTime(events) {
  return events.sort((a, b) => {
    const aTime = a.start.dateTime || a.start.date;
    const bTime = b.start.dateTime || b.start.date;
    return new Date(aTime) - new Date(bTime);
  });
}

// ===========================================
// テーマ機能
// ===========================================
function applyTheme(mode) {
  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
}

function loadTheme() {
  const cache = getCache(CACHE_CONFIG.theme);
  const mode = cache?.mode || 'auto';
  elements.themeSelect.value = mode;
  applyTheme(mode);
}

function changeTheme() {
  const mode = elements.themeSelect.value;
  applyTheme(mode);
  setCache(CACHE_CONFIG.theme, { mode });
}

elements.themeSelect.addEventListener('change', changeTheme);

// ===========================================
// 時計機能
// ===========================================
let lastDateStr = '';

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  elements.clockTime.textContent = `${hours}:${minutes}:${seconds}`;

  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 (${WEEKDAYS[now.getDay()]})`;
  if (dateStr !== lastDateStr) {
    elements.clockDate.textContent = dateStr;
    lastDateStr = dateStr;
  }
}

updateClock();
setInterval(updateClock, 1000);

// ===========================================
// 検索機能
// ===========================================
elements.searchInput.focus();

elements.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = elements.searchInput.value.trim();
    if (query) {
      elements.searchInput.blur();
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'search', query });
      }, SEARCH_DELAY_MS);
    }
  }
});

// ===========================================
// 天気機能
// ===========================================
function displayWeather(temp, code, locationName) {
  const weather = WEATHER_CODES[code] || { icon: '🌡️', desc: '' };
  elements.weather.innerHTML = `
    <span class="weather-icon">${weather.icon}</span>
    <span class="weather-temp">${temp}°C</span>
    <span class="weather-desc">${weather.desc}</span>
    ${locationName ? `<span class="weather-location">${escapeHtml(locationName)}</span>` : ''}
  `;
}

async function fetchWeather() {
  const cache = getCache(CACHE_CONFIG.weather);
  if (cache) {
    displayWeather(cache.temp, cache.code, cache.locationName);
    return;
  }

  elements.weather.innerHTML = '<span class="weather-loading">天気を取得中...</span>';

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 600000
      });
    });

    const { latitude, longitude } = position.coords;

    const [weatherResponse, geoResponse] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`),
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ja`)
    ]);

    const data = await weatherResponse.json();
    let locationName = '';

    try {
      const geoData = await geoResponse.json();
      locationName = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.municipality || '';
    } catch (e) {
      console.warn('Geocoding error:', e);
    }

    if (data.current) {
      const temp = Math.round(data.current.temperature_2m);
      const code = data.current.weather_code;
      displayWeather(temp, code, locationName);
      await setCache(CACHE_CONFIG.weather, { temp, code, locationName });
    }
  } catch (error) {
    console.warn('Weather error:', error);
    elements.weather.innerHTML = '';
  }
}

// ===========================================
// 祝日・カレンダー機能
// ===========================================
let currentMonth = new Date();
let holidays = {};

async function fetchHolidays() {
  const cache = getCache(CACHE_CONFIG.holidays);
  if (cache?.data) {
    holidays = cache.data;
    return;
  }

  try {
    const response = await fetch('https://holidays-jp.github.io/api/v1/date.json');
    holidays = await response.json();
    await setCache(CACHE_CONFIG.holidays, { data: holidays });
  } catch (e) {
    console.warn('Failed to fetch holidays:', e);
  }
}

function isHoliday(year, month, day) {
  return holidays[formatDateStr(year, month, day)] !== undefined;
}

function getHolidayName(year, month, day) {
  return holidays[formatDateStr(year, month, day)] || '';
}

function renderMonthCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  let html = `
    <div class="month-header">
      <button class="month-nav" id="prev-month">◀</button>
      <span class="month-title">${year}年 ${monthNames[month]}</span>
      <button class="month-nav" id="next-month">▶</button>
    </div>
    <div class="weekdays">
      ${WEEKDAYS.map((day, i) => {
        let cls = 'weekday';
        if (i === 0) cls += ' sunday';
        if (i === 6) cls += ' saturday';
        return `<div class="${cls}">${day}</div>`;
      }).join('')}
    </div>
    <div class="days">
  `;

  // 前月の日付
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const dayOfWeek = (startDayOfWeek - i - 1 + 7) % 7;
    let cls = 'day other-month clickable';
    if (dayOfWeek === 0 || isHoliday(prevYear, prevMonth, dayNum)) cls += ' sunday';
    else if (dayOfWeek === 6) cls += ' saturday';
    html += `<div class="${cls}" data-date="${formatDateStr(prevYear, prevMonth, dayNum)}">${dayNum}</div>`;
  }

  // 当月の日付
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dayOfWeek = new Date(year, month, day).getDay();
    const holidayName = getHolidayName(year, month, day);
    let cls = 'day clickable';
    if (dayOfWeek === 0 || holidayName) cls += ' sunday';
    else if (dayOfWeek === 6) cls += ' saturday';
    if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
      cls += ' today';
    }
    const title = holidayName ? ` title="${escapeHtml(holidayName)}"` : '';
    html += `<div class="${cls}" data-date="${formatDateStr(year, month, day)}"${title}>${day}</div>`;
  }

  // 次月の日付
  const totalCells = startDayOfWeek + lastDay.getDate();
  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  for (let day = 1; day <= remainingCells; day++) {
    const dayOfWeek = (totalCells + day - 1) % 7;
    let cls = 'day other-month clickable';
    if (dayOfWeek === 0 || isHoliday(nextYear, nextMonth, day)) cls += ' sunday';
    else if (dayOfWeek === 6) cls += ' saturday';
    html += `<div class="${cls}" data-date="${formatDateStr(nextYear, nextMonth, day)}">${day}</div>`;
  }

  html += '</div>';
  html += '<div class="today-btn-wrapper"><button class="today-btn" id="go-today">今日に戻る</button></div>';

  elements.monthCalendar.innerHTML = html;
}

// カレンダー操作 - イベント委譲で一括処理
elements.monthCalendar.addEventListener('click', (e) => {
  const target = e.target;

  // 前月ボタン
  if (target.id === 'prev-month') {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderMonthCalendar();
    return;
  }

  // 次月ボタン
  if (target.id === 'next-month') {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderMonthCalendar();
    return;
  }

  // 今日に戻るボタン
  if (target.id === 'go-today') {
    currentMonth = new Date();
    renderMonthCalendar();
    refreshTodayTomorrowEvents();
    return;
  }

  // 日付クリック
  const dayEl = target.closest('.day.clickable');
  if (dayEl?.dataset.date) {
    showDayEvents(dayEl.dataset.date);
  }
});

// ===========================================
// Googleカレンダー機能
// ===========================================
let cachedToken = null;
let cachedCalendars = null;

async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

async function fetchCalendarList() {
  const cache = getCache(CACHE_CONFIG.calendarList);
  if (cache?.data) {
    return cache.data;
  }

  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: { Authorization: `Bearer ${cachedToken}` } }
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'カレンダー一覧の取得に失敗しました');
  }

  const calendars = data.items || [];
  await setCache(CACHE_CONFIG.calendarList, { data: calendars });
  return calendars;
}

async function fetchEventsFromCalendars(params) {
  const eventPromises = cachedCalendars.map(async (calendar) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
        { headers: { Authorization: `Bearer ${cachedToken}` } }
      );
      const data = await response.json();

      if (response.ok && data.items) {
        return data.items.map(event => ({
          ...event,
          calendarColor: calendar.backgroundColor || '#4285f4',
          calendarName: calendar.summary || ''
        }));
      }
      return [];
    } catch (e) {
      console.warn('Failed to fetch events:', e);
      return [];
    }
  });

  const eventsArrays = await Promise.all(eventPromises);
  return sortEventsByTime(eventsArrays.flat());
}

function createEventParams(startOfDay, endOfDay) {
  return new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
    fields: 'items(id,summary,start,end,location,description)'
  });
}

async function fetchCalendarEvents() {
  const cache = getCache(CACHE_CONFIG.events);
  if (cache) {
    displayEvents(cache.events, new Date(cache.startOfDay));
  } else {
    elements.calendarEvents.innerHTML = '<div class="calendar-loading">カレンダーを読み込み中...</div>';
  }

  try {
    cachedToken = await getAuthToken();
    cachedCalendars = await fetchCalendarList();

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

    const allEvents = await fetchEventsFromCalendars(createEventParams(startOfDay, endOfTomorrow));
    displayEvents(allEvents, startOfDay);
    await setCache(CACHE_CONFIG.events, { events: allEvents, startOfDay: startOfDay.toISOString() });
  } catch (error) {
    console.error('Calendar error:', error);
    if (!cache) {
      elements.calendarEvents.innerHTML = `<div class="calendar-error">エラー: ${escapeHtml(error.message)}</div>`;
    }
  }
}

function displayEvents(events, startOfDay) {
  if (events.length === 0) {
    elements.calendarEvents.innerHTML = '<div class="no-events">予定はありません</div>';
    return;
  }

  const today = new Date(startOfDay);
  const tomorrow = new Date(startOfDay);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr = today.toDateString();
  const tomorrowStr = tomorrow.toDateString();

  const todayEvents = [];
  const tomorrowEvents = [];

  events.forEach(event => {
    const eventDateStr = new Date(event.start.dateTime || event.start.date).toDateString();
    if (eventDateStr === todayStr) todayEvents.push(event);
    else if (eventDateStr === tomorrowStr) tomorrowEvents.push(event);
  });

  let html = '';
  if (todayEvents.length > 0) {
    html += `<div class="date-section"><div class="date-header">今日</div>${todayEvents.map(renderEvent).join('')}</div>`;
  }
  if (tomorrowEvents.length > 0) {
    html += `<div class="date-section"><div class="date-header">明日</div>${tomorrowEvents.map(renderEvent).join('')}</div>`;
  }

  elements.calendarEvents.innerHTML = html || '<div class="no-events">予定はありません</div>';

  const allDisplayedEvents = [...todayEvents, ...tomorrowEvents];
  document.querySelectorAll('.event-item').forEach((el, index) => {
    el.addEventListener('click', () => showEventModal(allDisplayedEvents[index]));
  });
}

function renderEvent(event) {
  const startTime = formatEventTime(event.start);
  const color = isValidColor(event.calendarColor) ? event.calendarColor : DEFAULT_COLOR;
  return `
    <div class="event-item">
      <span class="event-color" style="background-color: ${color}"></span>
      <div class="event-content">
        <div class="event-time">${startTime}</div>
        <div class="event-title">${escapeHtml(event.summary || '(タイトルなし)')}</div>
      </div>
    </div>
  `;
}

function formatEventTime(start) {
  if (start.dateTime) {
    return new Date(start.dateTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }
  return '終日';
}

function formatEventDateTime(start, end) {
  if (start.dateTime) {
    const startDate = new Date(start.dateTime);
    const dateStr = startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
    const startTimeStr = startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    if (end?.dateTime) {
      const endTimeStr = new Date(end.dateTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} ${startTimeStr} - ${endTimeStr}`;
    }
    return `${dateStr} ${startTimeStr}`;
  }

  return new Date(start.date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) + ' (終日)';
}

async function showDayEvents(dateStr) {
  if (!cachedToken || !cachedCalendars) return;

  const targetDate = new Date(dateStr);
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

  elements.calendarEvents.innerHTML = '<div class="calendar-loading">読み込み中...</div>';

  const allEvents = await fetchEventsFromCalendars(createEventParams(startOfDay, endOfDay));
  const dateLabel = targetDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

  let html = `<div class="date-section"><div class="date-header">${dateLabel}</div>`;
  html += allEvents.length === 0
    ? '<div class="no-events">予定はありません</div>'
    : allEvents.map(renderEvent).join('');
  html += '</div>';

  elements.calendarEvents.innerHTML = html;

  document.querySelectorAll('#calendar-events .event-item').forEach((el, index) => {
    el.addEventListener('click', () => showEventModal(allEvents[index]));
  });
}

async function refreshTodayTomorrowEvents() {
  if (!cachedToken || !cachedCalendars) {
    fetchCalendarEvents();
    return;
  }

  elements.calendarEvents.innerHTML = '<div class="calendar-loading">読み込み中...</div>';

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

  const allEvents = await fetchEventsFromCalendars(createEventParams(startOfDay, endOfTomorrow));
  displayEvents(allEvents, startOfDay);
}

// ===========================================
// モーダル機能
// ===========================================
function showEventModal(event) {
  const color = isValidColor(event.calendarColor) ? event.calendarColor : DEFAULT_COLOR;
  const dateTime = formatEventDateTime(event.start, event.end);

  let html = `
    <div class="modal-title">
      <span class="modal-color" style="background-color: ${color}"></span>
      <span>${escapeHtml(event.summary || '(タイトルなし)')}</span>
    </div>
    <div class="modal-row">
      <span class="modal-icon">🕐</span>
      <span>${dateTime}</span>
    </div>
  `;

  if (event.location) {
    html += `<div class="modal-row"><span class="modal-icon">📍</span><span>${escapeHtml(event.location)}</span></div>`;
  }
  if (event.description) {
    html += `<div class="modal-row"><span class="modal-icon">📝</span><span class="modal-description">${escapeHtml(event.description)}</span></div>`;
  }
  if (event.calendarName) {
    html += `<div class="modal-row modal-calendar"><span class="modal-icon">📅</span><span>${escapeHtml(event.calendarName)}</span></div>`;
  }

  elements.modalBody.innerHTML = html;
  elements.eventModal.classList.add('show');
}

function hideEventModal() {
  elements.eventModal.classList.remove('show');
}

elements.modalClose.addEventListener('click', hideEventModal);
elements.eventModal.addEventListener('click', (e) => {
  if (e.target === elements.eventModal) hideEventModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideEventModal();
    hideShortcutModal();
  }
});

// ===========================================
// ショートカット機能
// ===========================================
let shortcuts = [];
let editingShortcutIndex = -1;

function getFaviconUrl(url) {
  try {
    const domain = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
}

function getInitial(title) {
  return title ? title.charAt(0).toUpperCase() : '?';
}

function renderShortcuts() {
  let html = shortcuts.map((shortcut, index) => {
    const faviconUrl = getFaviconUrl(shortcut.url);
    const iconContent = faviconUrl
      ? `<img src="${faviconUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
      : '';
    const placeholder = `<span class="shortcut-icon-placeholder" ${faviconUrl ? 'style="display:none"' : ''}>${getInitial(shortcut.title)}</span>`;

    return `
      <div class="shortcut-item" data-index="${index}" data-url="${escapeHtml(shortcut.url)}">
        <div class="shortcut-icon">
          ${iconContent}
          ${placeholder}
        </div>
        <span class="shortcut-title">${escapeHtml(shortcut.title)}</span>
      </div>
    `;
  }).join('');

  html += `
    <div class="shortcut-item shortcut-add" id="shortcut-add">
      <div class="shortcut-icon">
        <span class="shortcut-add-icon">+</span>
      </div>
      <span class="shortcut-title">追加</span>
    </div>
  `;

  elements.shortcuts.innerHTML = html;

  // クリックイベント
  elements.shortcuts.querySelectorAll('.shortcut-item[data-index]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd + クリックで編集
        e.preventDefault();
        openShortcutModal(parseInt(item.dataset.index));
      } else {
        // 通常クリックでURLへ遷移（http/httpsのみ許可）
        const url = item.dataset.url;
        if (isValidHttpUrl(url)) {
          window.location.href = url;
        }
      }
    });
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openShortcutModal(parseInt(item.dataset.index));
    });
  });

  document.getElementById('shortcut-add')?.addEventListener('click', () => {
    openShortcutModal(-1);
  });
}

function openShortcutModal(index) {
  editingShortcutIndex = index;

  if (index >= 0) {
    elements.shortcutModalTitle.textContent = 'ショートカットを編集';
    elements.shortcutTitle.value = shortcuts[index].title;
    elements.shortcutUrl.value = shortcuts[index].url;
    elements.shortcutDelete.classList.remove('hidden');
  } else {
    elements.shortcutModalTitle.textContent = 'ショートカットを追加';
    elements.shortcutTitle.value = '';
    elements.shortcutUrl.value = '';
    elements.shortcutDelete.classList.add('hidden');
  }

  elements.shortcutModal.classList.add('show');
  elements.shortcutTitle.focus();
}

function hideShortcutModal() {
  elements.shortcutModal.classList.remove('show');
  editingShortcutIndex = -1;
}

async function saveShortcuts() {
  await setCache(CACHE_CONFIG.shortcuts, { data: shortcuts });
}

function loadShortcuts() {
  const cache = getCache(CACHE_CONFIG.shortcuts);
  shortcuts = cache?.data || [];
  renderShortcuts();
}

elements.shortcutModalClose.addEventListener('click', hideShortcutModal);
elements.shortcutModal.addEventListener('click', (e) => {
  if (e.target === elements.shortcutModal) hideShortcutModal();
});

elements.shortcutForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = elements.shortcutTitle.value.trim();
  let url = elements.shortcutUrl.value.trim();

  if (!title || !url) return;

  // URLにプロトコルがない場合は追加
  if (!url.match(/^https?:\/\//)) {
    url = 'https://' + url;
  }

  if (editingShortcutIndex >= 0) {
    shortcuts[editingShortcutIndex] = { title, url };
  } else {
    shortcuts.push({ title, url });
  }

  await saveShortcuts();
  renderShortcuts();
  hideShortcutModal();
});

elements.shortcutDelete.addEventListener('click', async () => {
  if (editingShortcutIndex >= 0) {
    shortcuts.splice(editingShortcutIndex, 1);
    await saveShortcuts();
    renderShortcuts();
    hideShortcutModal();
  }
});

// ===========================================
// 初期化 - 並列実行で高速化
// ===========================================
loadAllCache().then(() => {
  loadTheme();
  loadShortcuts();
  Promise.all([
    fetchWeather(),
    fetchHolidays().then(renderMonthCalendar),
    fetchCalendarEvents()
  ]);
});
