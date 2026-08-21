/** Visible locale switch for the settings-free Zhiwo sidebar. */

import type { LocaleId, LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from './locales.ts'
import css from './LanguageAction.module.css'

/** Locale state and action supplied by the Zhiwo client plugin. */
export interface ZhiwoLanguageInjected {
  hooks: {
    /** Active locale and the two shipped language labels. */
    locale: ObservableSnapshot<LocaleSnapshot>
  }
  /** Switch the browser UI language. */
  setLocale: (id: LocaleId) => void
}

/** Props for the Zhiwo sidebar language action. */
export type ZhiwoLanguageActionProps =
  PropsRuntime<'sidebar.footer.action'> & InjectFace<ZhiwoLanguageInjected> & PropsLocale<'zhiwo'>

/** Render a one-click Chinese/English switch in the sidebar footer. */
export function ZhiwoLanguageAction({ wide, useLocale, setLocale, t }: ZhiwoLanguageActionProps) {
  const active = useLocale(snapshot => snapshot.active)
  const locales = useLocale(snapshot => snapshot.locales)
  const target: LocaleId = active === 'zh' ? 'en' : 'zh'
  const targetLabel = locales.find(locale => locale.id === target)?.label ?? target
  const label = t('language.switch', { language: targetLabel })

  return (
    <button
      type="button"
      className={css.root}
      data-wide={wide || undefined}
      aria-label={label}
      title={label}
      onClick={() => { setLocale(target) }}
    >
      <span className={css.glyph} aria-hidden>{active === 'zh' ? '中' : 'EN'}</span>
      {wide && <span className={css.label}>{t('language.label')}</span>}
      {wide && <span className={css.target}>{targetLabel}</span>}
    </button>
  )
}
