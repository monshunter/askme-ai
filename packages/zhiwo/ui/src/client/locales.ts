/** `zhiwo` namespace dictionaries for the thin product overlay. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'brand.name': '知我AI',
  'hero.greeting': '你好，我是知我AI',
  'history.aria': '历史会话',
  'history.heading': '历史会话',
  'session.new': '新会话',
  'session.running': '进行中',
  'language.label': '语言',
  'language.switch': '切换为{language}',
} satisfies Record<string, string>

/** The Zhiwo namespace key union. */
export type ZhiwoKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Zhiwo brand, language action, and flat Session history copy. */
    zhiwo: ZhiwoKey
  }
}

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  'brand.name': 'AskmeAI',
  'hero.greeting': "Hello, I'm AskmeAI",
  'history.aria': 'Session history',
  'history.heading': 'History',
  'session.new': 'New Session',
  'session.running': 'Running',
  'language.label': 'Language',
  'language.switch': 'Switch to {language}',
} satisfies Record<ZhiwoKey, string>
