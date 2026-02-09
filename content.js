(function () {
  const MARKED_ATTR = "data-bot-detector-marked";
  const SUSPICIOUS_CLASS = "bot-detector-suspicious";
  const DEBUG = false;

  // Хранилище активности пользователей: ник -> массив временных меток сообщений
  const userActivity = new Map();
  
  // Параметры для детекции накрутки активности
  const ACTIVITY_CONFIG = {
    maxMessagesPer30Sec: 5,    // Максимум сообщений за 30 секунд
    maxMessagesPerMinute: 10,   // Максимум сообщений за минуту
    minIntervalBetweenMessages: 1000, // Минимальный интервал между сообщениями (1 секунда)
    cleanupInterval: 60000      // Очистка старых записей каждую минуту
  };

  function log(...args) {
    if (DEBUG) console.log("[BotDetector]", ...args);
  }

  // Очистка старых записей активности (старше 2 минут)
  function cleanupActivity() {
    const now = Date.now();
    const maxAge = 120000; // 2 минуты
    
    for (const [nick, timestamps] of userActivity.entries()) {
      const filtered = timestamps.filter(ts => now - ts < maxAge);
      if (filtered.length === 0) {
        userActivity.delete(nick);
      } else {
        userActivity.set(nick, filtered);
      }
    }
  }

  // Проверка на подозрительную активность (накрутку)
  function checkActivitySpam(nick) {
    if (!nick || nick.length < 2) return false;
    
    const now = Date.now();
    const timestamps = userActivity.get(nick) || [];
    
    // Добавляем текущее сообщение
    timestamps.push(now);
    userActivity.set(nick, timestamps);
    
    // Фильтруем сообщения за последние 30 секунд и минуту
    const last30Sec = timestamps.filter(ts => now - ts < 30000);
    const lastMinute = timestamps.filter(ts => now - ts < 60000);
    
    // Проверяем количество сообщений
    if (last30Sec.length > ACTIVITY_CONFIG.maxMessagesPer30Sec) {
      log(`Activity spam detected (30s): ${nick} - ${last30Sec.length} messages`);
      return true;
    }
    
    if (lastMinute.length > ACTIVITY_CONFIG.maxMessagesPerMinute) {
      log(`Activity spam detected (1min): ${nick} - ${lastMinute.length} messages`);
      return true;
    }
    
    // Проверяем интервал между последними сообщениями
    if (timestamps.length >= 2) {
      const lastTwo = timestamps.slice(-2);
      const interval = lastTwo[1] - lastTwo[0];
      if (interval < ACTIVITY_CONFIG.minIntervalBetweenMessages) {
        log(`Activity spam detected (interval): ${nick} - ${interval}ms between messages`);
        return true;
      }
    }
    
    return false;
  }

  function getChatRoot() {
    const selectors = [
      '[data-a-target="chat-room"]',
      'section[aria-label*="Chat"]',
      '[class*="ChatRoom"]',
      '[class*="chat-shell"]',
      '[class*="chat-container"]',
      '[class*="chat-list"]',
      '#chat-root',
      '[data-test-selector="chat-messages"]',
      'div[class*="chat"]',
      'section[class*="chat"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        log("Chat root found:", selector);
        return el;
      }
    }
    
    log("Chat root not found, using body");
    return document.body;
  }

  function isUserProfileLink(a) {
    try {
      const href = a.getAttribute("href");
      if (!href) return false;
      
      const url = new URL(href, location.origin);
      const path = url.pathname.replace(/^\/|\/$/g, "");
      
      if (path.length === 0) return false;
      if (path.includes("/")) return false;
      if (path === "directory" || path === "settings" || path === "subscriptions" || path === "p") return false;
      
      return true;
    } catch {
      return false;
    }
  }

  function isMarked(el) {
    return el.hasAttribute(MARKED_ATTR);
  }

  function findMessageContainer(el) {
    // Сначала ищем контейнеры 7TV
    const seventvContainer = el.closest('.seventv-message, .seventv-chat-message-container, .seventv-chat-message-background, .seventv-user-message');
    if (seventvContainer) {
      // Для 7TV используем контейнер сообщения или фон
      const background = seventvContainer.closest('.seventv-chat-message-background') || 
                        seventvContainer.closest('.seventv-chat-message-container') ||
                        seventvContainer.closest('.seventv-message');
      return background || seventvContainer;
    }
    
    // Ищем контейнер сообщения по различным селекторам Twitch
    const selectors = [
      '[data-a-target="chat-line-message"]',
      '[class*="chat-line"]',
      '[class*="message"]',
      '[class*="chat-message"]',
      '[class*="message-container"]',
      '[class*="chat-line-message"]',
      'div[class*="Layout-sc"]', // React компоненты Twitch
      'div[class*="ScMessageLayout"]'
    ];
    
    let current = el;
    for (let i = 0; i < 10 && current && current !== document.body; i++) {
      // Проверяем селекторы
      for (const selector of selectors) {
        if (current.matches && current.matches(selector)) {
          return current;
        }
      }
      
      // Проверяем атрибуты
      if (current.hasAttribute && (
        current.hasAttribute('data-a-target') ||
        current.getAttribute('class')?.includes('message') ||
        current.getAttribute('class')?.includes('chat-line')
      )) {
        return current;
      }
      
      current = current.parentElement;
    }
    
    // Если не нашли, возвращаем ближайший div-контейнер
    return el.closest('div[class*="Layout"], div[class*="message"], div[class*="chat"]') || el.parentElement || el;
  }

  function markSuspicious(el) {
    // Находим контейнер сообщения
    const messageContainer = findMessageContainer(el);
    
    if (isMarked(messageContainer)) return;
    
    messageContainer.setAttribute(MARKED_ATTR, "1");
    messageContainer.classList.add(SUSPICIOUS_CLASS);
    
    // Применяем желтый фон ко всему сообщению
    if (messageContainer.style) {
      messageContainer.style.setProperty("background", "rgba(255, 255, 0, 0.3)", "important");
      messageContainer.style.setProperty("border-left", "3px solid rgba(255, 200, 0, 0.8)", "important");
      
      // Для 7TV перекрываем их CSS переменные
      if (messageContainer.classList.contains('seventv-chat-message-background') || 
          messageContainer.classList.contains('seventv-user-message')) {
        messageContainer.style.setProperty("--seventv-highlight-color", "rgba(255, 255, 0, 0.3)", "important");
        messageContainer.style.setProperty("--seventv-highlight-dim-color", "rgba(255, 255, 0, 0.3)", "important");
        messageContainer.style.setProperty("background-color", "rgba(255, 255, 0, 0.3)", "important");
      }
    }
  }

  function extractNickname(el) {
    let nick = "";
    
    // Для 7TV ищем ник в структуре .seventv-chat-user-username
    const seventvUsername = el.closest('.seventv-user-message')?.querySelector('.seventv-chat-user-username span');
    if (seventvUsername) {
      nick = (seventvUsername.textContent || seventvUsername.innerText || "").trim();
      if (nick) return nick;
    }
    
    if (el.tagName === "A") {
      nick = (el.textContent || el.innerText || "").trim();
    } else {
      const link = el.querySelector("a[href^='/'], a[href*='twitch.tv/']");
      if (link) {
        nick = (link.textContent || link.innerText || "").trim();
      } else {
        nick = (el.textContent || el.innerText || "").trim();
      }
    }
    
    if (!nick) {
      const userAttr = el.getAttribute("data-a-user") || el.getAttribute("data-user-id") || el.getAttribute("data-user");
      if (userAttr) nick = userAttr;
    }
    
    return nick;
  }

  function run() {
    if (typeof window.BotDetector === "undefined" || typeof window.BotDetector.isBotNickname !== "function") {
      log("BotDetector not ready, retrying...");
      setTimeout(run, 100);
      return;
    }

    const chatRoot = getChatRoot();
    if (!chatRoot) {
      log("Chat root not found, retrying...");
      setTimeout(run, 500);
      return;
    }

    let markedCount = 0;
    let checkedCount = 0;

    const allLinks = chatRoot.querySelectorAll('a[href]');
    log(`Found ${allLinks.length} links in chat`);

    allLinks.forEach((a) => {
      if (!isUserProfileLink(a)) return;

      const nick = extractNickname(a);
      if (!nick || nick.length < 2) return;

      checkedCount++;
      
      // Проверка на подозрительный ник
      if (window.BotDetector.isBotNickname(nick)) {
        markSuspicious(a);
        markedCount++;
        log(`Marked suspicious (nickname): ${nick}`);
      }
      
      // Проверка на накрутку активности
      if (checkActivitySpam(nick)) {
        markSuspicious(a);
        markedCount++;
        log(`Marked suspicious (activity spam): ${nick}`);
      }
    });

    // Ищем элементы с data-a-user (стандартный Twitch)
    const userElements = chatRoot.querySelectorAll('[data-a-user]');
    log(`Found ${userElements.length} elements with data-a-user`);
    
    userElements.forEach((el) => {
      const nick = el.getAttribute("data-a-user");
      if (!nick || nick.length < 2) return;

      checkedCount++;
      
      // Проверка на подозрительный ник
      if (window.BotDetector.isBotNickname(nick)) {
        markSuspicious(el);
        markedCount++;
        log(`Marked suspicious (nickname, data-a-user): ${nick}`);
      }
      
      // Проверка на накрутку активности
      if (checkActivitySpam(nick)) {
        markSuspicious(el);
        markedCount++;
        log(`Marked suspicious (activity spam, data-a-user): ${nick}`);
      }
    });

    // Ищем элементы 7TV напрямую
    const seventvUsernames = chatRoot.querySelectorAll('.seventv-chat-user-username span');
    log(`Found ${seventvUsernames.length} 7TV username elements`);
    
    seventvUsernames.forEach((usernameEl) => {
      const messageContainer = usernameEl.closest('.seventv-user-message, .seventv-message');
      if (!messageContainer || isMarked(messageContainer)) return;
      
      const nick = (usernameEl.textContent || usernameEl.innerText || "").trim();
      if (!nick || nick.length < 2) return;

      checkedCount++;
      
      // Проверка на подозрительный ник
      if (window.BotDetector.isBotNickname(nick)) {
        markSuspicious(usernameEl);
        markedCount++;
        log(`Marked suspicious (nickname, 7TV): ${nick}`);
      }
      
      // Проверка на накрутку активности
      if (checkActivitySpam(nick)) {
        markSuspicious(usernameEl);
        markedCount++;
        log(`Marked suspicious (activity spam, 7TV): ${nick}`);
      }
    });

    if (markedCount > 0 || checkedCount > 0) {
      log(`Checked ${checkedCount} nicks, marked ${markedCount} as suspicious`);
    }
  }

  function observe() {
    log("Starting observer...");
    run();
    const chatRoot = getChatRoot();
    if (chatRoot && chatRoot !== document.body) {
      const observer = new MutationObserver(function () {
        run();
      });
      observer.observe(chatRoot, { childList: true, subtree: true });
      log("Observer started");
    } else {
      log("Chat root not ready, retrying...");
      setTimeout(observe, 500);
    }
  }

  // Запускаем периодическую очистку старых записей активности
  setInterval(cleanupActivity, ACTIVITY_CONFIG.cleanupInterval);

  log("Bot Detector script loaded");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observe);
  } else {
    setTimeout(observe, 100);
  }
})();
