/** Types owned by the Zhiwo product layer. */

/** Compiler result describing how the fixed runtime can consume one source. */
export type Readability =
  | 'native_text'
  | 'native_image'
  | 'derived_text'
  | 'metadata_only'
  | 'unsupported'
  | 'failed'

/** Safe logical location returned with a citation. */
export interface SourceLocation {
  lineStart?: number
  lineEnd?: number
  page?: number
  slide?: number
  sheet?: string
  cellRange?: string
}

/** Mapping from derived-text line ranges back to source-native locations. */
export interface SourceLocationMapEntry extends SourceLocation {
  lineStart: number
  lineEnd: number
}

/** Trusted catalog record retained only by the server and compiler. */
export interface SourceRecord {
  id: string
  revision: string
  logicalPath: string
  displayTitle: string
  mediaType?: string
  readability: Readability
  sourceChecksum: string
  artifactChecksum?: string
  contentArtifact?: string
  previewArtifact?: string
  downloadArtifact?: string
  locationMap?: SourceLocationMapEntry[]
  converter?: {
    name: string
    version: string
  }
}

/** Immutable compiler manifest verified before a revision becomes current. */
export interface KnowledgeRevisionManifest {
  id: string
  createdAt: number
  upstreamProductVersion: string
  sourceRootChecksum: string
  configChecksum?: string
  catalogChecksum: string
  auditChecksum: string
  compilerVersion: string
  converterVersions: Record<string, string>
  starterQuestions: string[]
  sourceCount: number
  readabilityCount: Record<Readability, number>
  totalSourceBytes: number
  totalArtifactBytes: number
  auditSummary: {
    suspiciousSecretCount: number
    failedSourceCount: number
    oversizedSourceCount: number
    warningCount: number
  }
}

/** Aggregate, content-free compiler audit safe for owner output. */
export interface KnowledgeAudit {
  readabilityCount: Record<Readability, number>
  suspiciousSecretCount: number
  failedSourceCount: number
  oversizedSourceCount: number
  skippedSpecialNodeCount: number
  skippedSymlinkCount: number
  warnings: string[]
}

/** Validated immutable revision loaded by the product runtime. */
export interface KnowledgeRevision {
  id: string
  root: string
  manifest: KnowledgeRevisionManifest
  sources: readonly SourceRecord[]
}

/** Browser-safe citation projection containing no internal paths. */
export interface PublicCitation {
  id: string
  title: string
  excerpt?: string
  openable: boolean
  downloadable: boolean
  location?: SourceLocation
}

/** Browser-safe session projection owned by one anonymous guest. */
export interface ProductSession {
  id: string
  knowledgeRevisionId: string
  title: string
  state: 'active' | 'cancelling' | 'deleting'
  generationState: 'idle' | 'running' | 'failed'
  createdAt: number
  updatedAt: number
  lastActiveAt: number
}

/** Public status of one projected Agent action. */
export type PublicTraceStatus = 'running' | 'completed' | 'failed'

/** Browser-safe projection of one native DSH conversation event. */
export type PublicTraceItem =
  | {
    id: string
    type: 'context'
    label: '上下文注入'
    detail: string
    status: 'completed'
  }
  | {
    id: string
    type: 'reasoning'
    label: 'Think'
    text: string
    status: 'running' | 'completed'
  }
  | {
    id: string
    type: 'tool'
    tool: 'read' | 'glob' | 'grep'
    label: 'Read' | 'Glob' | 'Grep'
    detail: string
    status: PublicTraceStatus
  }
  | {
    id: string
    type: 'text'
    text: string
    status: 'completed'
  }

/** Browser-safe message projection with the ordered native Agent activity transcript. */
export interface PublicMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  citations: PublicCitation[]
  trace: PublicTraceItem[]
}

/** Owner-configured questions shown in the empty product state. */
export interface StarterConfig {
  questions: string[]
}

/** Fully materialized owner configuration used by the knowledge compiler. */
export interface ZhiwoPolicy {
  version: 1
  compiler: {
    maxFileBytes: number
    maxTotalBytes: number
    maxEntries: number
    maxDepth: number
    maxArchiveEntries: 0
    git: {
      enabled: boolean
      includeHistorySummary: boolean
      maxCommits: number
    }
    images: {
      enableRuntimeRead: boolean
    }
  }
  starterQuestions: string[]
}

/** Trusted deployment configuration for the public runtime. */
export interface ZhiwoRuntimeConfig {
  listenHost: '127.0.0.1' | '0.0.0.0'
  listenPort: number
  publicOrigin: URL
  stateRoot: string
  knowledgeRoot: string
  cookieName: string
  cookieSecret: Buffer
  cookiePreviousSecret?: Buffer
  cookieMaxAgeDays: number
  sessionRetentionDays: number
  maxSessionsPerGuest: number
  maxPromptChars: number
  maxTurnsPerSession: number
  maxRequestsPerGuestMinute: number
  maxRequestsPerIpMinute: number
  maxConcurrentPerGuest: number
  maxConcurrentPerIp: number
  metricsPort: number
  logLevel: 'silent' | 'info'
  modelProvider: 'zhiwo-deepseek'
  model: string
  modelBaseURL: string
  modelApiKey: string
  modelMaxTokens: number
  modelContextWindow: number
  modelReasoningEffort: 'off' | 'low' | 'high' | 'max'
  development: boolean
}

/** Trusted owner-plane inputs for one compiler run. */
export interface SyncOptions {
  sourceRoot: string
  knowledgeRoot: string
  configFile?: string
  check?: boolean
  productVersion: string
  upstreamBase: string
}

/** Owner-safe compiler outcome and aggregate audit. */
export interface SyncReport {
  checkedOnly: boolean
  activated: boolean
  revision: KnowledgeRevision
  audit: KnowledgeAudit
}
