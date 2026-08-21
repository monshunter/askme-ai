/** Zhiwo's bounded bilingual question catalog and visitor-scoped suggestion endpoint. */

import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { SessionId, type Session, type SessionStore } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  QuestionLocale,
  QuestionRequest,
  QuestionResponse,
  QuestionSuggestion,
} from './types.ts'

export type { QuestionLocale, QuestionRequest, QuestionResponse, QuestionSuggestion } from './types.ts'

/** Internal RPC endpoint owned by the Zhiwo product overlay. */
export const ZHIWO_QUESTIONS_ENDPOINT = 'zhiwo/questions'

interface QuestionPair {
  readonly id: string
  readonly source: 'global' | 'project'
  readonly zh: string
  readonly en: string
  readonly project?: string
}

interface ProjectIdentity {
  readonly match: string
  readonly display: string
}

interface WorkspaceInventory {
  readonly fingerprint: string
  readonly projects: readonly ProjectIdentity[]
}

interface QuestionCache {
  readonly version: 1
  readonly fingerprint: string
  readonly revision: string
  readonly projects: readonly ProjectIdentity[]
  readonly catalog: readonly QuestionPair[]
}

interface GlobalTopic {
  readonly zh: readonly [string, string]
  readonly en: readonly [string, string]
}

interface ProjectTopic {
  readonly zh: readonly [string, string]
  readonly en: readonly [string, string]
}

const GLOBAL_TOPICS: readonly GlobalTopic[] = [
  { zh: ['你最看重的职业原则是什么？', '哪次经历最能体现你的职业原则？'], en: ['Which professional principle matters most to you?', 'Which experience best demonstrates your professional principles?'] },
  { zh: ['你目前最重要的长期目标是什么？', '你正在如何推进自己的长期目标？'], en: ['What is your most important long-term goal?', 'How are you currently advancing your long-term goals?'] },
  { zh: ['你最擅长解决哪类问题？', '什么案例最能证明你的核心能力？'], en: ['What kinds of problems are you best at solving?', 'Which example best demonstrates your core strengths?'] },
  { zh: ['你的职业方向经历过哪些变化？', '哪次选择最影响你现在的职业方向？'], en: ['How has your career direction changed over time?', 'Which decision most influenced your current career direction?'] },
  { zh: ['你理想中的工作方式是什么？', '什么样的协作环境最能发挥你的优势？'], en: ['What is your ideal way of working?', 'What kind of collaborative environment brings out your strengths?'] },
  { zh: ['你最自豪的一项成果是什么？', '你如何衡量一项工作的真正价值？'], en: ['Which achievement are you most proud of?', 'How do you measure the real value of your work?'] },
  { zh: ['你从哪次失败中学到最多？', '一次挫折如何改变了你的做事方式？'], en: ['Which failure taught you the most?', 'How did a setback change the way you work?'] },
  { zh: ['你通常如何学习新领域？', '哪次快速学习最能体现你的方法？'], en: ['How do you usually learn a new field?', 'Which rapid-learning experience best illustrates your approach?'] },
  { zh: ['你做重要决定时最看重什么？', '你如何处理信息不足时的决策？'], en: ['What matters most when you make an important decision?', 'How do you decide when information is incomplete?'] },
  { zh: ['你如何平衡速度与质量？', '哪次经历体现了你对质量的坚持？'], en: ['How do you balance speed and quality?', 'Which experience shows your commitment to quality?'] },
  { zh: ['你最希望别人如何评价你的工作？', '同事通常依赖你的哪项能力？'], en: ['How would you most like others to describe your work?', 'Which of your strengths do colleagues rely on most?'] },
  { zh: ['你最有效的沟通方式是什么？', '你如何向不同背景的人解释复杂问题？'], en: ['What is your most effective communication style?', 'How do you explain complex topics to people with different backgrounds?'] },
  { zh: ['你如何建立和维护信任？', '哪次合作最能说明你的协作方式？'], en: ['How do you build and maintain trust?', 'Which collaboration best illustrates how you work with others?'] },
  { zh: ['你面对冲突时通常怎么处理？', '哪次分歧最终带来了更好的结果？'], en: ['How do you usually handle conflict?', 'Which disagreement ultimately led to a better result?'] },
  { zh: ['你如何安排多项任务的优先级？', '你会因为什么理由放弃一个机会？'], en: ['How do you prioritize competing tasks?', 'What would make you turn down an opportunity?'] },
  { zh: ['什么事情最能激发你的动力？', '什么情况最容易消耗你的精力？'], en: ['What motivates you most?', 'What situations drain your energy most quickly?'] },
  { zh: ['你希望未来一年获得什么成长？', '你下一项最想强化的能力是什么？'], en: ['How do you hope to grow over the next year?', 'Which capability do you most want to strengthen next?'] },
  { zh: ['你如何定义对自己有意义的成功？', '哪些外部标准不会影响你对成功的判断？'], en: ['How do you define meaningful success for yourself?', 'Which external measures do not shape your definition of success?'] },
  { zh: ['你最关注哪些行业或技术趋势？', '哪些变化可能影响你接下来的计划？'], en: ['Which industry or technology trends interest you most?', 'Which changes could affect your next plans?'] },
  { zh: ['你通常如何发现真正的问题？', '哪次追问帮助你找到了问题根因？'], en: ['How do you identify the real problem?', 'When did asking a better question help you find a root cause?'] },
  { zh: ['你如何把模糊想法变成可执行计划？', '你启动一项新计划时会先验证什么？'], en: ['How do you turn a vague idea into an actionable plan?', 'What do you validate first when starting a new initiative?'] },
  { zh: ['你最重视用户或客户的哪类反馈？', '哪次反馈真正改变了你的方案？'], en: ['Which kinds of user or customer feedback matter most to you?', 'Which feedback genuinely changed your approach?'] },
  { zh: ['你如何看待风险与不确定性？', '你承担过最值得的一次风险是什么？'], en: ['How do you approach risk and uncertainty?', 'What is the most worthwhile risk you have taken?'] },
  { zh: ['你希望长期留下什么影响？', '哪些工作最符合你想创造的影响？'], en: ['What long-term impact do you hope to leave?', 'Which work best matches the impact you want to create?'] },
  { zh: ['如果重新选择一次，你会改变什么？', '过去的哪项经验最值得带到下一阶段？'], en: ['What would you change if you could choose again?', 'Which past lesson is most valuable for your next stage?'] },
]

const PROJECT_TOPICS: readonly ProjectTopic[] = [
  { zh: ['{project} 解决的核心问题是什么？', '你为什么开始做 {project}？'], en: ['What core problem does {project} solve?', 'Why did you start {project}?'] },
  { zh: ['你在 {project} 中承担什么角色？', '{project} 最能体现你的哪项能力？'], en: ['What role do you play in {project}?', 'Which of your strengths does {project} demonstrate best?'] },
  { zh: ['{project} 面向哪些用户或场景？', '谁从 {project} 中获得的价值最大？'], en: ['Which users or scenarios is {project} designed for?', 'Who benefits most from {project}?'] },
  { zh: ['{project} 最重要的设计决定是什么？', '{project} 做过哪项关键取舍？'], en: ['What is the most important design decision in {project}?', 'Which key trade-off did you make in {project}?'] },
  { zh: ['{project} 遇到过的最大挑战是什么？', '你如何解决 {project} 中最棘手的问题？'], en: ['What was the biggest challenge in {project}?', 'How did you solve the hardest problem in {project}?'] },
  { zh: ['{project} 目前取得了哪些结果？', '你如何衡量 {project} 的成效？'], en: ['What results has {project} achieved so far?', 'How do you measure the effectiveness of {project}?'] },
  { zh: ['{project} 的下一步计划是什么？', '{project} 现在最需要改进什么？'], en: ['What is next for {project}?', 'What most needs improvement in {project} now?'] },
  { zh: ['{project} 如何从最初想法演变到现在？', '{project} 哪次迭代带来的变化最大？'], en: ['How did {project} evolve from its original idea?', 'Which iteration changed {project} the most?'] },
  { zh: ['{project} 使用了哪些关键方法或技术？', '为什么为 {project} 选择现在的方法？'], en: ['Which key methods or technologies does {project} use?', 'Why did you choose the current approach for {project}?'] },
  { zh: ['{project} 如何处理质量与可靠性？', '你如何验证 {project} 的关键行为？'], en: ['How does {project} address quality and reliability?', 'How do you verify the critical behavior of {project}?'] },
  { zh: ['{project} 中最值得复用的经验是什么？', '其他项目可以从 {project} 学到什么？'], en: ['Which lesson from {project} is most reusable?', 'What could other projects learn from {project}?'] },
  { zh: ['{project} 中哪项工作最让你自豪？', '{project} 最有代表性的成果是什么？'], en: ['Which part of {project} makes you most proud?', 'What is the most representative outcome of {project}?'] },
  { zh: ['{project} 经历过哪些失败或返工？', '你会如何避免重犯 {project} 中的错误？'], en: ['Which failures or rework did {project} encounter?', 'How would you avoid repeating mistakes from {project}?'] },
  { zh: ['{project} 如何收集和使用反馈？', '哪条反馈对 {project} 影响最大？'], en: ['How does {project} collect and use feedback?', 'Which feedback had the greatest impact on {project}?'] },
  { zh: ['{project} 有哪些重要约束？', '哪些限制塑造了 {project} 的方案？'], en: ['What important constraints does {project} have?', 'Which limitations shaped the approach in {project}?'] },
  { zh: ['{project} 如何与其他工作衔接？', '{project} 依赖哪些外部条件？'], en: ['How does {project} connect with your other work?', 'Which external conditions does {project} depend on?'] },
  { zh: ['你在 {project} 中如何协作？', '{project} 中的职责是如何划分的？'], en: ['How do you collaborate on {project}?', 'How are responsibilities divided in {project}?'] },
  { zh: ['{project} 如何保护用户或数据？', '{project} 中最重要的安全考虑是什么？'], en: ['How does {project} protect users or data?', 'What is the most important safety consideration in {project}?'] },
  { zh: ['{project} 最初有哪些假设？', '{project} 的哪项假设后来被推翻了？'], en: ['Which assumptions did {project} start with?', 'Which assumption in {project} was later disproved?'] },
  { zh: ['{project} 如何控制复杂度？', '{project} 做过哪些简化？'], en: ['How does {project} control complexity?', 'Which simplifications have you made in {project}?'] },
  { zh: ['{project} 最难解释的部分是什么？', '你会如何向新成员介绍 {project}？'], en: ['What is the hardest part of {project} to explain?', 'How would you introduce {project} to a new teammate?'] },
  { zh: ['{project} 的长期愿景是什么？', '成功的 {project} 最终会是什么样子？'], en: ['What is the long-term vision for {project}?', 'What would a successful future for {project} look like?'] },
  { zh: ['{project} 如何适应需求变化？', '哪次需求变化最考验 {project}？'], en: ['How does {project} adapt to changing requirements?', 'Which requirement change tested {project} the most?'] },
  { zh: ['{project} 中最关键的数据或证据是什么？', '哪些事实支持 {project} 当前的方向？'], en: ['What data or evidence matters most in {project}?', 'Which facts support the current direction of {project}?'] },
  { zh: ['如果重做 {project}，你会先改变什么？', '{project} 最值得保留的部分是什么？'], en: ['What would you change first if you rebuilt {project}?', 'Which part of {project} is most worth preserving?'] },
]

const FORBIDDEN_TEXT = /(?:\buserdata\b|\bdsh\b|deepseek|harness|system\s*prompt|tool\s*trace)/iu
const ABSOLUTE_PATH = /(?:^|\s)(?:\/[\w.-]+(?:\/[\w.-]+)+|[a-z]:\\[^\s]+)/iu
const MAX_ID_LENGTH = 160
const MAX_SESSION_ID_LENGTH = 300
const MAX_EXCLUDES = 100
const CACHE_VERSION = 1
const MAX_CACHE_BYTES = 128 * 1024
const MAX_QUESTION_TEXT = 300

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function substitute(template: string, project: string): string {
  return template.replaceAll('{project}', project)
}

function requiredAt<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index]
  if (item === undefined) throw new Error(`zhiwo question catalog is missing ${label} at index ${index}`)
  return item
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

function projectIdentity(name: string): ProjectIdentity | undefined {
  const display = name.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 48)
  if (display === '' || display.startsWith('.') || display.includes('/') || display.includes('\\')) return undefined
  if (FORBIDDEN_TEXT.test(display) || ABSOLUTE_PATH.test(display)) return undefined
  return { match: display.toLocaleLowerCase(), display }
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function cachePair(value: unknown): QuestionPair | undefined {
  const item = plainRecord(value)
  if (item === undefined || typeof item['id'] !== 'string' || item['id'].length === 0
    || item['id'].length > MAX_ID_LENGTH || (item['source'] !== 'global' && item['source'] !== 'project')
    || typeof item['zh'] !== 'string' || item['zh'].length === 0 || item['zh'].length > MAX_QUESTION_TEXT
    || typeof item['en'] !== 'string' || item['en'].length === 0 || item['en'].length > MAX_QUESTION_TEXT
    || FORBIDDEN_TEXT.test(item['zh']) || FORBIDDEN_TEXT.test(item['en'])
    || ABSOLUTE_PATH.test(item['zh']) || ABSOLUTE_PATH.test(item['en'])) return undefined
  const project = item['project']
  if (item['source'] === 'global' ? project !== undefined : typeof project !== 'string') return undefined
  return {
    id: item['id'],
    source: item['source'],
    zh: item['zh'],
    en: item['en'],
    ...typeof project === 'string' ? { project } : {},
  }
}

function cacheProject(value: unknown): ProjectIdentity | undefined {
  const item = plainRecord(value)
  if (item === undefined || typeof item['match'] !== 'string' || typeof item['display'] !== 'string') return undefined
  const normalized = projectIdentity(item['display'])
  return normalized?.match === item['match'] ? normalized : undefined
}

function parseCache(value: unknown): QuestionCache | undefined {
  const cache = plainRecord(value)
  if (cache?.['version'] !== CACHE_VERSION || typeof cache['fingerprint'] !== 'string'
    || !/^[a-f0-9]{12}$/.test(cache['fingerprint']) || typeof cache['revision'] !== 'string'
    || !Array.isArray(cache['projects']) || !Array.isArray(cache['catalog'])) return undefined
  const projects = cache['projects'].map(cacheProject)
  const catalog = cache['catalog'].map(cachePair)
  if (projects.some(item => item === undefined) || catalog.some(item => item === undefined)) return undefined
  const validProjects = projects as ProjectIdentity[]
  const validCatalog = catalog as QuestionPair[]
  const ids = new Set(validCatalog.map(item => item.id))
  const globals = validCatalog.filter(item => item.source === 'global').length
  const projectCount = validCatalog.length - globals
  if (validCatalog.length !== 100 || ids.size !== 100
    || (projectCount === 0 ? globals !== 100 : globals !== 50 || projectCount !== 50)
    || validCatalog.some(item => item.project !== undefined
      && !validProjects.some(project => project.display === item.project))
    || cache['revision'] !== digest(validCatalog.map(item => item.id).join('\n'))) return undefined
  return {
    version: CACHE_VERSION,
    fingerprint: cache['fingerprint'],
    revision: cache['revision'],
    projects: validProjects,
    catalog: validCatalog,
  }
}

async function readCache(filename: string): Promise<QuestionCache | undefined> {
  try {
    const metadata = await lstat(filename)
    if (!metadata.isFile() || metadata.size > MAX_CACHE_BYTES) return undefined
    return parseCache(JSON.parse(await readFile(filename, 'utf8')) as unknown)
  } catch {
    return undefined
  }
}

async function workspaceInventory(workspaceRoot: string): Promise<WorkspaceInventory> {
  const entries = (await readdir(workspaceRoot, { withFileTypes: true }))
    .filter(entry => !entry.name.startsWith('.') && !entry.isSymbolicLink()
      && (entry.isDirectory() || entry.isFile()))
    .sort((left, right) => left.name.localeCompare(right.name))
  const descriptors: string[] = []
  const projects: ProjectIdentity[] = []
  for (const entry of entries) {
    const metadata = await lstat(join(workspaceRoot, entry.name), { bigint: true })
    const kind = metadata.isDirectory() ? 'directory' : metadata.isFile() ? 'document' : undefined
    if (kind === undefined || metadata.isSymbolicLink()) continue
    descriptors.push(`${kind}\0${entry.name.normalize('NFKC')}\0${String(metadata.size)}\0${String(metadata.mtimeNs)}`)
    if (kind === 'directory') {
      const project = projectIdentity(entry.name)
      if (project !== undefined) projects.push(project)
    }
  }
  projects.sort((left, right) => left.match.localeCompare(right.match))
  return { fingerprint: digest(descriptors.join('\n')), projects }
}

function cacheFilename(workspaceRoot: string, dshHome?: string): string {
  return join(resolveDshHome(dshHome), 'zhiwo', 'questions', `${digest(resolve(workspaceRoot))}.json`)
}

function buildCatalog(projects: readonly ProjectIdentity[]): readonly QuestionPair[] {
  const global = GLOBAL_TOPICS.flatMap((topic, topicIndex) => ([0, 1] as const).map(variant => ({
    id: `global-${String(topicIndex + 1).padStart(2, '0')}-${variant + 1}`,
    source: 'global' as const,
    zh: topic.zh[variant],
    en: topic.en[variant],
  })))
  if (projects.length === 0) {
    return [...global, ...global.map((item, index) => ({
      ...item,
      id: `global-reflect-${String(index + 1).padStart(2, '0')}`,
      zh: `请结合具体经历回答：${item.zh}`,
      en: `Please answer with a concrete experience: ${item.en}`,
    }))]
  }
  const project = Array.from({ length: 50 }, (_, index): QuestionPair => {
    const topic = requiredAt(PROJECT_TOPICS, Math.floor(index / 2) % PROJECT_TOPICS.length, 'project topic')
    const variant = index % 2
    const owner = requiredAt(projects, index % projects.length, 'project')
    return {
      id: `project-${digest(owner.match)}-${String(Math.floor(index / 2) + 1).padStart(2, '0')}-${variant + 1}`,
      source: 'project',
      project: owner.display,
      zh: substitute(requiredAt(topic.zh, variant, 'Chinese project question'), owner.display),
      en: substitute(requiredAt(topic.en, variant, 'English project question'), owner.display),
    }
  })
  return [...global, ...project]
}

function parseRequest(value: unknown): QuestionRequest | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const request = value as Record<string, unknown>
  if (request['kind'] !== 'welcome' && request['kind'] !== 'followup') return undefined
  if (request['locale'] !== 'zh' && request['locale'] !== 'en') return undefined
  if (typeof request['sessionId'] !== 'string' || request['sessionId'].length === 0
    || request['sessionId'].length > MAX_SESSION_ID_LENGTH) return undefined
  if (!Array.isArray(request['excludeIds']) || request['excludeIds'].length > MAX_EXCLUDES
    || request['excludeIds'].some(id => typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH)) return undefined
  if (request['kind'] === 'followup'
    ? !Number.isSafeInteger(request['turnEndSeq']) || (request['turnEndSeq'] as number) < 0
    : request['turnEndSeq'] !== undefined) return undefined
  return {
    kind: request['kind'],
    locale: request['locale'],
    sessionId: request['sessionId'],
    ...request['kind'] === 'followup' ? { turnEndSeq: request['turnEndSeq'] as number } : {},
    excludeIds: request['excludeIds'] as string[],
  }
}

function rotate<T>(items: readonly T[], seed: string): readonly T[] {
  if (items.length < 2) return items
  const offset = Number.parseInt(digest(seed).slice(0, 8), 16) % items.length
  return [...items.slice(offset), ...items.slice(0, offset)]
}

function select<T extends { readonly id: string }>(
  items: readonly T[],
  count: number,
  exclude: ReadonlySet<string>,
  seed: string,
): readonly T[] {
  const ordered = rotate(items, seed)
  const fresh = ordered.filter(item => !exclude.has(item.id))
  return fresh.length >= count
    ? fresh.slice(0, count)
    : [...fresh, ...ordered.filter(item => !fresh.includes(item))].slice(0, count)
}

function localized(entry: QuestionPair, locale: QuestionLocale): QuestionSuggestion {
  return {
    id: entry.id,
    text: entry[locale],
    texts: { zh: entry.zh, en: entry.en },
    source: entry.source,
    ...entry.project === undefined ? {} : { project: entry.project },
  }
}

function messageText(session: Session, source: 'user' | 'model', throughSeq: number): string | undefined {
  const message = session.surface.nodes
    .filter(seq => seq <= throughSeq)
    .map(seq => session.deriveEventMessage(requiredAt(session.events, seq, 'Session event')))
    .findLast(candidate => candidate?.source.kind === source)
  if (message == null) return undefined
  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return text === '' ? undefined : text
}

function safeExcerpt(value: string | undefined): string | undefined {
  if (value === undefined || FORBIDDEN_TEXT.test(value) || ABSOLUTE_PATH.test(value)) return undefined
  const plain = value
    .replace(/[`*_#>\[\]()]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (plain.length < 2) return undefined
  return plain.length <= 36 ? plain : `${plain.slice(0, 35)}…`
}

function contextSuggestions(
  session: Session,
  projects: readonly ProjectIdentity[],
  locale: QuestionLocale,
  turnEndSeq: number,
): readonly QuestionSuggestion[] | undefined {
  const selectedEnd = session.events[turnEndSeq]
  if (selectedEnd?.type !== 'turn/end' || selectedEnd.data.reason.kind !== 'completed') return undefined
  const user = messageText(session, 'user', turnEndSeq)
  const assistant = messageText(session, 'model', turnEndSeq)
  const combined = `${user ?? ''}\n${assistant ?? ''}`.toLocaleLowerCase()
  const project = projects.find(candidate => combined.includes(candidate.match))
  const excerpt = safeExcerpt(user)
  const zh = project === undefined ? [
    excerpt === undefined ? '刚才的话题中，哪段经历最值得进一步说明？' : `围绕“${excerpt}”，哪段经历最值得进一步说明？`,
    '刚才的回答中，哪些事实最值得继续验证？',
    '这个话题与我的长期目标有什么关系？',
    '什么具体结果最能支持刚才的结论？',
    '这段经历中最关键的取舍是什么？',
    '从这段经历中，我获得了什么可复用的经验？',
    '如果继续推进这个方向，下一步应该关注什么？',
    '还有哪项背景信息能帮助理解刚才的回答？',
  ] : [
    `${project.display} 中哪段经历最能说明刚才的回答？`,
    `${project.display} 还有哪些关键结果值得了解？`,
    `${project.display} 最重要的一次取舍是什么？`,
    `你从 ${project.display} 中学到了什么？`,
    `${project.display} 的下一步重点是什么？`,
    `${project.display} 中哪项事实最值得继续验证？`,
    `${project.display} 如何体现你的长期目标？`,
    `如果重做 ${project.display}，你会改变什么？`,
  ]
  const en = project === undefined ? [
    excerpt === undefined ? 'Which experience from this topic is most worth exploring?' : `Which experience is most worth exploring around “${excerpt}”?`,
    'Which facts from the last answer are most worth verifying?',
    'How does this topic relate to your long-term goals?',
    'Which concrete result best supports the last answer?',
    'What was the most important trade-off in this experience?',
    'What reusable lesson did you gain from this experience?',
    'What should you focus on next if you continue in this direction?',
    'Which other part of your background would clarify the last answer?',
  ] : [
    `Which experience in ${project.display} best illustrates the last answer?`,
    `Which other key results from ${project.display} are worth knowing?`,
    `What was the most important trade-off in ${project.display}?`,
    `What did you learn from ${project.display}?`,
    `What should ${project.display} focus on next?`,
    `Which fact about ${project.display} is most worth verifying?`,
    `How does ${project.display} reflect your long-term goals?`,
    `What would you change if you rebuilt ${project.display}?`,
  ]
  const stable = digest(`${selectedEnd.seq}\n${user ?? ''}\n${assistant ?? ''}`)
  return zh.map((text, index): QuestionSuggestion => {
    const english = requiredAt(en, index, 'English context question')
    return {
      id: `context-${stable}-${index + 1}`,
      text: locale === 'zh' ? text : english,
      texts: { zh: text, en: english },
      source: 'context',
      ...project === undefined ? {} : { project: project.display },
    }
  })
}

function rpcError(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/** Background catalog owner and request handler. */
export class ZhiwoQuestions {
  private catalog: readonly QuestionPair[] | undefined
  private projects: readonly ProjectIdentity[] = []
  private revision = 'pending'
  private active = false
  private ready: Promise<void> | undefined

  /**
   * @param workspaceRoot - canonical raw Workspace directory.
   * @param sessions - native live Session store.
   * @param warn - background-scan diagnostic sink.
   * @param dshHome - optional private Harness home containing the catalog cache.
   */
  constructor(
    private readonly workspaceRoot: string,
    private readonly sessions: Pick<SessionStore, 'get'>,
    private readonly warn: (message: string) => void,
    private readonly dshHome?: string,
  ) {}

  /**
   * Start the non-blocking immediate-child inventory.
   * @returns A disposer that prevents later background publication.
   */
  start(): () => void {
    this.active = true
    this.ready ??= this.initialize()
    return () => { this.active = false }
  }

  private publish(cache: QuestionCache): void {
    this.projects = cache.projects
    this.catalog = cache.catalog
    this.revision = cache.revision
  }

  private async initialize(): Promise<void> {
    const filename = cacheFilename(this.workspaceRoot, this.dshHome)
    const cached = await readCache(filename)
    let inventory: WorkspaceInventory
    try {
      inventory = await workspaceInventory(this.workspaceRoot)
    } catch {
      this.warn('zhiwo question inventory failed; using the last valid cache or global catalog')
      if (!this.active) return
      if (cached !== undefined) {
        this.publish(cached)
        return
      }
      inventory = { fingerprint: digest('unavailable'), projects: [] }
    }
    if (!this.active) return
    if (cached?.fingerprint === inventory.fingerprint) {
      this.publish(cached)
      return
    }
    const catalog = buildCatalog(inventory.projects)
    const next: QuestionCache = {
      version: CACHE_VERSION,
      fingerprint: inventory.fingerprint,
      revision: digest(catalog.map(item => item.id).join('\n')),
      projects: inventory.projects,
      catalog,
    }
    this.publish(next)
    try {
      await writeFileAtomic(filename, `${JSON.stringify(next)}\n`, { mode: 0o600, dirMode: 0o700 })
    } catch {
      this.warn('zhiwo question cache write failed; continuing with the initialized in-memory catalog')
    }
  }

  /**
   * Handle one validated visitor-scoped question request.
   * @param payload - Untrusted request payload from the existing Connection channel.
   * @param signal - Request cancellation signal.
   * @returns The validated question response or an RPC error.
   */
  async handle(payload: unknown, signal: AbortSignal): Promise<RpcResult<QuestionResponse>> {
    const request = parseRequest(payload)
    if (request === undefined) return rpcError('Invalid Zhiwo question request')
    if (isAborted(signal)) return { ok: false, error: { code: 'cancelled', message: 'Question refresh was cancelled', details: {} } }
    this.ready ??= this.initialize()
    await this.ready
    if (isAborted(signal)) return { ok: false, error: { code: 'cancelled', message: 'Question refresh was cancelled', details: {} } }
    const catalog = this.catalog
    if (catalog === undefined) return rpcError('Zhiwo question catalog is unavailable')
    const session = this.sessions.get(SessionId(request.sessionId))
    if (session === undefined) {
      return { ok: false, error: { code: 'session-not-found', message: 'Session not found', details: { sessionId: SessionId(request.sessionId) } } }
    }
    const exclude = new Set(request.excludeIds)
    if (request.kind === 'welcome') {
      const globals = catalog.filter(item => item.source === 'global')
      const projects = catalog.filter(item => item.source === 'project')
      const selected = projects.length === 0
        ? select(globals, 4, exclude, `${request.sessionId}:welcome:global`)
        : [
          ...select(globals, 2, exclude, `${request.sessionId}:welcome:global`),
          ...select(projects, 2, exclude, `${request.sessionId}:welcome:project`),
        ]
      return {
        ok: true,
        value: { kind: 'welcome', revision: this.revision, items: selected.map(item => localized(item, request.locale)) },
      }
    }
    const turnEndSeq = request.turnEndSeq
    if (turnEndSeq === undefined) return rpcError('Missing Zhiwo completed Turn identity')
    const contextual = contextSuggestions(session, this.projects, request.locale, turnEndSeq)
    if (contextual === undefined) return rpcError('The selected Zhiwo turn did not complete')
    const globals = catalog.filter(item => item.source === 'global')
    return {
      ok: true,
      value: {
        kind: 'followup',
        revision: this.revision,
        items: [
          ...select(contextual, 2, exclude, `${request.sessionId}:followup:context`),
          ...select(globals, 2, exclude, `${request.sessionId}:followup:global`)
            .map(item => localized(item, request.locale)),
        ],
      },
    }
  }
}

/** Typert Remote projection of the Zhiwo question catalog on the shared browser API. */
export class ZhiwoQuestionService extends TypertRemoteService {
  /**
   * @param ctx - owning Host context visible to Typert Gateway.
   * @param questions - initialized question catalog and Session reader.
   */
  constructor(ctx: Context, private readonly questions: ZhiwoQuestions) {
    super(ctx, 'zhiwoQuestions', { namespace: 'zhiwo' })
  }

  /**
   * Resolve one welcome or completed-turn question set.
   * @param request - validated semantic question request.
   * @param signal - browser request cancellation.
   * @returns four bilingual questions for the requested lifecycle point.
   */
  @Remote('questions')
  async resolveQuestions(request: QuestionRequest, signal: AbortSignal): Promise<QuestionResponse> {
    const result = await this.questions.handle(request, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
}
