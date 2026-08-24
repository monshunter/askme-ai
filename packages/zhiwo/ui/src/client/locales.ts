/** `zhiwo` namespace dictionaries for the thin product overlay. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'brand.name': '知我AI',
  'brand.github': '在 GitHub 查看知我AI',
  'hero.greeting': '你好，欢迎来了解我',
  'history.aria': '历史会话',
  'history.heading': '历史会话',
  'session.new': '新会话',
  'session.running': '进行中',
  'session.delete.label': '删除“{title}”',
  'session.delete.title': '删除会话？',
  'session.delete.description': '“{title}”的会话记录将被永久删除，无法恢复。',
  'session.delete.close': '关闭删除确认',
  'session.delete.cancel': '取消',
  'session.delete.confirm': '删除',
  'session.delete.pending': '正在删除…',
  'session.delete.error': '删除失败，请重试。',
  'language.label': '语言',
  'language.switch': '切换为{language}',
  'questions.welcome.aria': '推荐问题',
  'questions.welcome.heading': '可以这样了解我',
  'questions.followup.aria': '后续推荐问题',
  'questions.followup.heading': '还可以继续问',
  'questions.expand': '展开推荐问题',
  'questions.collapse': '收起推荐问题',
  'questions.refresh': '换一组',
  'questions.refreshing': '正在更新',
  'questions.loading': '正在准备可提问的问题…',
  'questions.error': '问题更新失败，已保留上一组。',
  'questions.retry': '重试',
  'placeholder.message': '问问我的经历、项目、能力或计划',
  'document.close': '关闭文档预览',
  'document.loading': '正在加载文档…',
  'document.error': '无法加载这份文档。',
  'document.retry': '重试',
  'document.copy': '复制',
  'document.copied': '复制成功',
  'document.image': '图片：{name}',
  'document.pdf': 'PDF：{name}',
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
  'brand.github': 'View AskmeAI on GitHub',
  'hero.greeting': 'Hi, get to know me here',
  'history.aria': 'Session history',
  'history.heading': 'History',
  'session.new': 'New Session',
  'session.running': 'Running',
  'session.delete.label': 'Delete “{title}”',
  'session.delete.title': 'Delete session?',
  'session.delete.description': 'The session history for “{title}” will be permanently deleted and cannot be recovered.',
  'session.delete.close': 'Close delete confirmation',
  'session.delete.cancel': 'Cancel',
  'session.delete.confirm': 'Delete',
  'session.delete.pending': 'Deleting…',
  'session.delete.error': 'Deletion failed. Try again.',
  'language.label': 'Language',
  'language.switch': 'Switch to {language}',
  'questions.welcome.aria': 'Suggested questions',
  'questions.welcome.heading': 'Ways to get to know me',
  'questions.followup.aria': 'Suggested follow-up questions',
  'questions.followup.heading': 'Keep asking',
  'questions.expand': 'Expand suggested questions',
  'questions.collapse': 'Collapse suggested questions',
  'questions.refresh': 'Refresh',
  'questions.refreshing': 'Refreshing',
  'questions.loading': 'Preparing questions you can ask…',
  'questions.error': 'Question update failed. The previous set is still available.',
  'questions.retry': 'Retry',
  'placeholder.message': 'Ask about my experience, projects, strengths, or plans',
  'document.close': 'Close document preview',
  'document.loading': 'Loading document…',
  'document.error': 'This document could not be loaded.',
  'document.retry': 'Retry',
  'document.copy': 'Copy',
  'document.copied': 'Copied',
  'document.image': 'Image: {name}',
  'document.pdf': 'PDF: {name}',
} satisfies Record<ZhiwoKey, string>
