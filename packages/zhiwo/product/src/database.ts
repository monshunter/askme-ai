/** Unified Zhiwo SQLite store for guest ownership, sessions, events, and source grants. */

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  KnowledgeRevision,
  ProductSession,
  PublicCitation,
  PublicMessage,
  PublicTraceItem,
  SourceLocation,
  SourceRecord,
} from './types.ts'

/** Current product database schema version written to build and diagnostic output. */
export const ZHIWO_SCHEMA_VERSION = 3

interface SessionRow {
  id: string
  knowledge_revision_id: string
  title: string
  state: ProductSession['state']
  generation_state: ProductSession['generationState']
  created_at: number
  updated_at: number
  last_active_at: number
}

interface MessageRow {
  id: string
  role: PublicMessage['role']
  content: string
  status: PublicMessage['status']
  created_at: number
  citations_json: string
  trace_json: string
}

interface SourceRow {
  source_json: string
}

function sessionFromRow(row: SessionRow): ProductSession {
  return {
    id: row.id,
    knowledgeRevisionId: row.knowledge_revision_id,
    title: row.title,
    state: row.state,
    generationState: row.generation_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActiveAt: row.last_active_at,
  }
}

function messageFromRow(row: MessageRow): PublicMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    citations: JSON.parse(row.citations_json) as PublicCitation[],
    trace: JSON.parse(row.trace_json) as PublicTraceItem[],
  }
}

/** Product data access whose public session methods always require a guest owner. */
export class ZhiwoDatabase {
  private readonly database: DatabaseSync

  /**
   * Open or create the product database and reject unknown schema versions.
   * @param path - SQLite file path, or `:memory:` for tests.
   */
  public constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.database = new DatabaseSync(path)
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    this.initialize()
    this.recoverInterruptedSessions()
  }

  private initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        version INTEGER NOT NULL
      ) STRICT;
    `)
    const row = this.database.prepare('SELECT version FROM schema_meta WHERE singleton = 1').get() as
      | { version: number }
      | undefined
    if (row === undefined) {
      this.createCurrentSchema()
      this.database.prepare('INSERT INTO schema_meta(singleton, version) VALUES (1, ?)')
        .run(ZHIWO_SCHEMA_VERSION)
      return
    }
    let version = row.version
    if (version === 1) {
      this.migrateSchema1To2()
      version = 2
    }
    if (version === 2) {
      this.migrateSchema2To3()
      version = 3
    }
    if (version !== ZHIWO_SCHEMA_VERSION) {
      throw new Error(`unsupported Zhiwo database schema version ${String(version)}`)
    }
    this.createCurrentSchema()
  }

  private createCurrentSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS guests (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS knowledge_revisions (
        id TEXT PRIMARY KEY,
        manifest_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sources (
        revision_id TEXT NOT NULL REFERENCES knowledge_revisions(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        source_json TEXT NOT NULL,
        PRIMARY KEY (revision_id, id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
        knowledge_revision_id TEXT NOT NULL REFERENCES knowledge_revisions(id),
        title TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active', 'cancelling', 'deleting')),
        generation_state TEXT NOT NULL CHECK (generation_state IN ('idle', 'running', 'failed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS sessions_guest_activity
        ON sessions(guest_id, last_active_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS sessions_revision_identity
        ON sessions(id, knowledge_revision_id);
      CREATE TABLE IF NOT EXISTS session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')),
        citations_json TEXT NOT NULL DEFAULT '[]',
        trace_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS messages_session_time
        ON session_messages(session_id, created_at, id);
      CREATE UNIQUE INDEX IF NOT EXISTS messages_session_identity
        ON session_messages(session_id, id);
      CREATE TABLE IF NOT EXISTS session_events (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        event_json TEXT NOT NULL,
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        UNIQUE(session_id, event_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS turn_source_access (
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        tool TEXT NOT NULL CHECK (tool IN ('read', 'read_image', 'grep', 'glob')),
        location_json TEXT,
        PRIMARY KEY(session_id, turn_id, source_id, tool),
        FOREIGN KEY(session_id, revision_id)
          REFERENCES sessions(id, knowledge_revision_id) ON DELETE CASCADE,
        FOREIGN KEY(revision_id, source_id)
          REFERENCES sources(revision_id, id) ON DELETE CASCADE
      ) STRICT;
      CREATE TABLE IF NOT EXISTS source_grants (
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        PRIMARY KEY(session_id, message_id, source_id),
        FOREIGN KEY(session_id, revision_id)
          REFERENCES sessions(id, knowledge_revision_id) ON DELETE CASCADE,
        FOREIGN KEY(session_id, message_id)
          REFERENCES session_messages(session_id, id) ON DELETE CASCADE,
        FOREIGN KEY(revision_id, source_id)
          REFERENCES sources(revision_id, id) ON DELETE CASCADE
      ) STRICT;
    `)
  }

  private migrateSchema1To2(): void {
    this.database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;')
    try {
      this.database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS sessions_revision_identity
          ON sessions(id, knowledge_revision_id);
        CREATE UNIQUE INDEX IF NOT EXISTS messages_session_identity
          ON session_messages(session_id, id);
        ALTER TABLE turn_source_access RENAME TO turn_source_access_v1;
        ALTER TABLE source_grants RENAME TO source_grants_v1;
        CREATE TABLE turn_source_access (
          session_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          revision_id TEXT NOT NULL,
          source_id TEXT NOT NULL,
          tool TEXT NOT NULL CHECK (tool IN ('read', 'read_image', 'grep', 'glob')),
          location_json TEXT,
          PRIMARY KEY(session_id, turn_id, source_id, tool),
          FOREIGN KEY(session_id, revision_id)
            REFERENCES sessions(id, knowledge_revision_id) ON DELETE CASCADE,
          FOREIGN KEY(revision_id, source_id)
            REFERENCES sources(revision_id, id) ON DELETE CASCADE
        ) STRICT;
        INSERT INTO turn_source_access(session_id, turn_id, revision_id, source_id, tool, location_json)
        SELECT access.session_id, access.turn_id, sessions.knowledge_revision_id,
          access.source_id, 'read', access.location_json
        FROM turn_source_access_v1 AS access
        JOIN sessions ON sessions.id = access.session_id
        JOIN sources ON sources.revision_id = sessions.knowledge_revision_id AND sources.id = access.source_id;
        CREATE TABLE source_grants (
          session_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          revision_id TEXT NOT NULL,
          source_id TEXT NOT NULL,
          PRIMARY KEY(session_id, message_id, source_id),
          FOREIGN KEY(session_id, revision_id)
            REFERENCES sessions(id, knowledge_revision_id) ON DELETE CASCADE,
          FOREIGN KEY(session_id, message_id)
            REFERENCES session_messages(session_id, id) ON DELETE CASCADE,
          FOREIGN KEY(revision_id, source_id)
            REFERENCES sources(revision_id, id) ON DELETE CASCADE
        ) STRICT;
        INSERT INTO source_grants(session_id, message_id, revision_id, source_id)
        SELECT grant_row.session_id, grant_row.message_id, sessions.knowledge_revision_id, grant_row.source_id
        FROM source_grants_v1 AS grant_row
        JOIN sessions ON sessions.id = grant_row.session_id
        JOIN session_messages ON session_messages.session_id = grant_row.session_id
          AND session_messages.id = grant_row.message_id
        JOIN sources ON sources.revision_id = sessions.knowledge_revision_id
          AND sources.id = grant_row.source_id;
        DROP TABLE source_grants_v1;
        DROP TABLE turn_source_access_v1;
        UPDATE schema_meta SET version = 2 WHERE singleton = 1;
        COMMIT;
      `)
    } catch (error) {
      try {
        this.database.exec('ROLLBACK')
      } catch {
        // SQLite may already have ended a failed migration transaction.
      }
      throw error
    } finally {
      this.database.exec('PRAGMA foreign_keys = ON;')
    }
    if (this.database.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('Zhiwo schema migration produced foreign-key violations')
    }
  }

  private migrateSchema2To3(): void {
    this.database.exec('BEGIN IMMEDIATE;')
    try {
      this.database.exec(`
        ALTER TABLE session_messages ADD COLUMN trace_json TEXT NOT NULL DEFAULT '[]';
        UPDATE schema_meta SET version = 3 WHERE singleton = 1;
        COMMIT;
      `)
    } catch (error) {
      try {
        this.database.exec('ROLLBACK')
      } catch {
        // SQLite may already have ended a failed migration transaction.
      }
      throw error
    }
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      try {
        this.database.exec('ROLLBACK')
      } catch {
        // SQLite is allowed to end a failed transaction before this rollback statement.
      }
      throw error
    }
  }

  /**
   * Finish deletion intents and fail incomplete generations left by an unclean process exit.
   * @returns counts of deleted sessions and active sessions projected as failed.
   */
  public recoverInterruptedSessions(): { deletedSessions: number; failedSessions: number } {
    return this.transaction(() => {
      const deletedSessions = Number(this.database.prepare(`
        DELETE FROM sessions WHERE state IN ('cancelling', 'deleting')
      `).run().changes)
      this.database.prepare(`
        UPDATE session_messages
        SET content = '回答因服务重启而中断，请重试。', status = 'failed', citations_json = '[]', trace_json = '[]'
        WHERE role = 'assistant' AND status IN ('pending', 'streaming')
          AND session_id IN (
            SELECT id FROM sessions WHERE state = 'active' AND generation_state = 'running'
          )
      `).run()
      const failedSessions = Number(this.database.prepare(`
        UPDATE sessions SET generation_state = 'failed', updated_at = ?
        WHERE state = 'active' AND generation_state = 'running'
      `).run(Date.now()).changes)
      return { deletedSessions, failedSessions }
    })
  }

  /**
   * Touch an opaque, HMAC-derived guest identifier.
   * @param guestId - server-derived guest id, never the cookie subject itself.
   */
  public touchGuest(guestId: string): void {
    const now = Date.now()
    this.database.prepare(`
      INSERT INTO guests(id, created_at, last_seen_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `).run(guestId, now, now)
  }

  /**
   * Register an immutable compiler revision and its public catalog.
   * @param revision - validated revision loaded from the artifact plane.
   */
  public registerRevision(revision: KnowledgeRevision): void {
    this.transaction(() => {
      this.database.prepare(`
        INSERT OR IGNORE INTO knowledge_revisions(id, manifest_json, created_at) VALUES (?, ?, ?)
      `).run(revision.id, JSON.stringify(revision.manifest), revision.manifest.createdAt)
      const insertSource = this.database.prepare(`
        INSERT OR IGNORE INTO sources(revision_id, id, source_json) VALUES (?, ?, ?)
      `)
      for (const source of revision.sources) {
        insertSource.run(revision.id, source.id, JSON.stringify(source))
      }
    })
  }

  /**
   * Create a guest-owned session bound to one immutable knowledge revision.
   * @param guestId - owning guest.
   * @param revisionId - current revision selected at first prompt.
   * @param title - initial user-facing title.
   * @returns created session.
   */
  public createSession(guestId: string, revisionId: string, title: string): ProductSession {
    const now = Date.now()
    const id = `ses_${randomUUID()}`
    this.database.prepare(`
      INSERT INTO sessions(
        id, guest_id, knowledge_revision_id, title, state, generation_state,
        created_at, updated_at, last_active_at
      ) VALUES (?, ?, ?, ?, 'active', 'idle', ?, ?, ?)
    `).run(id, guestId, revisionId, title, now, now, now)
    return this.requireSession(guestId, id)
  }

  /**
   * Count sessions through the ownership index.
   * @param guestId - owning guest.
   * @returns number of retained sessions.
   */
  public countSessions(guestId: string): number {
    const row = this.database.prepare('SELECT count(*) AS count FROM sessions WHERE guest_id = ?')
      .get(guestId) as { count: number }
    return row.count
  }

  /**
   * List the caller's sessions only.
   * @param guestId - owning guest.
   * @returns sessions ordered by recent activity.
   */
  public listSessions(guestId: string): ProductSession[] {
    return (this.database.prepare(`
      SELECT id, knowledge_revision_id, title, state, generation_state,
        created_at, updated_at, last_active_at
      FROM sessions WHERE guest_id = ? ORDER BY last_active_at DESC
    `).all(guestId) as unknown as SessionRow[]).map(sessionFromRow)
  }

  /**
   * Resolve an owned session or throw a stable not-found error.
   * @param guestId - owning guest.
   * @param sessionId - opaque session id.
   * @returns owned session.
   */
  public requireSession(guestId: string, sessionId: string): ProductSession {
    const row = this.database.prepare(`
      SELECT id, knowledge_revision_id, title, state, generation_state,
        created_at, updated_at, last_active_at
      FROM sessions WHERE guest_id = ? AND id = ?
    `).get(guestId, sessionId) as SessionRow | undefined
    if (row === undefined) throw new Error('ZHIWO_SESSION_NOT_FOUND')
    return sessionFromRow(row)
  }

  /**
   * Store a public user or assistant projection.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @param message - public projection to persist.
   */
  public insertMessage(guestId: string, sessionId: string, message: PublicMessage): void {
    this.requireSession(guestId, sessionId)
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO session_messages(id, session_id, role, content, status, citations_json, trace_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.id,
        sessionId,
        message.role,
        message.content,
        message.status,
        JSON.stringify(message.citations),
        JSON.stringify(message.trace),
        message.createdAt,
      )
      this.database.prepare(`
        UPDATE sessions SET updated_at = ?, last_active_at = ? WHERE guest_id = ? AND id = ?
      `).run(message.createdAt, message.createdAt, guestId, sessionId)
    })
  }

  /**
   * Replace an assistant projection after citation validation.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @param message - final public assistant message.
   */
  public finalizeAssistant(guestId: string, sessionId: string, message: PublicMessage): void {
    const session = this.requireSession(guestId, sessionId)
    this.transaction(() => {
      const result = this.database.prepare(`
        UPDATE session_messages SET content = ?, status = ?, citations_json = ?, trace_json = ?
        WHERE session_id = ? AND id = ? AND role = 'assistant'
      `).run(
        message.content,
        message.status,
        JSON.stringify(message.citations),
        JSON.stringify(message.trace),
        sessionId,
        message.id,
      )
      if (result.changes !== 1) throw new Error('ZHIWO_MESSAGE_NOT_FOUND')
      const grant = this.database.prepare(`
        INSERT OR IGNORE INTO source_grants(session_id, message_id, revision_id, source_id)
        VALUES (?, ?, ?, ?)
      `)
      for (const citation of message.citations) {
        grant.run(sessionId, message.id, session.knowledgeRevisionId, citation.id)
      }
      this.database.prepare(`
        UPDATE sessions SET generation_state = ?, updated_at = ?, last_active_at = ?
        WHERE guest_id = ? AND id = ?
      `).run(message.status === 'failed' ? 'failed' : 'idle', Date.now(), Date.now(), guestId, sessionId)
    })
  }

  /**
   * Return public history for an owned session.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @returns ordered public messages.
   */
  public listMessages(guestId: string, sessionId: string): PublicMessage[] {
    this.requireSession(guestId, sessionId)
    return (this.database.prepare(`
      SELECT id, role, content, status, created_at, citations_json, trace_json
      FROM session_messages WHERE session_id = ? ORDER BY created_at, rowid
    `).all(sessionId) as unknown as MessageRow[]).map(messageFromRow)
  }

  /**
   * Count completed visitor turns for a bounded session.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @returns number of retained user messages.
   */
  public countTurns(guestId: string, sessionId: string): number {
    this.requireSession(guestId, sessionId)
    const row = this.database.prepare(`
      SELECT count(*) AS count FROM session_messages WHERE session_id = ? AND role = 'user'
    `).get(sessionId) as { count: number }
    return row.count
  }

  /**
   * Persist the reusable DSH session event stream in the product database.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @param event - event with an opaque id.
   */
  public appendSessionEvent(guestId: string, sessionId: string, event: { seq: number } & object): void {
    this.requireSession(guestId, sessionId)
    this.database.prepare(`
      INSERT OR IGNORE INTO session_events(session_id, event_id, event_json) VALUES (?, ?, ?)
    `).run(sessionId, String(event.seq), JSON.stringify(event))
  }

  /**
   * Load DSH events needed to resume an owned session.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @returns parsed event objects in append order.
   */
  public loadSessionEvents(guestId: string, sessionId: string): object[] {
    this.requireSession(guestId, sessionId)
    const rows = this.database.prepare(`
      SELECT event_json FROM session_events WHERE session_id = ? ORDER BY CAST(event_id AS INTEGER)
    `).all(sessionId) as unknown as Array<{ event_json: string }>
    return rows.map(row => JSON.parse(row.event_json) as object)
  }

  /**
   * Record one source actually returned by a read or grep tool call.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @param turnId - current turn id.
   * @param revisionId - immutable revision bound to the session.
   * @param sourceId - catalog source id.
   * @param tool - read-only tool that produced the access.
   * @param location - optional accessed location.
   */
  public recordSourceAccess(
    guestId: string,
    sessionId: string,
    turnId: string,
    revisionId: string,
    sourceId: string,
    tool: 'read' | 'read_image' | 'grep' | 'glob',
    location?: SourceLocation,
  ): void {
    this.requireSession(guestId, sessionId)
    this.database.prepare(`
      INSERT INTO turn_source_access(session_id, turn_id, revision_id, source_id, tool, location_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, turn_id, source_id, tool)
      DO UPDATE SET location_json = excluded.location_json
    `).run(
      sessionId,
      turnId,
      revisionId,
      sourceId,
      tool,
      location === undefined ? null : JSON.stringify(location),
    )
  }

  /**
   * Read one source in the owned session's fixed revision.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @param sourceId - catalog id.
   * @returns source record, if it belongs to the bound revision.
   */
  public getSessionSource(guestId: string, sessionId: string, sourceId: string): SourceRecord | undefined {
    const session = this.requireSession(guestId, sessionId)
    const row = this.database.prepare(`
      SELECT source_json FROM sources WHERE revision_id = ? AND id = ?
    `).get(session.knowledgeRevisionId, sourceId) as SourceRow | undefined
    return row === undefined ? undefined : JSON.parse(row.source_json) as SourceRecord
  }

  /**
   * Determine whether a cited message granted this session access to a source.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @param sourceId - catalog id.
   * @returns whether an assistant citation created a durable grant.
   */
  public hasSourceGrant(guestId: string, sessionId: string, sourceId: string): boolean {
    this.requireSession(guestId, sessionId)
    return this.database.prepare(`
      SELECT 1 FROM source_grants WHERE session_id = ? AND source_id = ? LIMIT 1
    `).get(sessionId, sourceId) !== undefined
  }

  /**
   * Test whether a retained session still pins one knowledge revision.
   * @param revisionId - immutable revision id.
   * @returns whether artifact collection must preserve it.
   */
  public isRevisionReferenced(revisionId: string): boolean {
    return this.database.prepare('SELECT 1 FROM sessions WHERE knowledge_revision_id = ? LIMIT 1')
      .get(revisionId) !== undefined
  }

  /**
   * Move one owned session into a deletion state without revealing foreign ids.
   * @param guestId - owning guest.
   * @param sessionId - candidate owned session.
   * @param state - cancellation or deletion phase.
   * @returns whether the caller owns a retained session with this id.
   */
  public markSessionForDeletion(
    guestId: string,
    sessionId: string,
    state: 'cancelling' | 'deleting',
  ): boolean {
    return this.database.prepare(`
      UPDATE sessions SET state = ?, updated_at = ? WHERE guest_id = ? AND id = ?
    `).run(state, Date.now(), guestId, sessionId).changes === 1
  }

  /**
   * Set generation state only after ownership has been established.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @param state - next public generation state.
   */
  public setGenerationState(
    guestId: string,
    sessionId: string,
    state: ProductSession['generationState'],
  ): void {
    const result = this.database.prepare(`
      UPDATE sessions SET generation_state = ?, updated_at = ? WHERE guest_id = ? AND id = ?
    `).run(state, Date.now(), guestId, sessionId)
    if (result.changes !== 1) throw new Error('ZHIWO_SESSION_NOT_FOUND')
  }

  /**
   * Hard-delete one owned session and all cascaded messages, events, access rows, and grants.
   * @param guestId - owning guest.
   * @param sessionId - owned session.
   * @returns whether the session existed and belonged to the guest.
   */
  public deleteSession(guestId: string, sessionId: string): boolean {
    return this.database.prepare('DELETE FROM sessions WHERE guest_id = ? AND id = ?')
      .run(guestId, sessionId).changes === 1
  }

  /**
   * Hard-delete every session owned by one guest.
   * @param guestId - owning guest.
   * @returns number of removed sessions.
   */
  public deleteAllSessions(guestId: string): number {
    return Number(this.database.prepare('DELETE FROM sessions WHERE guest_id = ?').run(guestId).changes)
  }

  /**
   * Delete inactive sessions older than the retention cutoff.
   * @param cutoff - exclusive last-activity timestamp.
   * @returns number of physically removed sessions.
   */
  public deleteExpiredSessions(cutoff: number): number {
    return Number(this.database.prepare(`
      DELETE FROM sessions WHERE last_active_at < ? AND generation_state != 'running'
    `).run(cutoff).changes)
  }

  /**
   * Count inactive sessions eligible for owner retention.
   * @param cutoff - exclusive last-activity timestamp.
   * @returns number of candidate sessions without exposing owners or content.
   */
  public countExpiredSessions(cutoff: number): number {
    const row = this.database.prepare(`
      SELECT count(*) AS count FROM sessions WHERE last_active_at < ? AND generation_state != 'running'
    `).get(cutoff) as { count: number }
    return row.count
  }

  /**
   * Delete guests that own no retained session.
   * @returns number of removed guest rows.
   */
  public deleteOrphanGuests(): number {
    return Number(this.database.prepare(`
      DELETE FROM guests WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.guest_id = guests.id)
    `).run().changes)
  }

  /**
   * Count guests that own no retained session.
   * @returns number of orphan guest rows.
   */
  public countOrphanGuests(): number {
    const row = this.database.prepare(`
      SELECT count(*) AS count FROM guests
      WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.guest_id = guests.id)
    `).get() as { count: number }
    return row.count
  }

  /**
   * Run SQLite integrity, foreign-key, and schema diagnostics.
   * @returns product-safe diagnostic facts without row contents.
   */
  public diagnostics(): { schemaVersion: number; integrity: 'ok'; foreignKeyViolations: number } {
    const integrityRows = this.database.prepare('PRAGMA integrity_check').all() as unknown as Array<{
      integrity_check: string
    }>
    if (integrityRows.length !== 1 || integrityRows[0]?.integrity_check !== 'ok') {
      throw new Error('Zhiwo database integrity check failed')
    }
    const foreignKeyViolations = this.database.prepare('PRAGMA foreign_key_check').all().length
    if (foreignKeyViolations > 0) throw new Error('Zhiwo database foreign-key check failed')
    return { schemaVersion: ZHIWO_SCHEMA_VERSION, integrity: 'ok', foreignKeyViolations }
  }

  /** Close the SQLite handle after the HTTP server and agents are quiescent. */
  public close(): void {
    this.database.close()
  }
}
