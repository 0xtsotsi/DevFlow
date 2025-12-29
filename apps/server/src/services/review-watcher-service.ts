/**
 * ReviewWatcherService - Provides convenient interface for VibeKanban MCP operations
 * This service serves as a documentation and type-safe wrapper for VibeKanban MCP tools
 * The actual MCP tool calls are made by Claude Code when executing tasks
 */

import type { EventEmitter } from '../lib/events.js';

// VibeKanban MCP server type definitions
export interface MCPProject {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface MCPTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
  created_at: string;
  updated_at: string;
  has_in_progress_attempt?: boolean;
  last_attempt_failed?: boolean;
}

export interface MCPRepo {
  id: string;
  name: string;
  project_id: string;
}

export interface ListTasksOptions {
  status?: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
  limit?: number;
}

export interface CreateTaskOptions {
  projectId: string;
  title: string;
  description?: string;
}

export interface UpdateTaskOptions {
  taskId: string;
  title?: string;
  description?: string;
  status?: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
}

export interface StartWorkspaceSessionOptions {
  taskId: string;
  executor: 'CLAUDE_CODE' | 'CODEX' | 'GEMINI' | 'CURSOR_AGENT' | 'OPENCODE';
  variant?: string;
  repos: Array<{
    repo_id: string;
    base_branch: string;
  }>;
}

/**
 * ReviewWatcherService - Provides type definitions and documentation for VibeKanban MCP integration
 *
 * This service documents the available VibeKanban MCP tools and their usage.
 * The actual MCP tool calls are made directly by Claude Code using the mcp__vibe_kanban__* tools.
 *
 * Available MCP Tools:
 * - mcp__vibe_kanban__list_projects: List all available projects
 * - mcp__vibe_kanban__list_tasks: List tasks in a project with optional filters
 * - mcp__vibe_kanban__get_task: Get detailed task information
 * - mcp__vibe_kanban__create_task: Create a new task
 * - mcp__vibe_kanban__update_task: Update task title, description, or status
 * - mcp__vibe_kanban__delete_task: Delete a task
 * - mcp__vibe_kanban__list_repos: List repositories for a project
 * - mcp__vibe_kanban__start_workspace_session: Start a workspace session for a task
 */
export class ReviewWatcherService {
  private events: EventEmitter;
  private initialized: boolean = false;

  constructor(events: EventEmitter) {
    this.events = events;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('[ReviewWatcherService] Initialized - VibeKanban MCP tools available');
    console.log('[ReviewWatcherService] Available MCP tools:');
    console.log('  - mcp__vibe_kanban__list_projects');
    console.log('  - mcp__vibe_kanban__list_tasks');
    console.log('  - mcp__vibe_kanban__get_task');
    console.log('  - mcp__vibe_kanban__create_task');
    console.log('  - mcp__vibe_kanban__update_task');
    console.log('  - mcp__vibe_kanban__delete_task');
    console.log('  - mcp__vibe_kanban__list_repos');
    console.log('  - mcp__vibe_kanban__start_workspace_session');
  }

  /**
   * List all available projects from VibeKanban
   *
   * Usage: Call mcp__vibe_kanban__list_projects MCP tool
   * Returns: Array of MCPProject objects
   */
  async listProjects(): Promise<MCPProject[]> {
    this.ensureInitialized();
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__list_projects MCP tool directly.'
    );
  }

  /**
   * List all tasks in a project with optional filtering
   *
   * Usage: Call mcp__vibe_kanban__list_tasks MCP tool with:
   *   - project_id (required): UUID of the project
   *   - status (optional): 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled'
   *   - limit (optional): Maximum number of tasks to return (default: 50)
   *
   * Returns: Array of MCPTask objects
   */
  async listTasks(projectId: string, options?: ListTasksOptions): Promise<MCPTask[]> {
    this.ensureInitialized();
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__list_tasks MCP tool directly.'
    );
  }

  /**
   * Get detailed information about a specific task
   *
   * Usage: Call mcp__vibe_kanban__get_task MCP tool with:
   *   - task_id (required): UUID of the task
   *
   * Returns: MCPTask object with full details
   */
  async getTask(taskId: string): Promise<MCPTask> {
    this.ensureInitialized();
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__get_task MCP tool directly.'
    );
  }

  /**
   * Create a new task in a project
   *
   * Usage: Call mcp__vibe_kanban__create_task MCP tool with:
   *   - project_id (required): UUID of the project
   *   - title (required): Task title
   *   - description (optional): Task description
   *
   * Returns: Created MCPTask object
   */
  async createTask(options: CreateTaskOptions): Promise<MCPTask> {
    this.ensureInitialized();
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__create_task MCP tool directly.'
    );
  }

  /**
   * Update an existing task
   *
   * Usage: Call mcp__vibe_kanban__update_task MCP tool with:
   *   - task_id (required): UUID of the task
   *   - title (optional): New title
   *   - description (optional): New description
   *   - status (optional): New status
   *
   * Returns: Updated MCPTask object
   */
  async updateTask(options: UpdateTaskOptions): Promise<MCPTask> {
    this.ensureInitialized();
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__update_task MCP tool directly.'
    );
  }

  /**
   * Delete a task from a project
   *
   * Usage: Call mcp__vibe_kanban__delete_task MCP tool with:
   *   - task_id (required): UUID of the task
   */
  async deleteTask(taskId: string): Promise<void> {
    this.ensureInitialized();
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__delete_task MCP tool directly.'
    );
  }

  /**
   * List repositories for a project
   *
   * Usage: Call mcp__vibe_kanban__list_repos MCP tool with:
   *   - project_id (required): UUID of the project
   *
   * Returns: Array of MCPRepo objects
   */
  async listRepos(projectId: string): Promise<MCPRepo[]> {
    this.ensureInitialized();
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__list_repos MCP tool directly.'
    );
  }

  /**
   * Start a workspace session for a task
   *
   * Usage: Call mcp__vibe_kanban__start_workspace_session MCP tool with:
   *   - task_id (required): UUID of the task
   *   - executor (required): 'CLAUDE_CODE' | 'CODEX' | 'GEMINI' | 'CURSOR_AGENT' | 'OPENCODE'
   *   - variant (optional): Executor variant
   *   - repos (required): Array of {repo_id, base_branch} objects
   *
   * Returns: Workspace session information
   */
  async startWorkspaceSession(options: StartWorkspaceSessionOptions): Promise<any> {
    this.ensureInitialized();
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__start_workspace_session MCP tool directly.'
    );
  }

  /**
   * Helper method to validate project ID format
   */
  validateProjectId(projectId: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(projectId);
  }

  /**
   * Helper method to validate task ID format
   */
  validateTaskId(taskId: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(taskId);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ReviewWatcherService is not initialized');
    }
  }
}

// Export type definitions for use in other parts of the application
export type {
  MCPProject,
  MCPTask,
  MCPRepo,
  ListTasksOptions,
  CreateTaskOptions,
  UpdateTaskOptions,
  StartWorkspaceSessionOptions,
};
