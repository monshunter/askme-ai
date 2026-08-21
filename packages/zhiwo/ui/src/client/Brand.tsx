import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'

type ZhiwoBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps
type ZhiwoBrandNameProps = PropsRuntime<'sidebar.brand.name'> & PropsLocale<'zhiwo'>

/**
 * Render the compact Zhiwo mark at the size requested by its host surface.
 * @param props - Host-supplied size and class.
 * @returns The Zhiwo mark.
 */
export function ZhiwoBrandMark({ size, className }: ZhiwoBrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <text x="16" y="22" textAnchor="middle" fontSize="18" fontWeight="700" fill="white">知</text>
    </svg>
  )
}

/**
 * Render the localized product name without repeating its mark.
 * @param props - Localized sidebar brand props.
 * @returns The Zhiwo wordmark.
 */
export function ZhiwoBrandName({ t }: ZhiwoBrandNameProps) {
  return <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.04em' }}>{t('brand.name')}</span>
}
