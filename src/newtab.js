// ===========================================
// 定数・設定
// ===========================================
const SEARCH_DELAY_MS = 300;
const DEFAULT_COLOR = '#4285f4';
const MS_PER_DAY = 86400000;
const CALENDAR_REFRESH_INTERVAL = 10 * 60 * 1000; // 10分ごとに自動更新

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
const escapeRegex = /[&<>"']/g;
function escapeHtml(text) {
  return text ? String(text).replace(escapeRegex, c => escapeMap[c]) : '';
}

const colorRegex = /^#[0-9A-Fa-f]{6}$/;
function isValidColor(color) {
  return colorRegex.test(color);
}

const httpUrlRegex = /^https?:\/\//i;
function isValidHttpUrl(url) {
  return httpUrlRegex.test(url);
}

// Intl.DateTimeFormatをキャッシュ（生成コストが高いため）
const dateTimeFormatters = {
  time: new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }),
  date: new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
};

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

// 現在の実効テーマを取得（auto の場合は OS 設定を反映）
function getEffectiveTheme(mode) {
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}

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
  const newMode = elements.themeSelect.value;
  const oldMode = getCache(CACHE_CONFIG.theme)?.mode || 'auto';

  // 実効テーマが変わる場合のみアニメーション
  const oldEffective = getEffectiveTheme(oldMode);
  const newEffective = getEffectiveTheme(newMode);

  if (oldEffective !== newEffective) {
    document.body.classList.add('theme-transition');
    setTimeout(() => document.body.classList.remove('theme-transition'), 500);
  }

  applyTheme(newMode);
  setCache(CACHE_CONFIG.theme, { mode: newMode });
}

elements.themeSelect.addEventListener('change', changeTheme);

// ===========================================
// 時計機能（現在時刻ラインの更新も統合）
// ===========================================
let lastDateStr = '';
let lastMinute = -1;
let lastDigits = ['', '', '', '', '', '']; // HH:MM:SS の各桁を保持
let digitElements = null; // DOM要素をキャッシュ
let nowLineTimeElement = null; // 現在時刻ライン要素をキャッシュ
let currentDisplayedEvents = []; // イベント一覧（終了済みチェック用）

// 初回のみDOM構造を構築
function initClockDOM() {
  let html = '';
  for (let i = 0; i < 6; i++) {
    html += `<span class="clock-digit" data-index="${i}"></span>`;
    if (i === 1 || i === 3) {
      html += '<span class="clock-colon">:</span>';
    }
  }
  elements.clockTime.innerHTML = html;
  digitElements = elements.clockTime.querySelectorAll('.clock-digit');
}

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const currentDigits = [hours[0], hours[1], minutes[0], minutes[1], seconds[0], seconds[1]];

  // 変更のある桁のみDOM更新
  for (let i = 0; i < 6; i++) {
    if (currentDigits[i] !== lastDigits[i]) {
      const el = digitElements[i];
      el.textContent = currentDigits[i];
      // アニメーションをリトリガー
      el.classList.remove('flip');
      // 強制リフロー（requestAnimationFrameで次フレームに）
      requestAnimationFrame(() => el.classList.add('flip'));
    }
  }
  lastDigits = currentDigits;

  // 日付は変更時のみ更新
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 (${WEEKDAYS[now.getDay()]})`;
  if (dateStr !== lastDateStr) {
    elements.clockDate.textContent = dateStr;
    lastDateStr = dateStr;
  }

  // 1分ごとに現在時刻ラインを更新（setIntervalを統合）
  const currentMinute = now.getMinutes();
  if (currentMinute !== lastMinute) {
    lastMinute = currentMinute;
    // 要素が見つからない場合のみ再取得（イベント再描画後など）
    if (!nowLineTimeElement || !nowLineTimeElement.isConnected) {
      nowLineTimeElement = document.getElementById('now-line-time');
    }
    if (nowLineTimeElement) {
      nowLineTimeElement.textContent = `${hours}:${minutes}`;
    }
    // 終了したイベントを自動で終了済み表示に更新
    updatePastEvents(now);
  }
}

// 終了したイベントを終了済み表示に更新、進行中のイベントをハイライト
// 最適化: イベント要素をキャッシュして、状態変更があるもののみ更新
let cachedEventElements = [];
let lastEventUpdateTime = 0;

function updatePastEvents(now) {
  // currentDisplayedEventsがまだ初期化されていない場合はスキップ
  if (typeof currentDisplayedEvents === 'undefined' || !currentDisplayedEvents.length) return;

  const nowTime = now.getTime();

  // 最適化: 要素キャッシュが空の場合のみ再取得
  if (cachedEventElements.length === 0) {
    cachedEventElements = Array.from(document.querySelectorAll('.event-item[data-event-index]'));
  }

  // 最適化: 状態が変わる可能性のあるイベントのみチェック
  currentDisplayedEvents.forEach((event, index) => {
    if (!event.end?.dateTime) return; // 終日イベントはスキップ

    const eventStart = event.start.dateTime ? new Date(event.start.dateTime).getTime() : null;
    const eventEnd = new Date(event.end.dateTime).getTime();

    // 最適化: 現在時刻の前後のイベントのみ処理
    if (nowTime < eventStart - 60000 || nowTime > eventEnd + 60000) return;

    const eventEl = cachedEventElements[index];
    if (!eventEl) return;

    if (nowTime >= eventEnd) {
      // イベント終了
      if (!eventEl.classList.contains('event-past')) {
        eventEl.classList.remove('event-current');
        eventEl.classList.add('event-past');
      }
    } else if (eventStart && nowTime >= eventStart && nowTime < eventEnd) {
      // イベント進行中
      if (!eventEl.classList.contains('event-current')) {
        eventEl.classList.add('event-current');
      }
    }
  });
}

initClockDOM();
updateClock();
// OS時刻と常に同期するため、毎回次の秒境界を計算してsetTimeoutで呼び出す
function scheduleNextUpdate() {
  const now = Date.now();
  const delay = 1000 - (now % 1000);
  setTimeout(() => {
    updateClock();
    scheduleNextUpdate();
  }, delay);
}
scheduleNextUpdate();

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
// 天気表示用のDOM要素をキャッシュ
let weatherElements = null;

function initWeatherDOM() {
  elements.weather.textContent = ''; // 既存テキストをクリア
  const fragment = document.createDocumentFragment();
  const icon = document.createElement('span');
  icon.className = 'weather-icon';
  const temp = document.createElement('span');
  temp.className = 'weather-temp';
  const desc = document.createElement('span');
  desc.className = 'weather-desc';
  const location = document.createElement('span');
  location.className = 'weather-location';
  fragment.append(icon, temp, desc, location);
  elements.weather.appendChild(fragment);
  weatherElements = { icon, temp, desc, location };
}

function displayWeather(tempVal, code, locationName) {
  if (!weatherElements) initWeatherDOM();
  const weather = WEATHER_CODES[code] || { icon: '🌡️', desc: '' };
  weatherElements.icon.textContent = weather.icon;
  weatherElements.temp.textContent = `${tempVal}°C`;
  weatherElements.desc.textContent = weather.desc;
  if (locationName) {
    weatherElements.location.textContent = locationName;
    weatherElements.location.style.display = '';
  } else {
    weatherElements.location.style.display = 'none';
  }
}

// fetchWithTimeoutヘルパー - APIリクエストにタイムアウトを設定
async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWeather() {
  const cache = getCache(CACHE_CONFIG.weather);
  if (cache) {
    displayWeather(cache.temp, cache.code, cache.locationName);
    return;
  }

  elements.weather.textContent = '天気を取得中...';

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,      // 10秒から5秒に短縮
        maximumAge: 600000  // 10分間は位置情報をキャッシュ
      });
    });

    const { latitude, longitude } = position.coords;

    // APIリクエストに5秒のタイムアウトを設定
    const [weatherResponse, geoResponse] = await Promise.all([
      fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`, 5000),
      fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`, 5000).catch(() => null)
    ]);

    const data = await weatherResponse.json();
    let locationName = '';

    // 地名取得は失敗しても天気は表示する
    if (geoResponse) {
      try {
        const geoData = await geoResponse.json();
        locationName = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.municipality || '';
      } catch (e) {
        console.warn('Geocoding error:', e);
      }
    }

    if (data.current) {
      const temp = Math.round(data.current.temperature_2m);
      const code = data.current.weather_code;
      displayWeather(temp, code, locationName);
      await setCache(CACHE_CONFIG.weather, { temp, code, locationName });
    }
  } catch (error) {
    console.warn('Weather error:', error);
    elements.weather.textContent = '';
    weatherElements = null;
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

  // DocumentFragmentを使用してDOM操作を最適化
  const fragment = document.createDocumentFragment();

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'month-header';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'month-nav';
  prevBtn.id = 'prev-month';
  prevBtn.textContent = '◀';
  const title = document.createElement('span');
  title.className = 'month-title';
  title.textContent = `${year}年 ${monthNames[month]}`;
  const nextBtn = document.createElement('button');
  nextBtn.className = 'month-nav';
  nextBtn.id = 'next-month';
  nextBtn.textContent = '▶';
  header.append(prevBtn, title, nextBtn);
  fragment.appendChild(header);

  // 曜日ヘッダー
  const weekdays = document.createElement('div');
  weekdays.className = 'weekdays';
  WEEKDAYS.forEach((day, i) => {
    const weekday = document.createElement('div');
    weekday.className = 'weekday' + (i === 0 ? ' sunday' : i === 6 ? ' saturday' : '');
    weekday.textContent = day;
    weekdays.appendChild(weekday);
  });
  fragment.appendChild(weekdays);

  // 日付グリッド
  const daysContainer = document.createElement('div');
  daysContainer.className = 'days';

  // 日付要素を作成するヘルパー関数
  const createDayElement = (dayNum, dateStr, cls, title) => {
    const dayEl = document.createElement('div');
    dayEl.className = cls;
    dayEl.dataset.date = dateStr;
    dayEl.textContent = dayNum;
    if (title) dayEl.title = title;
    return dayEl;
  };

  // 前月の日付
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonthNum = month === 0 ? 11 : month - 1;
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const dayOfWeek = (startDayOfWeek - i - 1 + 7) % 7;
    let cls = 'day other-month clickable';
    if (dayOfWeek === 0 || isHoliday(prevYear, prevMonthNum, dayNum)) cls += ' sunday';
    else if (dayOfWeek === 6) cls += ' saturday';
    daysContainer.appendChild(createDayElement(dayNum, formatDateStr(prevYear, prevMonthNum, dayNum), cls));
  }

  // 当月の日付
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dayOfWeek = new Date(year, month, day).getDay();
    const holidayName = getHolidayName(year, month, day);
    let cls = 'day clickable';
    if (dayOfWeek === 0 || holidayName) cls += ' sunday';
    else if (dayOfWeek === 6) cls += ' saturday';
    if (year === todayYear && month === todayMonth && day === todayDate) cls += ' today';
    daysContainer.appendChild(createDayElement(day, formatDateStr(year, month, day), cls, holidayName));
  }

  // 次月の日付
  const totalCells = startDayOfWeek + lastDay.getDate();
  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonthNum = month === 11 ? 0 : month + 1;
  for (let day = 1; day <= remainingCells; day++) {
    const dayOfWeek = (totalCells + day - 1) % 7;
    let cls = 'day other-month clickable';
    if (dayOfWeek === 0 || isHoliday(nextYear, nextMonthNum, day)) cls += ' sunday';
    else if (dayOfWeek === 6) cls += ' saturday';
    daysContainer.appendChild(createDayElement(day, formatDateStr(nextYear, nextMonthNum, day), cls));
  }

  fragment.appendChild(daysContainer);

  // 今日に戻るボタン
  const todayBtnWrapper = document.createElement('div');
  todayBtnWrapper.className = 'today-btn-wrapper';
  const todayBtn = document.createElement('button');
  todayBtn.className = 'today-btn';
  todayBtn.id = 'go-today';
  todayBtn.textContent = '今日に戻る';
  todayBtnWrapper.appendChild(todayBtn);
  fragment.appendChild(todayBtnWrapper);

  // 一度のDOM操作で反映
  elements.monthCalendar.replaceChildren(fragment);
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
    // 今日の日付をクリックした場合は「今日に戻る」と同じ動作
    if (dayEl.classList.contains('today')) {
      currentMonth = new Date();
      renderMonthCalendar();
      refreshTodayTomorrowEvents();
    } else {
      showDayEvents(dayEl.dataset.date);
    }
  }
});

// ===========================================
// Googleカレンダー機能
// ===========================================
let cachedToken = null;
let cachedCalendars = null;

async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

// トークンを無効化して再取得
async function refreshAuthToken() {
  if (cachedToken) {
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token: cachedToken }, resolve);
    });
  }
  cachedToken = await getAuthToken(true);
  return cachedToken;
}

// すべてのカレンダーを取得（選択済みのカレンダーのみ）
function filterOwnedCalendars(calendars) {
  return calendars.filter(cal => cal.selected !== false);
}

async function fetchCalendarList(retried = false) {
  const cache = getCache(CACHE_CONFIG.calendarList);
  if (cache?.data) {
    // キャッシュからもフィルタを適用（古いキャッシュ対応）
    return filterOwnedCalendars(cache.data);
  }

  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${cachedToken}` } }
    );

    // 401エラーの場合、トークンを再取得してリトライ
    if (response.status === 401 && !retried) {
      await refreshAuthToken();
      return fetchCalendarList(true);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'カレンダー一覧の取得に失敗しました');
    }

    // 所有者が自分のカレンダーのみをフィルタ
    const calendars = filterOwnedCalendars(data.items || []);
    await setCache(CACHE_CONFIG.calendarList, { data: calendars });
    return calendars;
  } catch (e) {
    // ネットワークエラーの場合、リトライ
    if (!retried && e.message === 'Failed to fetch') {
      await refreshAuthToken();
      return fetchCalendarList(true);
    }
    throw e;
  }
}

// 最適化: リトライ時は失敗したカレンダーのみ再取得
async function fetchEventsFromCalendars(params, retried = false, failedIndices = null) {
  const calendarsToFetch = failedIndices
    ? failedIndices.map(i => ({ calendar: cachedCalendars[i], index: i }))
    : cachedCalendars.map((calendar, index) => ({ calendar, index }));

  const eventPromises = calendarsToFetch.map(async ({ calendar, index }) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
        { headers: { Authorization: `Bearer ${cachedToken}` } }
      );

      // 401エラーの場合、トークンを再取得してリトライ
      if (response.status === 401 && !retried) {
        return { success: false, index, retry: true };
      }

      const data = await response.json();

      if (response.ok && data.items) {
        return {
          success: true,
          index,
          events: data.items.map(event => ({
            ...event,
            calendarColor: calendar.backgroundColor || '#4285f4',
            calendarName: calendar.summary || ''
          }))
        };
      }
      return { success: true, index, events: [] };
    } catch (e) {
      console.warn('Failed to fetch events:', e);
      return { success: false, index, retry: !retried };
    }
  });

  const results = await Promise.all(eventPromises);

  // リトライが必要なカレンダーを特定
  const needsRetry = results.filter(r => r.retry);
  if (needsRetry.length > 0 && !retried) {
    await refreshAuthToken();
    const retryIndices = needsRetry.map(r => r.index);
    const retryResults = await fetchEventsFromCalendars(params, true, retryIndices);

    // 成功した結果とリトライ結果をマージ
    const successResults = results.filter(r => r.success);
    return sortEventsByTime([...successResults, ...retryResults].flatMap(r => r.events || []));
  }

  return sortEventsByTime(results.filter(r => r.success).flatMap(r => r.events || []));
}

function createEventParams(startOfDay, endOfDay) {
  return new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
    fields: 'items(id,summary,start,end,location,description,conferenceData)'
  });
}

// カレンダーイベント表示用のヘルパー関数
function setCalendarMessage(message, className = '') {
  const div = document.createElement('div');
  div.className = className || 'calendar-loading';
  div.textContent = message;
  elements.calendarEvents.replaceChildren(div);
}

async function fetchCalendarEvents() {
  const cache = getCache(CACHE_CONFIG.events);
  if (cache) {
    displayEvents(cache.events, new Date(cache.startOfDay));
  } else {
    setCalendarMessage('カレンダーを読み込み中...');
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
      setCalendarMessage(`エラー: ${error.message}`, 'calendar-error');
    }
  }
}

function displayEvents(events, startOfDay) {
  if (events.length === 0) {
    setCalendarMessage('予定はありません', 'no-events');
    currentDisplayedEvents = [];
    cachedEventElements = []; // キャッシュクリア
    return;
  }

  const now = new Date();
  const todayStart = startOfDay.getTime();
  const tomorrowStart = todayStart + MS_PER_DAY;
  const dayAfterTomorrowStart = tomorrowStart + MS_PER_DAY;
  const isToday = now.getTime() >= todayStart && now.getTime() < tomorrowStart;

  const todayEvents = [];
  const tomorrowEvents = [];

  events.forEach(event => {
    const eventTime = new Date(event.start.dateTime || event.start.date).getTime();
    if (eventTime >= todayStart && eventTime < tomorrowStart) todayEvents.push(event);
    else if (eventTime >= tomorrowStart && eventTime < dayAfterTomorrowStart) tomorrowEvents.push(event);
  });

  // イベントをインデックス付きで保持
  currentDisplayedEvents = [...todayEvents, ...tomorrowEvents];

  let html = '';
  let eventIndex = 0;

  // 今日のセクション
  html += `<div class="date-section"><div class="date-header">今日</div>`;
  if (todayEvents.length > 0) {
    html += renderEventsWithNowLine(todayEvents, isToday ? now : null, eventIndex);
    eventIndex += todayEvents.length;
  } else {
    html += '<div class="no-events">予定はありません</div>';
  }
  html += '</div>';

  // 明日のセクション
  html += `<div class="date-section"><div class="date-header">明日</div>`;
  if (tomorrowEvents.length > 0) {
    html += tomorrowEvents.map((e, i) => renderEvent(e, false, false, eventIndex + i)).join('');
  } else {
    html += '<div class="no-events">予定はありません</div>';
  }
  html += '</div>';

  elements.calendarEvents.innerHTML = html;
  cachedEventElements = []; // 新しいDOM要素なのでキャッシュクリア
}

// 現在時刻のラインを含めてイベントを描画
function renderEventsWithNowLine(events, now, startIndex = 0) {
  if (!now) {
    return events.map((e, i) => renderEvent(e, false, false, startIndex + i)).join('');
  }

  let html = '';
  let nowLineInserted = false;
  const nowTime = now.getTime();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventEnd = event.end?.dateTime ? new Date(event.end.dateTime).getTime() : null;
    const eventStart = event.start.dateTime ? new Date(event.start.dateTime).getTime() : null;

    // 終日イベントはスキップ（現在時刻ラインの判定対象外）
    if (!eventStart) {
      html += renderEvent(event, false, false, startIndex + i);
      continue;
    }

    // 現在時刻がこのイベントの終了後より前で、まだラインを挿入していない場合
    if (!nowLineInserted && eventEnd && nowTime < eventEnd) {
      // 現在時刻がイベント開始前なら、イベントの前にラインを挿入
      if (nowTime < eventStart) {
        html += renderNowLine();
        nowLineInserted = true;
        html += renderEvent(event, false, false, startIndex + i);
      } else {
        // 現在時刻がイベント中 - 現在進行中のイベントとしてマーク
        const isCurrent = nowTime >= eventStart && nowTime < eventEnd;
        html += renderEvent(event, false, isCurrent, startIndex + i);
        // イベントの後にラインを挿入
        if (isCurrent) {
          html += renderNowLine();
          nowLineInserted = true;
        }
      }
    } else if (!nowLineInserted && eventEnd && nowTime >= eventEnd) {
      // このイベントは既に終了 - 過去のイベントとしてマーク
      html += renderEvent(event, true, false, startIndex + i);
    } else {
      html += renderEvent(event, false, false, startIndex + i);
    }
  }

  // 全イベントが終了している場合、最後にラインを挿入
  if (!nowLineInserted) {
    html += renderNowLine();
  }

  return html;
}

function renderNowLine() {
  const nowTimeStr = dateTimeFormatters.time.format(new Date());
  return `<div class="now-line"><span class="now-line-time" id="now-line-time">${nowTimeStr}</span><span class="now-line-bar"></span></div>`;
}

function renderEvent(event, isPast = false, isCurrent = false, index = 0) {
  const startTime = formatEventTime(event.start);
  const color = isValidColor(event.calendarColor) ? event.calendarColor : DEFAULT_COLOR;
  let statusClass = '';
  if (isPast) statusClass = ' event-past';
  else if (isCurrent) statusClass = ' event-current';
  return `
    <div class="event-item${statusClass}" data-event-index="${index}">
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
    return dateTimeFormatters.time.format(new Date(start.dateTime));
  }
  return '終日';
}

function formatEventDateTime(start, end) {
  if (start.dateTime) {
    const startDate = new Date(start.dateTime);
    const dateStr = dateTimeFormatters.date.format(startDate);
    const startTimeStr = dateTimeFormatters.time.format(startDate);

    if (end?.dateTime) {
      const endTimeStr = dateTimeFormatters.time.format(new Date(end.dateTime));
      return `${dateStr} ${startTimeStr} - ${endTimeStr}`;
    }
    return `${dateStr} ${startTimeStr}`;
  }

  return dateTimeFormatters.date.format(new Date(start.date)) + ' (終日)';
}

async function showDayEvents(dateStr) {
  if (!cachedToken || !cachedCalendars) return;

  const targetDate = new Date(dateStr);
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

  setCalendarMessage('読み込み中...');

  const allEvents = await fetchEventsFromCalendars(createEventParams(startOfDay, endOfDay));
  const dateLabel = dateTimeFormatters.date.format(targetDate);

  // イベントデリゲーション用にイベントを保持
  currentDisplayedEvents = allEvents;

  let html = `<div class="date-section"><div class="date-header">${dateLabel}</div>`;
  html += allEvents.length === 0
    ? '<div class="no-events">予定はありません</div>'
    : allEvents.map((e, i) => renderEvent(e, false, false, i)).join('');
  html += '</div>';

  elements.calendarEvents.innerHTML = html;
}

async function refreshTodayTomorrowEvents() {
  if (!cachedToken || !cachedCalendars) {
    fetchCalendarEvents();
    return;
  }

  setCalendarMessage('読み込み中...');

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

  const allEvents = await fetchEventsFromCalendars(createEventParams(startOfDay, endOfTomorrow));
  displayEvents(allEvents, startOfDay);
}

// ===========================================
// モーダル機能
// ===========================================

// 許可するHTMLタグとその属性（ホワイトリスト方式）
const ALLOWED_TAGS = {
  'a': ['href', 'target', 'rel'],
  'b': [],
  'strong': [],
  'i': [],
  'em': [],
  'u': [],
  'br': [],
  'p': [],
  'ul': [],
  'ol': [],
  'li': [],
  'span': [],
  'div': []
};

// 安全なURLスキームかチェック
const safeUrlRegex = /^(https?:\/\/|mailto:)/i;
function isSafeUrl(url) {
  if (!url) return false;
  // http, https, mailto のみ許可（javascript:, data: 等を防止）
  return safeUrlRegex.test(url);
}

// HTMLをサニタイズする関数（ホワイトリスト方式）
function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  function sanitizeNode(node) {
    const fragment = document.createDocumentFragment();

    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        fragment.appendChild(document.createTextNode(child.textContent));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();

        if (ALLOWED_TAGS.hasOwnProperty(tagName)) {
          // aタグでhrefが安全でない場合はリンクを解除してテキストのみ残す
          if (tagName === 'a') {
            const href = child.getAttribute('href');
            if (!isSafeUrl(href)) {
              fragment.appendChild(sanitizeNode(child));
              continue;
            }
          }

          const el = document.createElement(tagName);
          const allowedAttrs = ALLOWED_TAGS[tagName];

          for (const attr of allowedAttrs) {
            if (child.hasAttribute(attr)) {
              const value = child.getAttribute(attr);
              if (attr === 'href' && !isSafeUrl(value)) continue;
              el.setAttribute(attr, value);
            }
          }

          // aタグには安全な属性を強制付与
          if (tagName === 'a') {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }

          el.appendChild(sanitizeNode(child));
          fragment.appendChild(el);
        } else {
          // 許可されていないタグは中身だけ取り出す
          fragment.appendChild(sanitizeNode(child));
        }
      }
    }
    return fragment;
  }

  const container = document.createElement('div');
  container.appendChild(sanitizeNode(doc.body));
  return container.innerHTML;
}

// テキスト処理パターン
const descriptionPatterns = {
  url: /(https?:\/\/[^\s<>&]+)/g,
  bracketLink: /([^\n<>]*?)\s*<((?:https?:\/\/|tel:)[^>]+)>/g,
  htmlTag: /<[a-z][\s\S]*>/i,
  httpProtocol: /^https?:\/\//i,
  telProtocol: /^tel:/i,
  linkPlaceholder: /\{\{LINK:(.+?)::(https?:\/\/[^}]+)\}\}/g,
  telPlaceholder: /\{\{TEL:(.+?)::(tel:[^}]+)\}\}/g
};

function linkifyUrls(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(descriptionPatterns.url, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function processDescription(description) {
  if (!description) return '';

  const { bracketLink, httpProtocol, telProtocol, htmlTag, linkPlaceholder, telPlaceholder } = descriptionPatterns;

  // テキスト部分をリンクテキストとして使用
  let processed = description.replace(bracketLink, (_, text, url) => {
    const hasLeadingPipe = text.trim().startsWith('|');
    const cleanText = text.trim().replace(/^[\s|]+/, '').trim();
    const prefix = hasLeadingPipe ? ' | ' : '';

    if (httpProtocol.test(url)) {
      return `${prefix}{{LINK:${cleanText || 'リンク'}::${url}}} `;
    }
    if (telProtocol.test(url)) {
      return `${prefix}{{TEL:${cleanText || '電話'}::${url}}} `;
    }
    return cleanText || '';
  });

  // HTMLタグが含まれているかチェック
  processed = htmlTag.test(processed) ? sanitizeHtml(processed) : escapeHtml(processed);

  // プレースホルダーを実際のリンクに変換
  return processed
    .replace(linkPlaceholder, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(telPlaceholder, '<a href="$2">$1</a>');
}

// 会議URLを取得する関数
function getConferenceUrl(event) {
  if (!event.conferenceData?.entryPoints) return null;
  const videoEntry = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
  return videoEntry?.uri || null;
}

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

  // 会議URL
  const conferenceUrl = getConferenceUrl(event);
  if (conferenceUrl) {
    html += `<div class="modal-row"><span class="modal-icon">🎥</span><a href="${escapeHtml(conferenceUrl)}" target="_blank" rel="noopener noreferrer">会議に参加</a></div>`;
  }

  if (event.location) {
    html += `<div class="modal-row"><span class="modal-icon">📍</span><span>${linkifyUrls(event.location)}</span></div>`;
  }
  if (event.description) {
    html += `<div class="modal-row"><span class="modal-icon">📝</span><span class="modal-description">${processDescription(event.description)}</span></div>`;
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
// 最適化: Escapeキーイベントは頻繁に発火しないのでpassiveは不要だが、早期リターンで最適化
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (elements.eventModal.classList.contains('show')) {
      hideEventModal();
    } else if (elements.shortcutModal.classList.contains('show')) {
      hideShortcutModal();
    }
  }
});

// イベントデリゲーション - イベント一覧のクリック処理を一括で行う
elements.calendarEvents.addEventListener('click', (e) => {
  const eventItem = e.target.closest('.event-item');
  if (eventItem && eventItem.dataset.eventIndex !== undefined) {
    const index = parseInt(eventItem.dataset.eventIndex, 10);
    if (currentDisplayedEvents[index]) {
      showEventModal(currentDisplayedEvents[index]);
    }
  }
});

// ===========================================
// ショートカット機能
// ===========================================
const MAX_SHORTCUTS = 15;
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

// 最適化: 差分更新でDOM操作を最小化
let lastShortcutsState = [];

function renderShortcuts() {
  // 最適化: 状態が変わっていない場合はスキップ
  const currentState = JSON.stringify(shortcuts);
  if (currentState === JSON.stringify(lastShortcutsState) && elements.shortcuts.children.length > 0) {
    return;
  }
  lastShortcutsState = [...shortcuts];

  // DocumentFragmentを使用してDOM操作を最適化
  const fragment = document.createDocumentFragment();

  shortcuts.forEach((shortcut, index) => {
    const item = document.createElement('div');
    item.className = 'shortcut-item';
    item.dataset.index = index;
    item.dataset.url = shortcut.url;

    const icon = document.createElement('div');
    icon.className = 'shortcut-icon';

    const faviconUrl = getFaviconUrl(shortcut.url);
    if (faviconUrl) {
      const img = document.createElement('img');
      img.src = faviconUrl;
      img.alt = '';
      img.onerror = function () {
        this.style.display = 'none';
        this.nextElementSibling.style.display = 'block';
      };
      icon.appendChild(img);
    }

    const placeholder = document.createElement('span');
    placeholder.className = 'shortcut-icon-placeholder';
    if (faviconUrl) placeholder.style.display = 'none';
    placeholder.textContent = getInitial(shortcut.title);
    icon.appendChild(placeholder);

    const title = document.createElement('span');
    title.className = 'shortcut-title';
    title.textContent = shortcut.title;

    item.appendChild(icon);
    item.appendChild(title);
    fragment.appendChild(item);
  });

  // 上限未満の場合のみ追加ボタンを表示
  if (shortcuts.length < MAX_SHORTCUTS) {
    const addItem = document.createElement('div');
    addItem.className = 'shortcut-item shortcut-add';
    addItem.dataset.action = 'add';

    const addIcon = document.createElement('div');
    addIcon.className = 'shortcut-icon';
    const addIconSpan = document.createElement('span');
    addIconSpan.className = 'shortcut-add-icon';
    addIconSpan.textContent = '+';
    addIcon.appendChild(addIconSpan);

    const addTitle = document.createElement('span');
    addTitle.className = 'shortcut-title';
    addTitle.textContent = '追加';

    addItem.appendChild(addIcon);
    addItem.appendChild(addTitle);
    fragment.appendChild(addItem);
  }

  elements.shortcuts.replaceChildren(fragment);
}

// イベント委譲でショートカットのクリック処理を一括で行う
elements.shortcuts.addEventListener('click', (e) => {
  const item = e.target.closest('.shortcut-item');
  if (!item) return;

  // 追加ボタン
  if (item.dataset.action === 'add') {
    openShortcutModal(-1);
    return;
  }

  // 既存ショートカット
  if (item.dataset.index !== undefined) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      openShortcutModal(parseInt(item.dataset.index));
    } else {
      const url = item.dataset.url;
      if (isValidHttpUrl(url)) {
        window.location.href = url;
      }
    }
  }
});

elements.shortcuts.addEventListener('contextmenu', (e) => {
  const item = e.target.closest('.shortcut-item[data-index]');
  if (item) {
    e.preventDefault();
    openShortcutModal(parseInt(item.dataset.index));
  }
});

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
// 最適化: キャッシュ読み込みと並行して即座に実行可能な処理を開始
loadTheme(); // キャッシュ不要なので即座に実行

// 最適化: すべての初期化を並列実行
Promise.all([
  loadAllCache().then(() => {
    loadShortcuts();
  }),
  fetchWeather(),
  fetchHolidays().then(renderMonthCalendar),
  loadAllCache().then(fetchCalendarEvents)
]).catch(err => {
  console.error('Initialization error:', err);
});

// カレンダーの定期自動更新
setInterval(() => {
  refreshTodayTomorrowEvents();
}, CALENDAR_REFRESH_INTERVAL);
