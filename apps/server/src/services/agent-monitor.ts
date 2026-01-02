/**
 * Agent Monitor Service - PID-based tracking of all agent executions
 *
 * Tracks all AI agent executions with PID-based process lifecycle management.
 * Maintains a SQLite database for persistent tracking and provides
 * telemetry aggregation capabilities.
 *
 * Features:
 * - PID-based agent tracking
 * - Parent-child relationship tracking
 * - Process death detection
 * - Orphaned PID cleanup
 * - Telemetry aggregation per agent
 * - SQLite persistence
 */

import path from 'path';
import { ensureDir } from 'fs-extra';
import type { ParsedTelemetry } from '../lib/telemetry.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseType = any;

// Dynamic import for better-sqlite3 (optional dependency)
const getDatabase = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3');
  } catch {
    return null;
  }
};

/**
 * Agent status enum
 */
export type AgentStatus =
  | 'pending'
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'timeout';

/**
 * Agent record stored in the database
 */
export interface AgentRecord {
  /** Unique agent ID */
  id: string;
  /** Parent agent ID (for sub-agents) */
  parentId: string | null;
  /** Agent status */
  status: AgentStatus;
  /** Provider/engine used */
  engine: string;
  /** Model used */
  model: string;
  /** Process ID (if applicable) */
  pid: number | null;
  /** Working directory */
  workingDir: string;
  /** Feature ID (if part of a feature) */
  featureId: string | null;
  /** Beads issue ID (if part of an issue) */
  beadsId: string | null;
  /** Prompt/task description */
  prompt: string;
  /** Creation timestamp */
  createdAt: number;
  /** Start timestamp */
  startedAt: number | null;
  /** Completion timestamp */
  completedAt: number | null;
  /** Error message if failed */
  error: string | null;
  /** Aggregated telemetry */
  telemetry: ParsedTelemetry | null;
  /** Session ID for conversation continuity */
  sessionId: string | null;
  /** Additional metadata */
  metadata: Record<string, unknown> | null;
}

/**
 * Agent tree node for hierarchical display
 */
export interface AgentTreeNode extends AgentRecord {
  /** Child agents */
  children: AgentTreeNode[];
  /** Depth in tree */
  depth: number;
}

/**
 * Statistics for agents
 */
export interface AgentStats {
  /** Total agents */
  total: number;
  /** By status */
  byStatus: Record<AgentStatus, number>;
  /** By engine */
  byEngine: Record<string, number>;
  /** Total tokens consumed */
  totalTokens: {
    in: number;
    out: number;
    cached: number;
  };
  /** Total cost */
  totalCost: number;
  /** Total duration */
  totalDuration: number;
  /** Active agents */
  active: number;
}

/**
 * Tool usage record
 */
export interface ToolUsageRecord {
  /** Unique usage record ID */
  id: string;
  /** Agent ID that used the tool */
  agentId: string;
  /** Tool name (e.g., 'create_beads_issue', 'query_beads_memory', 'spawn_helper_agent') */
  toolName: string;
  /** Timestamp of usage */
  timestamp: number;
  /** Additional metadata about the tool usage */
  metadata: Record<string, unknown> | null;
}

/**
 * Tool usage statistics
 */
export interface ToolUsageStats {
  /** Tool name */
  toolName: string;
  /** Usage count */
  count: number;
  /** First used timestamp */
  firstUsed: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Number of unique agents that used this tool */
  uniqueAgents: number;
}

/**
 * Agent tool usage summary
 */
export interface AgentToolUsage {
  /** Agent ID */
  agentId: string;
  /** Tools used by this agent with counts */
  tools: Record<string, number>;
  /** Total tool usage count */
  totalUsage: number;
}

/**
 * Agent Monitor Service class
 *
 * Singleton service for tracking AI agent executions.
 */
export class AgentMonitorService {
  private db!: DatabaseType; // better-sqlite3 Database instance (loaded dynamically)
  private dbPath: string;
  private pidCheckInterval?: NodeJS.Timeout;
  private pidCheckIntervalMs = 30000; // 30 seconds

  constructor(dataDir: string) {
    this.dbPath = path.join(dataDir, 'agents.db');
  }

  /**
   * Initialize the monitor service
   *
   * Creates the database schema if needed.
   */
  async initialize(): Promise<void> {
    await ensureDir(path.dirname(this.dbPath));

    const DatabaseClass = getDatabase();
    if (!DatabaseClass) {
      throw new Error('better-sqlite3 is not installed. Agent monitoring requires better-sqlite3.');
    }

    this.db = new DatabaseClass(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.createSchema();

    // Start PID monitoring
    this.startPIDMonitoring();
  }

  /**
   * Create the database schema
   */
  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        status TEXT NOT NULL,
        engine TEXT NOT NULL,
        model TEXT NOT NULL,
        pid INTEGER,
        working_dir TEXT NOT NULL,
        feature_id TEXT,
        beads_id TEXT,
        prompt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        telemetry_json TEXT,
        session_id TEXT,
        metadata_json TEXT,
        FOREIGN KEY (parent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id);
      CREATE INDEX IF NOT EXISTS idx_agents_feature ON agents(feature_id);
      CREATE INDEX IF NOT EXISTS idx_agents_beads ON agents(beads_id);
      CREATE INDEX IF NOT EXISTS idx_agents_pid ON agents(pid);
      CREATE INDEX IF NOT EXISTS idx_agents_created ON agents(created_at);

      CREATE TABLE IF NOT EXISTS tool_usage (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tool_usage_agent ON tool_usage(agent_id);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_name ON tool_usage(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_timestamp ON tool_usage(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tool_usage_agent_name ON tool_usage(agent_id, tool_name);
    `);
  }

  /**
   * Register a new agent
   *
   * @param record Agent record to register
   * @returns The registered agent record
   */
  register(
    record: Omit<AgentRecord, 'createdAt' | 'startedAt' | 'completedAt' | 'telemetry'>
  ): AgentRecord {
    const now = Date.now();

    const fullRecord: AgentRecord = {
      ...record,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      telemetry: null,
    };

    const stmt = this.db.prepare(`
      INSERT INTO agents (
        id, parent_id, status, engine, model, pid, working_dir,
        feature_id, beads_id, prompt, created_at, started_at, completed_at,
        error, telemetry_json, session_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullRecord.id,
      fullRecord.parentId,
      fullRecord.status,
      fullRecord.engine,
      fullRecord.model,
      fullRecord.pid,
      fullRecord.workingDir,
      fullRecord.featureId,
      fullRecord.beadsId,
      fullRecord.prompt,
      fullRecord.createdAt,
      fullRecord.startedAt,
      fullRecord.completedAt,
      fullRecord.error,
      fullRecord.telemetry ? JSON.stringify(fullRecord.telemetry) : null,
      fullRecord.sessionId,
      fullRecord.metadata ? JSON.stringify(fullRecord.metadata) : null
    );

    return fullRecord;
  }

  /**
   * Mark an agent as started
   *
   * @param id Agent ID
   * @param pid Process ID (optional)
   * @returns Updated agent record or null
   */
  start(id: string, pid?: number): AgentRecord | null {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = 'running', started_at = ?, pid = ?
      WHERE id = ?
    `);

    const result = stmt.run(Date.now(), pid ?? null, id);

    if (result.changes === 0) {
      return null;
    }

    return this.getAgent(id);
  }

  /**
   * Mark an agent as completed
   *
   * @param id Agent ID
   * @param telemetry Optional telemetry data
   * @returns Updated agent record or null
   */
  complete(id: string, telemetry?: ParsedTelemetry): AgentRecord | null {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = 'completed', completed_at = ?, telemetry_json = ?
      WHERE id = ?
    `);

    const result = stmt.run(Date.now(), telemetry ? JSON.stringify(telemetry) : null, id);

    if (result.changes === 0) {
      return null;
    }

    return this.getAgent(id);
  }

  /**
   * Mark an agent as failed
   *
   * @param id Agent ID
   * @param error Error message
   * @returns Updated agent record or null
   */
  fail(id: string, error: string): AgentRecord | null {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = 'failed', completed_at = ?, error = ?
      WHERE id = ?
    `);

    const result = stmt.run(Date.now(), error, id);

    if (result.changes === 0) {
      return null;
    }

    return this.getAgent(id);
  }

  /**
   * Mark an agent as aborted
   *
   * @param id Agent ID
   * @returns Updated agent record or null
   */
  abort(id: string): AgentRecord | null {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = 'aborted', completed_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(Date.now(), id);

    if (result.changes === 0) {
      return null;
    }

    return this.getAgent(id);
  }

  /**
   * Update agent status
   *
   * @param id Agent ID
   * @param status New status
   * @returns Updated agent record or null
   */
  updateStatus(id: string, status: AgentStatus): AgentRecord | null {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = ?
      WHERE id = ?
    `);

    const result = stmt.run(status, id);

    if (result.changes === 0) {
      return null;
    }

    return this.getAgent(id);
  }

  /**
   * Add telemetry to an agent
   *
   * Uses an atomic UPDATE to avoid race conditions when multiple
   * threads/processes add telemetry concurrently.
   *
   * @param id Agent ID
   * @param telemetry Telemetry data
   * @returns Success status
   */
  addTelemetry(id: string, telemetry: ParsedTelemetry): boolean {
    // Use an atomic UPDATE with JSON extraction/aggregation
    // This avoids the read-modify-write race condition
    const stmt = this.db.prepare(`
      UPDATE agents
      SET telemetry_json = json_set(
        COALESCE(telemetry_json, '{"tokensIn":0,"tokensOut":0,"cached":0,"cost":0,"duration":0}'),
        '$.tokensIn',
        COALESCE(json_extract(telemetry_json, '$.tokensIn'), 0) + ?
      ),
      telemetry_json = json_set(
        telemetry_json,
        '$.tokensOut',
        json_extract(telemetry_json, '$.tokensOut') + ?
      ),
      telemetry_json = json_set(
        telemetry_json,
        '$.cached',
        json_extract(telemetry_json, '$.cached') + ?
      ),
      telemetry_json = json_set(
        telemetry_json,
        '$.cost',
        json_extract(telemetry_json, '$.cost') + ?
      ),
      telemetry_json = json_set(
        telemetry_json,
        '$.duration',
        json_extract(telemetry_json, '$.duration') + ?
      )
      WHERE id = ?
    `);

    const result = stmt.run(
      telemetry.tokensIn,
      telemetry.tokensOut,
      telemetry.cached,
      telemetry.cost,
      telemetry.duration,
      id
    );
    return result.changes > 0;
  }

  /**
   * Get an agent by ID
   *
   * @param id Agent ID
   * @returns Agent record or null
   */
  getAgent(id: string): AgentRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `);

    const row = stmt.get(id) as unknown;
    return this.rowToAgent(row);
  }

  /**
   * Get all agents with optional filtering
   *
   * @param filters Optional filters
   * @returns Array of agent records
   */
  getAgents(filters?: {
    status?: AgentStatus;
    engine?: string;
    featureId?: string;
    beadsId?: string;
    parentId?: string;
    limit?: number;
    offset?: number;
  }): AgentRecord[] {
    let query = 'SELECT * FROM agents WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.engine) {
      query += ' AND engine = ?';
      params.push(filters.engine);
    }

    if (filters?.featureId) {
      query += ' AND feature_id = ?';
      params.push(filters.featureId);
    }

    if (filters?.beadsId) {
      query += ' AND beads_id = ?';
      params.push(filters.beadsId);
    }

    if (filters?.parentId !== undefined) {
      if (filters.parentId === null) {
        query += ' AND parent_id IS NULL';
      } else {
        query += ' AND parent_id = ?';
        params.push(filters.parentId);
      }
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);

      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown[];
    return rows.map((r) => this.rowToAgent(r)).filter((r): r is AgentRecord => r !== null);
  }

  /**
   * Get agent tree (hierarchical view)
   *
   * @param rootId Root agent ID (undefined for all trees)
   * @returns Array of tree nodes
   */
  getAgentTree(rootId?: string): AgentTreeNode[] {
    // Get root agents
    const roots =
      rootId !== undefined ? [this.getAgent(rootId)] : this.getAgents({ parentId: undefined });

    return roots
      .filter((r): r is AgentRecord => r !== null)
      .map((root) => this.buildTreeNode(root, 0));
  }

  /**
   * Build a tree node with children
   *
   * @param agent Agent record
   * @param depth Current depth
   * @returns Tree node
   */
  private buildTreeNode(agent: AgentRecord, depth: number): AgentTreeNode {
    const children = this.getAgents({ parentId: agent.id }).map((child) =>
      this.buildTreeNode(child, depth + 1)
    );

    return {
      ...agent,
      children,
      depth,
    };
  }

  /**
   * Get agent statistics
   *
   * @returns Agent statistics
   */
  getStats(): AgentStats {
    const allAgents = this.getAgents();

    const stats: AgentStats = {
      total: allAgents.length,
      byStatus: {
        pending: 0,
        starting: 0,
        running: 0,
        completed: 0,
        failed: 0,
        aborted: 0,
        timeout: 0,
      },
      byEngine: {},
      totalTokens: {
        in: 0,
        out: 0,
        cached: 0,
      },
      totalCost: 0,
      totalDuration: 0,
      active: 0,
    };

    for (const agent of allAgents) {
      // Count by status
      stats.byStatus[agent.status]++;

      // Count by engine
      stats.byEngine[agent.engine] = (stats.byEngine[agent.engine] || 0) + 1;

      // Aggregate telemetry
      if (agent.telemetry) {
        stats.totalTokens.in += agent.telemetry.tokensIn;
        stats.totalTokens.out += agent.telemetry.tokensOut;
        stats.totalTokens.cached += agent.telemetry.cached;
        stats.totalCost += agent.telemetry.cost;
        stats.totalDuration += agent.telemetry.duration;
      }

      // Count active agents
      if (agent.status === 'running' || agent.status === 'starting') {
        stats.active++;
      }
    }

    return stats;
  }

  /**
   * Clean up old agent records
   *
   * @param olderThan Delete records older than this timestamp
   * @returns Number of records deleted
   */
  cleanup(olderThan: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM agents WHERE created_at < ?
    `);

    const result = stmt.run(olderThan);
    return result.changes;
  }

  /**
   * Start PID monitoring to detect dead processes
   */
  private startPIDMonitoring(): void {
    if (this.pidCheckInterval) {
      return;
    }

    this.pidCheckInterval = setInterval(() => {
      this.checkDeadProcesses();
    }, this.pidCheckIntervalMs);
  }

  /**
   * Stop PID monitoring
   */
  stopPIDMonitoring(): void {
    if (this.pidCheckInterval) {
      clearInterval(this.pidCheckInterval);
      this.pidCheckInterval = undefined;
    }
  }

  /**
   * Check for dead processes and mark agents as failed
   */
  private checkDeadProcesses(): void {
    const runningAgents = this.getAgents({ status: 'running' });

    for (const agent of runningAgents) {
      if (agent.pid !== null) {
        if (!this.isProcessAlive(agent.pid)) {
          console.warn(
            `[AgentMonitor] Detected dead process for agent ${agent.id} (PID ${agent.pid})`
          );
          this.fail(agent.id, `Process ${agent.pid} died unexpectedly`);
        }
      }
    }

    // Clean up orphaned PIDs
    this.cleanupOrphanedPIDs();
  }

  /**
   * Check if a process is alive
   *
   * @param pid Process ID
   * @returns Whether the process is alive
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // Send signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up orphaned PIDs (agents marked as running but no process)
   *
   * Fetches all running agents with PIDs and checks if each process
   * is still alive. Marks agents with dead processes as failed.
   */
  private cleanupOrphanedPIDs(): void {
    const runningAgents = this.getAgents({ status: 'running' });
    const now = Date.now();

    for (const agent of runningAgents) {
      if (agent.pid !== null) {
        // Check if the process is still alive
        if (!this.isProcessAlive(agent.pid)) {
          // Process is dead - mark agent as failed
          const stmt = this.db.prepare(`
            UPDATE agents
            SET status = 'failed', error = 'Process orphaned', completed_at = ?
            WHERE id = ?
          `);
          stmt.run(now, agent.id);
        }
      }
    }
  }

  /**
   * Convert a database row to an AgentRecord
   *
   * @param row Database row
   * @returns Agent record or null
   */
  private rowToAgent(row: unknown): AgentRecord | null {
    if (!row || typeof row !== 'object') {
      return null;
    }

    const r = row as Record<string, unknown>;

    return {
      id: String(r.id ?? ''),
      parentId: r.parent_id ? String(r.parent_id) : null,
      status: (r.status ?? 'pending') as AgentStatus,
      engine: String(r.engine ?? ''),
      model: String(r.model ?? ''),
      pid: r.pid !== null ? Number(r.pid) : null,
      workingDir: String(r.working_dir ?? ''),
      featureId: r.feature_id ? String(r.feature_id) : null,
      beadsId: r.beads_id ? String(r.beads_id) : null,
      prompt: String(r.prompt ?? ''),
      createdAt: Number(r.created_at ?? 0),
      startedAt: r.started_at !== null ? Number(r.started_at) : null,
      completedAt: r.completed_at !== null ? Number(r.completed_at) : null,
      error: r.error !== null ? String(r.error) : null,
      telemetry: r.telemetry_json
        ? (JSON.parse(String(r.telemetry_json)) as ParsedTelemetry)
        : null,
      sessionId: r.session_id ? String(r.session_id) : null,
      metadata: r.metadata_json
        ? (JSON.parse(String(r.metadata_json)) as Record<string, unknown>)
        : null,
    };
  }

  /**
   * Track tool usage by an agent
   *
   * Records when an agent uses a specific tool (e.g., Beads tools).
   * Uses atomic operation to prevent race conditions.
   *
   * @param agentId Agent ID that used the tool
   * @param toolName Tool name (e.g., 'create_beads_issue', 'query_beads_memory', 'spawn_helper_agent')
   * @param metadata Optional metadata about the tool usage
   * @returns The created tool usage record ID, or null if agent not found
   */
  trackToolUsage(
    agentId: string,
    toolName: string,
    metadata?: Record<string, unknown>
  ): string | null {
    // Verify agent exists
    const agent = this.getAgent(agentId);
    if (!agent) {
      console.warn(`[AgentMonitor] Cannot track tool usage: agent ${agentId} not found`);
      return null;
    }

    // Generate unique usage record ID
    const usageId = `${agentId}-${toolName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO tool_usage (id, agent_id, tool_name, timestamp, metadata_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(usageId, agentId, toolName, timestamp, metadata ? JSON.stringify(metadata) : null);
      return usageId;
    } catch (error) {
      console.error(`[AgentMonitor] Failed to track tool usage:`, error);
      return null;
    }
  }

  /**
   * Get tool usage statistics for all tools
   *
   * Returns aggregated statistics about tool usage across all agents.
   *
   * @returns Array of tool usage statistics sorted by usage count (descending)
   */
  getToolUsageStats(): ToolUsageStats[] {
    const stmt = this.db.prepare(`
      SELECT
        tool_name,
        COUNT(*) as count,
        MIN(timestamp) as first_used,
        MAX(timestamp) as last_used,
        COUNT(DISTINCT agent_id) as unique_agents
      FROM tool_usage
      GROUP BY tool_name
      ORDER BY count DESC
    `);

    const rows = stmt.all() as unknown[];
    return rows
      .map((r) => this.rowToToolUsageStats(r))
      .filter((r): r is ToolUsageStats => r !== null);
  }

  /**
   * Get tool usage for a specific agent
   *
   * Returns detailed information about which tools an agent has used.
   *
   * @param agentId Agent ID
   * @returns Agent tool usage summary, or null if agent not found
   */
  getAgentToolUsage(agentId: string): AgentToolUsage | null {
    // Verify agent exists
    const agent = this.getAgent(agentId);
    if (!agent) {
      return null;
    }

    const stmt = this.db.prepare(`
      SELECT tool_name, COUNT(*) as count
      FROM tool_usage
      WHERE agent_id = ?
      GROUP BY tool_name
      ORDER BY count DESC
    `);

    const rows = stmt.all(agentId) as unknown[];
    const tools: Record<string, number> = {};
    let totalUsage = 0;

    for (const row of rows) {
      if (row && typeof row === 'object') {
        const r = row as Record<string, unknown>;
        const toolName = String(r.tool_name ?? '');
        const count = Number(r.count ?? 0);
        tools[toolName] = count;
        totalUsage += count;
      }
    }

    return {
      agentId,
      tools,
      totalUsage,
    };
  }

  /**
   * Get most frequently used tools
   *
   * Returns the most frequently used tools across all agents.
   *
   * @param limit Maximum number of tools to return (default: 10)
   * @returns Array of tool usage statistics
   */
  getMostUsedTools(limit: number = 10): ToolUsageStats[] {
    const stats = this.getToolUsageStats();
    return stats.slice(0, limit);
  }

  /**
   * Get tool usage history for a specific agent
   *
   * Returns chronological history of tool usage for an agent.
   *
   * @param agentId Agent ID
   * @param toolName Optional tool name filter
   * @param limit Maximum number of records to return (default: 100)
   * @returns Array of tool usage records
   */
  getToolUsageHistory(agentId: string, toolName?: string, limit: number = 100): ToolUsageRecord[] {
    let query = 'SELECT * FROM tool_usage WHERE agent_id = ?';
    const params: unknown[] = [agentId];

    if (toolName) {
      query += ' AND tool_name = ?';
      params.push(toolName);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown[];
    return rows.map((r) => this.rowToToolUsage(r)).filter((r): r is ToolUsageRecord => r !== null);
  }

  /**
   * Get tool usage records by tool name
   *
   * Returns all usage records for a specific tool across all agents.
   *
   * @param toolName Tool name
   * @param limit Maximum number of records to return (default: 100)
   * @returns Array of tool usage records
   */
  getToolUsageByName(toolName: string, limit: number = 100): ToolUsageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tool_usage
      WHERE tool_name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(toolName, limit) as unknown[];
    return rows.map((r) => this.rowToToolUsage(r)).filter((r): r is ToolUsageRecord => r !== null);
  }

  /**
   * Get recent tool usage across all agents
   *
   * Returns the most recent tool usage records.
   *
   * @param limit Maximum number of records to return (default: 50)
   * @param toolName Optional tool name filter
   * @returns Array of tool usage records
   */
  getRecentToolUsage(limit: number = 50, toolName?: string): ToolUsageRecord[] {
    let query = 'SELECT * FROM tool_usage';
    const params: unknown[] = [];

    if (toolName) {
      query += ' WHERE tool_name = ?';
      params.push(toolName);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as unknown[];
    return rows.map((r) => this.rowToToolUsage(r)).filter((r): r is ToolUsageRecord => r !== null);
  }

  /**
   * Delete tool usage records for an agent
   *
   * Removes all tool usage records associated with an agent.
   * Called automatically when an agent is deleted due to CASCADE.
   *
   * @param agentId Agent ID
   * @returns Number of records deleted
   */
  deleteToolUsageForAgent(agentId: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM tool_usage WHERE agent_id = ?
    `);

    const result = stmt.run(agentId);
    return result.changes;
  }

  /**
   * Clean up old tool usage records
   *
   * Removes tool usage records older than the specified timestamp.
   *
   * @param olderThan Delete records older than this timestamp
   * @returns Number of records deleted
   */
  cleanupToolUsage(olderThan: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM tool_usage WHERE timestamp < ?
    `);

    const result = stmt.run(olderThan);
    return result.changes;
  }

  /**
   * Convert a database row to ToolUsageRecord
   *
   * @param row Database row
   * @returns Tool usage record or null
   */
  private rowToToolUsage(row: unknown): ToolUsageRecord | null {
    if (!row || typeof row !== 'object') {
      return null;
    }

    const r = row as Record<string, unknown>;

    return {
      id: String(r.id ?? ''),
      agentId: String(r.agent_id ?? ''),
      toolName: String(r.tool_name ?? ''),
      timestamp: Number(r.timestamp ?? 0),
      metadata: r.metadata_json
        ? (JSON.parse(String(r.metadata_json)) as Record<string, unknown>)
        : null,
    };
  }

  /**
   * Convert a database row to ToolUsageStats
   *
   * @param row Database row
   * @returns Tool usage stats or null
   */
  private rowToToolUsageStats(row: unknown): ToolUsageStats | null {
    if (!row || typeof row !== 'object') {
      return null;
    }

    const r = row as Record<string, unknown>;

    return {
      toolName: String(r.tool_name ?? ''),
      count: Number(r.count ?? 0),
      firstUsed: Number(r.first_used ?? 0),
      lastUsed: Number(r.last_used ?? 0),
      uniqueAgents: Number(r.unique_agents ?? 0),
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.stopPIDMonitoring();
    this.db.close();
  }

  /**
   * Get active agents (running or starting)
   *
   * @returns Array of active agent records
   */
  getActiveAgents(): AgentRecord[] {
    return [...this.getAgents({ status: 'running' }), ...this.getAgents({ status: 'starting' })];
  }

  /**
   * Get agents by feature ID
   *
   * @param featureId Feature ID
   * @returns Array of agent records
   */
  getAgentsByFeature(featureId: string): AgentRecord[] {
    return this.getAgents({ featureId });
  }

  /**
   * Get agents by Beads issue ID
   *
   * @param beadsId Beads issue ID
   * @returns Array of agent records
   */
  getAgentsByBeadsIssue(beadsId: string): AgentRecord[] {
    return this.getAgents({ beadsId });
  }

  /**
   * Get child agents of a parent
   *
   * @param parentId Parent agent ID
   * @returns Array of child agent records
   */
  getChildAgents(parentId: string): AgentRecord[] {
    return this.getAgents({ parentId });
  }

  /**
   * Update agent metadata
   *
   * @param id Agent ID
   * @param metadata Metadata to update
   * @returns Success status
   */
  updateMetadata(id: string, metadata: Record<string, unknown>): boolean {
    const existing = this.getAgent(id);

    if (!existing) {
      return false;
    }

    const merged = { ...existing.metadata, ...metadata };

    const stmt = this.db.prepare(`
      UPDATE agents
      SET metadata_json = ?
      WHERE id = ?
    `);

    const result = stmt.run(JSON.stringify(merged), id);
    return result.changes > 0;
  }

  /**
   * Delete an agent record
   *
   * @param id Agent ID
   * @returns Success status
   */
  deleteAgent(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM agents WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Set the PID check interval
   *
   * @param ms Interval in milliseconds
   */
  setPIDCheckInterval(ms: number): void {
    this.pidCheckIntervalMs = ms;
    if (this.pidCheckInterval) {
      this.stopPIDMonitoring();
      this.startPIDMonitoring();
    }
  }
}

/**
 * Singleton instance (will be initialized with data directory)
 */
let agentMonitorInstance: AgentMonitorService | null = null;

/**
 * Get or create the agent monitor singleton
 *
 * @param dataDir Data directory for the database
 * @returns Agent monitor service instance
 */
export function getAgentMonitor(dataDir: string): AgentMonitorService {
  if (!agentMonitorInstance || agentMonitorInstance['dbPath'] !== path.join(dataDir, 'agents.db')) {
    agentMonitorInstance = new AgentMonitorService(dataDir);
  }
  return agentMonitorInstance;
}

/**
 * Initialize the agent monitor service
 *
 * @param dataDir Data directory for the database
 * @returns Initialized agent monitor service
 */
export async function initializeAgentMonitor(dataDir: string): Promise<AgentMonitorService> {
  const monitor = getAgentMonitor(dataDir);
  await monitor.initialize();
  return monitor;
}
