/**
 * ReviewWatcherService - Provides convenient interface for VibeKanban MCP operations
 *
 * This service serves as a documentation and type-safe wrapper for VibeKanban MCP tools.
 * The actual MCP tool calls are made by Claude Code when executing tasks.
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

import type { EventEmitter } from '../lib/events.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * VibeKanban Project representation
 */
export interface MCPProject {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/**
 * VibeKanban Task representation
 */
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

/**
 * VibeKanban Repository representation
 */
export interface MCPRepo {
  id: string;
  name: string;
  project_id: string;
}

/**
 * Options for listing tasks
 */
export interface ListTasksOptions {
  status?: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
  limit?: number;
}

/**
 * Options for creating a task
 */
export interface CreateTaskOptions {
  projectId: string;
  title: string;
  description?: string;
}

/**
 * Options for updating a task
 */
export interface UpdateTaskOptions {
  taskId: string;
  title?: string;
  description?: string;
  status?: 'todo' | 'inprogress' | 'inreview' | 'done' | 'cancelled';
}

/**
 * Options for starting a workspace session
 */
export interface StartWorkspaceSessionOptions {
  taskId: string;
  executor: 'CLAUDE_CODE' | 'CODEX' | 'GEMINI' | 'CURSOR_AGENT' | 'OPENCODE';
  variant?: string;
  repos: Array<{
    repo_id: string;
    base_branch: string;
  }>;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * ReviewWatcherService - Provides type definitions and documentation for VibeKanban MCP integration
 *
 * This service documents the available VibeKanban MCP tools and their usage.
 * The actual MCP tool calls are made directly by Claude Code using the mcp__vibe_kanban__* tools.
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

    this.events.emit('review-watcher:started', {
      timestamp: Date.now(),
      message: 'ReviewWatcherService initialized',
    });
  }

  /**
   * Validate UUID format
   */
  isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * List all available projects from VibeKanban
   *
   * Usage: Call mcp__vibe_kanban__list_projects MCP tool
   * Returns: Array of MCPProject objects
   *
   * @example
   * const projects = await vibeKanbanListProjects();
   * // Returns: [{ id: "uuid", name: "DevFlow", created_at: "...", updated_at: "..." }]
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
   *
   * @example
   * const tasks = await vibeKanbanListTasks({
   *   project_id: "uuid",
   *   status: "todo",
   *   limit: 10
   * });
   */
  async listTasks(projectId: string, _options?: ListTasksOptions): Promise<MCPTask[]> {
    this.ensureInitialized();
    if (!this.isValidUUID(projectId)) {
      throw new Error(`Invalid project ID format: ${projectId}`);
    }
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
   * Returns: MCPTask object with full details including description
   *
   * @example
   * const task = await vibeKanbanGetTask("task-uuid");
   * // Returns: { id: "...", title: "...", description: "...", status: "..." }
   */
  async getTask(taskId: string): Promise<MCPTask> {
    this.ensureInitialized();
    if (!this.isValidUUID(taskId)) {
      throw new Error(`Invalid task ID format: ${taskId}`);
    }
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
   *   - description (optional): Task description (supports markdown)
   *
   * Returns: Created MCPTask object
   *
   * @example
   * const task = await vibeKanbanCreateTask({
   *   project_id: "uuid",
   *   title: "Implement feature X",
   *   description: "## Acceptance Criteria\n- [ ] Criterion 1\n- [ ] Criterion 2"
   * });
   */
  async createTask(options: CreateTaskOptions): Promise<MCPTask> {
    this.ensureInitialized();
    if (!this.isValidUUID(options.projectId)) {
      throw new Error(`Invalid project ID format: ${options.projectId}`);
    }
    if (!options.title || options.title.trim().length === 0) {
      throw new Error('Task title is required');
    }
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__create_task MCP tool directly.'
    );
  }

  /**
   * Update an existing task
   *
   * Usage: Call mcp__vibe_kanban__update_task MCP tool with:
   *   - task_id (required): UUID of the task
   *   - title (optional): New task title
   *   - description (optional): New task description
   *   - status (optional): New status
   *
   * Returns: void (success indicated by no error)
   *
   * @example
   * await vibeKanbanUpdateTask({
   *   task_id: "uuid",
   *   status: "inprogress",
   *   description: "Updated description"
   * });
   */
  async updateTask(options: UpdateTaskOptions): Promise<void> {
    this.ensureInitialized();
    if (!this.isValidUUID(options.taskId)) {
      throw new Error(`Invalid task ID format: ${options.taskId}`);
    }
    if (!options.title && !options.description && !options.status) {
      throw new Error('At least one update field must be provided');
    }
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__update_task MCP tool directly.'
    );
  }

  /**
   * Delete a task
   *
   * Usage: Call mcp__vibe_kanban__delete_task MCP tool with:
   *   - task_id (required): UUID of the task
   *
   * Returns: void (success indicated by no error)
   *
   * @example
   * await vibeKanbanDeleteTask("task-uuid");
   */
  async deleteTask(taskId: string): Promise<void> {
    this.ensureInitialized();
    if (!this.isValidUUID(taskId)) {
      throw new Error(`Invalid task ID format: ${taskId}`);
    }
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
   *
   * @example
   * const repos = await vibeKanbanListRepos("project-uuid");
   * // Returns: [{ id: "...", name: "DevFlow", project_id: "..." }]
   */
  async listRepos(projectId: string): Promise<MCPRepo[]> {
    this.ensureInitialized();
    if (!this.isValidUUID(projectId)) {
      throw new Error(`Invalid project ID format: ${projectId}`);
    }
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__list_repos MCP tool directly.'
    );
  }

  /**
   * Start a workspace session for a task
   *
   * This launches a new workspace session where an agent can work on the task.
   *
   * Usage: Call mcp__vibe_kanban__start_workspace_session MCP tool with:
   *   - task_id (required): UUID of the task
   *   - executor (required): Executor type ('CLAUDE_CODE' | 'CODEX' | 'GEMINI' | 'CURSOR_AGENT' | 'OPENCODE')
   *   - variant (optional): Executor variant
   *   - repos (required): Array of { repo_id, base_branch }
   *
   * Returns: void (session started asynchronously)
   *
   * @example
   * await vibeKanbanStartWorkspaceSession({
   *   task_id: "uuid",
   *   executor: "CLAUDE_CODE",
   *   repos: [{ repo_id: "repo-uuid", base_branch: "main" }]
   * });
   */
  async startWorkspaceSession(options: StartWorkspaceSessionOptions): Promise<void> {
    this.ensureInitialized();
    if (!this.isValidUUID(options.taskId)) {
      throw new Error(`Invalid task ID format: ${options.taskId}`);
    }
    const validExecutors = ['CLAUDE_CODE', 'CODEX', 'GEMINI', 'CURSOR_AGENT', 'OPENCODE'];
    if (!validExecutors.includes(options.executor)) {
      throw new Error(
        `Invalid executor: ${options.executor}. Must be one of: ${validExecutors.join(', ')}`
      );
    }
    if (!options.repos || options.repos.length === 0) {
      throw new Error('At least one repository must be specified');
    }
    for (const repo of options.repos) {
      if (!this.isValidUUID(repo.repo_id)) {
        throw new Error(`Invalid repo_id format: ${repo.repo_id}`);
      }
    }
    throw new Error(
      'This method is a placeholder. Use the mcp__vibe_kanban__start_workspace_session MCP tool directly.'
    );
  }

  /**
   * Parse task description to extract structured data
   *
   * Extracts common patterns from task descriptions:
   * - Acceptance criteria (checkboxes)
   * - Parent task references
   * - Tags/labels
   * - Title from headers
   */
  parseTaskDescription(description: string): {
    title: string;
    body: string;
    tags: string[];
    parentTask?: string;
    acceptanceCriteria: string[];
  } {
    const lines = description.split('\n');
    let title = '';
    let body = '';
    const tags: string[] = [];
    let parentTask: string | undefined;
    const acceptanceCriteria: string[] = [];
    let inCriteria = false;

    for (const line of lines) {
      if (line.startsWith('# ')) {
        title = line.substring(2).trim();
      } else if (line.startsWith('**Parent Task:**')) {
        const match = line.match(/\*\*Parent Task:\*\* ([a-f0-9-]+)/i);
        if (match) {
          parentTask = match[1];
        }
      } else if (line.startsWith('**Tags:**')) {
        const tagMatch = line.match(/\*\*Tags:\*\*(.+)/i);
        if (tagMatch) {
          tags.push(...tagMatch[1].split(',').map((t) => t.trim().replace(/^@/, '')));
        }
      } else if (line.startsWith('## Acceptance Criteria')) {
        inCriteria = true;
      } else if (inCriteria && line.startsWith('- ')) {
        acceptanceCriteria.push(line.substring(2).trim());
      } else if (inCriteria && line.match(/^##?\s/)) {
        inCriteria = false;
      } else {
        body += line + '\n';
      }
    }

    return {
      title: title || 'Untitled',
      body: body.trim(),
      tags,
      parentTask,
      acceptanceCriteria,
    };
  }

  /**
   * Get task status color for UI display
   */
  getStatusColor(status: MCPTask['status']): string {
    const colors: Record<MCPTask['status'], string> = {
      todo: 'gray',
      inprogress: 'blue',
      inreview: 'yellow',
      done: 'green',
      cancelled: 'red',
    };
    return colors[status];
  }

  /**
   * Check if a task is in a terminal state
   */
  isTaskTerminal(status: MCPTask['status']): boolean {
    return status === 'done' || status === 'cancelled';
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ReviewWatcherService not initialized. Call initialize() first.');
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    this.initialized = false;
    this.events.emit('review-watcher:stopped', {
      timestamp: Date.now(),
      message: 'ReviewWatcherService stopped',
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  MCPProject,
  MCPTask,
  MCPRepo,
  ListTasksOptions,
  CreateTaskOptions,
  UpdateTaskOptions,
  StartWorkspaceSessionOptions,
};
