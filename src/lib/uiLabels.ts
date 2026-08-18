export const leadStatusLabels = {
  New: "Новый",
  Analyzed: "Проанализирован",
  Contacted: "Связались",
  Replied: "Ответил",
  Interested: "Заинтересован",
  "Not Now": "Не сейчас",
  Client: "Клиент",
  Lost: "Потерян",
  Unsubscribed: "Отписался",
} as const;

export const emailStatusLabels = {
  Draft: "Черновик",
  Approved: "Одобрено",
  Queued: "В очереди",
  Sent: "Отправлено",
  Failed: "Ошибка",
} as const;

export const followUpStatusLabels = {
  Pending: "Ожидает",
  Completed: "Выполнен",
  Skipped: "Пропущен",
} as const;

export const replyIntentLabels = {
  Interested: "Заинтересован",
  "Not Interested": "Не заинтересован",
  "Not Now": "Не сейчас",
  Question: "Вопрос",
  Unsubscribe: "Отписка",
  "Out of Office": "Нет на месте",
  Other: "Другое",
} as const;

export const activityTypeLabels = {
  LeadCreated: "Лид создан",
  LeadAnalyzed: "Лид проанализирован",
  EmailGenerated: "Письмо создано",
  EmailApproved: "Письмо одобрено",
  EmailSent: "Письмо отправлено",
  EmailFailed: "Ошибка отправки",
  ReplyReceived: "Получен ответ",
  FollowUpCreated: "Повторный контакт создан",
  FollowUpCompleted: "Повторный контакт выполнен",
  FollowUpSkipped: "Повторный контакт пропущен",
  StatusChanged: "Статус изменён",
} as const;

export const providerTypeLabels = {
  email: "Почтовый провайдер",
  ai: "ИИ-провайдер",
  SMTP: "SMTP",
  OpenAI: "OpenAI",
  Anthropic: "Anthropic",
} as const;

export const suppressionReasonLabels = {
  ManualBlock: "Добавлен вручную",
  Unsubscribed: "Отписка",
  HardBounce: "Недоставленное письмо",
} as const;

export const campaignStatusLabels = {
  Draft: "Черновик",
  Scheduled: "Запланирована",
  Running: "Запущена",
  Paused: "Приостановлена",
  Completed: "Завершена",
  Stopped: "Остановлена",
} as const;

export const providerStatusLabels = {
  Connected: "Подключён",
  Disconnected: "Не подключён",
  Pending: "Ожидает проверки",
  Verified: "Подтверждён",
  Failed: "Ошибка",
} as const;

export function uiLabel<T extends Record<string, string>>(labels: T, value: string): string {
  return labels[value as keyof T] ?? value;
}
