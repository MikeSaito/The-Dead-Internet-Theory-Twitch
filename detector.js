/**
 * Детектор ников «Мертвого интернета» для анти-бот системы Twitch.
 * Использует строгие регулярные выражения без баллов и вероятностей.
 */

// Предкомпилированные регулярные выражения (производительность). Ослабленный режим.
const PATTERNS = {
  // Цифровой хвост: ник заканчивается на 4+ цифр (опционально после разделителя _.-)
  // Отсекает: User_99827, abc1234 (но пропускает: Oleg123, Bot_99)
  digitalTail: /[a-zA-Z]+[_\-.]?\d{4,}$/,

  // Нечитаемая энтропия: 5+ согласных подряд (признак генераторов случайных строк)
  // Отсекает: przqtx, vlkshdf (но пропускает: dfgh_user)
  unreadableEntropy: /[bcdfghjklmnpqrstvwxz]{5,}/i,

  // Технический ID: чередование [буква][цифра] 3+ раз (хэш/серийный номер)
  // Отсекает: a1b2c3, x9z8w7 (но пропускает: a1b2)
  technicalId: /([a-zA-Z]\d){3,}/,

  // Шаблонный агент: маска Имя_Фамилия_Число (типичный бот-профиль)
  // Отсекает: John_Doe_12, Alex_Black_77
  templateAgent: /^[A-Z][a-z]+_[A-Z][a-z]+_\d+$/,

  // Слово_число: одно слово + подчёркивание + 3+ цифры (бот-аккаунты)
  // Отсекает: Bot_123, User_999 (но пропускает: Bot_12, User_99)
  wordNumber: /^[a-zA-Z]+_\d{3,}$/,
};

/**
 * Проверяет, соответствует ли ник хотя бы одному паттерну «Мертвого интернета».
 * @param {string} nick - Никнейм для проверки
 * @returns {boolean} true, если ник похож на бота
 */
function isBotNickname(nick) {
  if (typeof nick !== "string" || !nick.trim()) return false;
  const s = nick.trim();

  if (PATTERNS.digitalTail.test(s)) return true;
  if (PATTERNS.unreadableEntropy.test(s)) return true;
  if (PATTERNS.technicalId.test(s)) return true;
  if (PATTERNS.templateAgent.test(s)) return true;
  if (PATTERNS.wordNumber.test(s)) return true;

  // Длинный буквенно-цифровой ник с 4+ цифрами (типичный генератор)
  // Только для очень длинных ников (10+ символов)
  if (/^[a-zA-Z0-9_]{10,}$/.test(s)) {
    const digitCount = (s.match(/\d/g) || []).length;
    if (digitCount >= 4) return true;
  }

  return false;
}

// Для content script
if (typeof window !== "undefined") {
  window.BotDetector = { isBotNickname, PATTERNS };
}
