/** AskmeAI greeting for the native blank-session hero. */

import type { HeroHeadlineOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ZhiwoBrandMark } from './Brand.tsx'
import type {} from './locales.ts'

/** Props for the localized AskmeAI greeting. */
export type ZhiwoGreetingProps =
  PropsRuntime<'conversation.hero.headline'> & HeroHeadlineOwnerProps & PropsLocale<'zhiwo'>

/** Render the complete localized brand introduction used by the blank Session. */
export function ZhiwoIntroduction({ className, placement = 'slot', t }: ZhiwoGreetingProps & {
  readonly placement?: 'slot' | 'dock'
}) {
  return (
    <span
      className={className}
      data-zhiwo-greeting={placement === 'slot' || undefined}
      data-zhiwo-welcome-intro={placement === 'dock' || undefined}
    >
      <span data-zhiwo-hero-brand>
        <ZhiwoBrandMark size={48} />
        <span data-zhiwo-hero-brand-name>{t('brand.name')}</span>
      </span>
      <span data-zhiwo-hero-title>{t('hero.greeting')}</span>
      <svg data-zhiwo-ornament viewBox="0 0 184 18" aria-hidden>
        <path d="M0 9h65M119 9h65" />
        <path d="M80.5 9c2.8-5.3 7.6-5.3 9.8-.9 1.7-7.3 9.8-7.3 11.5-.1 3.2-3.8 8.4-2.4 8.4 2.1 0 3.1-2.7 5-6.3 5H79.8c-5.9 0-7.8-6.1-3.4-9.1 1.6-1.1 3.3-.7 4.1 3Z" />
        <circle cx="88" cy="11" r="1.4" />
        <circle cx="98" cy="11" r="1.4" />
      </svg>
    </span>
  )
}

/** Suppress the native hero row; the input-dock owns the complete Zhiwo introduction. */
export function ZhiwoGreeting() {
  return <span hidden data-zhiwo-native-hero-hidden />
}

/** Occupy the native hero-brand slot without rendering a second brand mark. */
export function ZhiwoHeroMarkPlaceholder() {
  return <span hidden data-zhiwo-native-hero-brand-hidden />
}
