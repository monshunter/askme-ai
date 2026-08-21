/** AskmeAI greeting for the native blank-session hero. */

import type { HeroHeadlineOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'

/** Props for the localized AskmeAI greeting. */
export type ZhiwoGreetingProps =
  PropsRuntime<'conversation.hero.headline'> & HeroHeadlineOwnerProps & PropsLocale<'zhiwo'>

/** Replace the generic preview headline with the localized AskmeAI greeting. */
export function ZhiwoGreeting({ className, t }: ZhiwoGreetingProps) {
  return <span className={className}>{t('hero.greeting')}</span>
}
