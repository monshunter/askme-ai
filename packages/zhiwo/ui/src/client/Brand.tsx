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
    <img
      src="/assets/zhiwo/logo.png"
      width={size}
      height={size}
      className={className}
      data-zhiwo-brand-mark
      alt=""
      aria-hidden
    />
  )
}

/**
 * Render the localized product name without repeating its mark.
 * @param props - Localized sidebar brand props.
 * @returns The Zhiwo wordmark.
 */
export function ZhiwoBrandName({ t }: ZhiwoBrandNameProps) {
  return <span data-zhiwo-brand-name>{t('brand.name')}</span>
}
