/**
 * DevFlow API Client
 *
 * HTTP client for communicating with the DevFlow server.
 */

import type { DevFlowMCPServerConfig } from './config.js';

export interface DevFlowResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionInfo {
  sessionId: string;
  workingDirectory: string;
  isRunning: boolean;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FeatureInfo {
  id: string;
  title: string;
  status: string;
  type: string;
  priority?: number;
  description?: string;
  featurePath?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'blocked' | 'closed';
  type: 'bug' | 'feature' | 'task' | 'epic' | 'chore';
  priority: number;
  labels: string[];
  dependencies?: Array<{
    issueId?: string;
    type?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export class DevFlowClient {
  private config: DevFlowMCPServerConfig;

  constructor(config: DevFlowMCPServerConfig) {
    this.config = config;
  }

  /**
   * Make an API request to DevFlow server
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<DevFlowResponse<T>> {
    const url = `${this.config.serverUrl}${endpoint}`;
    const timeout = this.config.timeout || 30000;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
      ...options.headers,
    };

    let lastError: Error | null = null;
    const maxRetries = this.config.maxRetries || 3;
    const retryDelay = this.config.retryDelay || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort (timeout) or if we've exhausted retries
        if (error instanceof Error && error.name === 'AbortError') {
          break;
        }
        if (attempt < maxRetries) {
          await this.sleep(retryDelay * (attempt + 1));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Request failed',
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==================== AGENT ENDPOINTS ====================

  /**
   * Start or resume a conversation
   */
  async startAgent(params: {
    sessionId?: string;
    workingDirectory: string;
    message?: string;
    model?: string;
  }): Promise<DevFlowResponse<{ sessionId: string }>> {
    return this.request('/api/agent/start', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Send a message to an agent
   */
  async sendMessage(params: {
    sessionId: string;
    message: string;
    imagePaths?: string[];
  }): Promise<DevFlowResponse<{ response: string }>> {
    return this.request('/api/agent/send', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Get conversation history
   */
  async getHistory(params: { sessionId: string }): Promise<DevFlowResponse<AgentMessage[]>> {
    return this.request('/api/agent/history', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Stop a running agent
   */
  async stopAgent(params: { sessionId: string }): Promise<DevFlowResponse<void>> {
    return this.request('/api/agent/stop', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Clear conversation
   */
  async clearConversation(params: { sessionId: string }): Promise<DevFlowResponse<void>> {
    return this.request('/api/agent/clear', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ==================== SESSION ENDPOINTS ====================

  /**
   * List all sessions
   */
  async listSessions(): Promise<DevFlowResponse<SessionInfo[]>> {
    return this.request('/api/sessions', {
      method: 'GET',
    });
  }

  /**
   * Create a new session
   */
  async createSession(params: {
    sessionId?: string;
    workingDirectory?: string;
    name?: string;
    tags?: string[];
  }): Promise<DevFlowResponse<SessionInfo>> {
    return this.request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Update session metadata
   */
  async updateSession(
    sessionId: string,
    params: {
      name?: string;
      tags?: string[];
      archived?: boolean;
    }
  ): Promise<DevFlowResponse<SessionInfo>> {
    return this.request(`/api/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  }

  /**
   * Archive a session
   */
  async archiveSession(sessionId: string): Promise<DevFlowResponse<void>> {
    return this.request(`/api/sessions/${sessionId}/archive`, {
      method: 'POST',
    });
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<DevFlowResponse<void>> {
    return this.request(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // ==================== FEATURE ENDPOINTS ====================

  /**
   * List features with filters
   */
  async listFeatures(params?: {
    status?: string[];
    type?: string[];
    limit?: number;
  }): Promise<DevFlowResponse<FeatureInfo[]>> {
    return this.request('/api/features/list', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  }

  /**
   * Get a single feature
   */
  async getFeature(id: string): Promise<DevFlowResponse<FeatureInfo>> {
    return this.request('/api/features/get', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  /**
   * Create a new feature
   */
  async createFeature(params: {
    title: string;
    description?: string;
    type?: string;
    priority?: number;
    status?: string;
  }): Promise<DevFlowResponse<FeatureInfo>> {
    return this.request('/api/features/create', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Update a feature
   */
  async updateFeature(
    id: string,
    params: {
      title?: string;
      description?: string;
      status?: string;
      type?: string;
      priority?: number;
    }
  ): Promise<DevFlowResponse<FeatureInfo>> {
    return this.request('/api/features/update', {
      method: 'POST',
      body: JSON.stringify({ id, ...params }),
    });
  }

  /**
   * Delete a feature
   */
  async deleteFeature(id: string): Promise<DevFlowResponse<void>> {
    return this.request('/api/features/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  // ==================== BEADS ENDPOINTS ====================

  /**
   * List Beads issues
   */
  async listBeadsIssues(params?: {
    status?: string[];
    type?: string[];
    priorityMin?: number;
    priorityMax?: number;
    limit?: number;
  }): Promise<DevFlowResponse<BeadsIssue[]>> {
    return this.request('/api/beads/list', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  }

  /**
   * Create a Beads issue
   */
  async createBeadsIssue(params: {
    title: string;
    description?: string;
    type?: 'bug' | 'feature' | 'task' | 'epic' | 'chore';
    priority?: number;
    labels?: string[];
  }): Promise<DevFlowResponse<BeadsIssue>> {
    return this.request('/api/beads/create', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Update a Beads issue
   */
  async updateBeadsIssue(
    id: string,
    params: {
      title?: string;
      description?: string;
      status?: 'open' | 'in_progress' | 'blocked' | 'closed';
      type?: 'bug' | 'feature' | 'task' | 'epic' | 'chore';
      priority?: number;
      labels?: string[];
    }
  ): Promise<DevFlowResponse<BeadsIssue>> {
    return this.request('/api/beads/update', {
      method: 'POST',
      body: JSON.stringify({ id, ...params }),
    });
  }

  /**
   * Delete a Beads issue
   */
  async deleteBeadsIssue(id: string): Promise<DevFlowResponse<void>> {
    return this.request('/api/beads/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  /**
   * Get ready (unblocked) work
   */
  async getReadyWork(): Promise<DevFlowResponse<BeadsIssue[]>> {
    return this.request('/api/beads/ready', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // ==================== SKILLS ENDPOINTS ====================

  /**
   * Execute research skill
   */
  async executeResearch(params: {
    projectPath: string;
    query: string;
    maxResults?: number;
  }): Promise<DevFlowResponse<{ summary: string; sources: string[] }>> {
    return this.request('/api/skills/research', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Execute implementation skill
   */
  async executeImplementation(params: {
    projectPath: string;
    featureId?: string;
    description: string;
  }): Promise<DevFlowResponse<{ success: boolean; summary: string }>> {
    return this.request('/api/skills/implement', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Run CI/CD validation
   */
  async runCICD(params: {
    projectPath: string;
    skipE2E?: boolean;
  }): Promise<DevFlowResponse<{ success: boolean; report: string }>> {
    return this.request('/api/skills/cicd', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Execute workflow orchestration
   */
  async executeWorkflow(params: {
    issueId?: string;
    projectPath: string;
    mode?: 'auto' | 'semi';
  }): Promise<DevFlowResponse<{ workflowId: string; status: string }>> {
    return this.request('/api/skills/workflow', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ==================== FILE SYSTEM ENDPOINTS ====================

  /**
   * Read a file
   */
  async readFile(params: { path: string }): Promise<DevFlowResponse<{ content: string }>> {
    return this.request('/api/fs/read', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Write a file
   */
  async writeFile(params: { path: string; content: string }): Promise<DevFlowResponse<void>> {
    return this.request('/api/fs/write', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * List directory contents
   */
  async readDir(params: {
    path: string;
  }): Promise<DevFlowResponse<{ entries: Array<{ name: string; type: string }> }>> {
    return this.request('/api/fs/readdir', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Check if path exists
   */
  async pathExists(params: { path: string }): Promise<DevFlowResponse<{ exists: boolean }>> {
    return this.request('/api/fs/exists', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Get file/directory stats
   */
  async getStats(params: {
    path: string;
  }): Promise<DevFlowResponse<{ size: number; modified: string; type: string }>> {
    return this.request('/api/fs/stat', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ==================== WORKTREE ENDPOINTS ====================

  /**
   * Get worktree status
   */
  async getWorktreeStatus(params: {
    path?: string;
  }): Promise<DevFlowResponse<{ branch: string; status: string }>> {
    return this.request('/api/worktree/status', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  }

  /**
   * Get git diffs
   */
  async getDiffs(params: {
    path?: string;
  }): Promise<DevFlowResponse<{ diffs: Array<{ file: string; diff: string }> }>> {
    return this.request('/api/worktree/diffs', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  }

  /**
   * Commit changes
   */
  async commitChanges(params: {
    path?: string;
    message: string;
  }): Promise<DevFlowResponse<{ commit: string }>> {
    return this.request('/api/worktree/commit', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ==================== HEALTH ENDPOINTS ====================

  /**
   * Check server health
   */
  async healthCheck(): Promise<DevFlowResponse<{ status: string; version: string }>> {
    return this.request('/api/health/detailed', {
      method: 'GET',
    });
  }
}
