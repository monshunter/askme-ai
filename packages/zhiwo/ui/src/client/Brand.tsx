import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'

type ZhiwoBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps
type ZhiwoBrandNameProps = PropsRuntime<'sidebar.brand.name'> & PropsLocale<'zhiwo'>
type ZhiwoGithubActionProps = PropsRuntime<'sidebar.brand.action'> & PropsLocale<'zhiwo'>

/** Public source repository linked from the expanded Zhiwo sidebar. */
export const ZHIWO_REPOSITORY_URL = 'https://github.com/monshunter/askme-ai'

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

/**
 * Render the independent GitHub link beside the expanded product name.
 * @param props - Localized sidebar action props.
 * @returns A safe external repository link.
 */
export function ZhiwoGithubAction({ t }: ZhiwoGithubActionProps) {
  return (
    <a
      href={ZHIWO_REPOSITORY_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('brand.github')}
      data-zhiwo-github
    >
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.7-1.08-2.7-1.08-.37-.93-.9-1.18-.9-1.18-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.96 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82A7.7 7.7 0 0 1 8 3.72a7.7 7.7 0 0 1 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.08-1.88 3.75-3.66 3.95.29.25.54.74.54 1.5l-.01 2.32c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"
        />
      </svg>
    </a>
  )
}
