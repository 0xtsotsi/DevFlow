/**
 * MCP Configuration Service
 *
 * Manages MCP server configuration by checking .mcp.json and .claude/settings.json,
 * adding missing servers programmatically, and updating permissions.
 */

import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type { EventType } from '@automaker/types';

export interface MCPServerDefinition {
  /** Server name */
  name: string;

  /** Whether server is enabled */
  enabled: boolean;

  /** Server configuration */
  config?: Record<string, unknown>;

  /** Required environment variables */
  requiredEnvVars?: string[];
}

export interface MCPConfigurationStatus {
  /** Whether MCP is configured */
  configured: boolean;

  /** Available servers */
  servers: string[];

  /** Missing servers */
  missing: string[];

  /** Configuration file path */
  configPath?: string;

  /** Settings file path */
  settingsPath?: string;
}

export interface MCPValidationResult {
  /** Server name */
  server: string;

  /** Whether server is available */
  available: boolean;

  /** Error message if not available */
  error?: string;

  /** Configuration status */
  config: 'present' | 'missing' | 'misconfigured';
}

export class MCPConfigurationService {
  private eventEmitter?: EventEmitter;
  private projectPath: string;

  // Default MCP servers to configure
  private defaultServers: Record<string, MCPServerDefinition> = {
    exa: {
      name: 'exa',
      enabled: !!process.env.EXA_API_KEY,
      requiredEnvVars: ['EXA_API_KEY'],
    },
    grep: {
      name: 'grep',
      enabled: true,
    },
    playwright: {
      name: 'playwright',
      enabled: true,
      config: {
        timeout: 30000,
      },
    },
  };

  constructor(projectPath: string, events?: EventEmitter) {
    this.projectPath = projectPath;
    this.eventEmitter = events;
  }

  /**
   * Check MCP configuration status
   *
   * @returns Configuration status
   */
  async checkConfiguration(): Promise<MCPConfigurationStatus> {
    const mcpConfigPath = path.join(this.projectPath, '.mcp.json');
    const settingsPath = path.join(this.projectPath, '.claude', 'settings.json');

    const configured = await this.fileExists(mcpConfigPath);
    const servers = configured ? await this.getConfiguredServers(mcpConfigPath) : [];
    const missing = this.getMissingServers(servers);

    const status: MCPConfigurationStatus = {
      configured,
      servers,
      missing,
      configPath: mcpConfigPath,
      settingsPath: settingsPath,
    };

    return status;
  }

  /**
   * Check if a file exists
   *
   * @param filePath - File path to check
   * @returns Whether file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await secureFs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get configured servers from .mcp.json
   *
   * @param configPath - Path to .mcp.json
   * @returns Array of server names
   */
  private async getConfiguredServers(configPath: string): Promise<string[]> {
    try {
      const content = (await secureFs.readFile(configPath, 'utf-8')) as string;
      const config = JSON.parse(content);
      return Object.keys(config.mcpServers || {});
    } catch {
      return [];
    }
  }

  /**
   * Get missing servers
   *
   * @param configured - Configured server names
   * @returns Missing server names
   */
  private getMissingServers(configured: string[]): string[] {
    return Object.keys(this.defaultServers).filter((name) => !configured.includes(name));
  }

  /**
   * Add missing MCP servers to configuration
   *
   * @returns Updated configuration
   */
  async addMissingServers(): Promise<void> {
    const mcpConfigPath = path.join(this.projectPath, '.mcp.json');
    const settingsPath = path.join(this.projectPath, '.claude', 'settings.json');

    // Read existing .mcp.json or create new
    let mcpConfig: Record<string, unknown> = { mcpServers: {} };
    if (await this.fileExists(mcpConfigPath)) {
      const content = (await secureFs.readFile(mcpConfigPath, 'utf-8')) as string;
      mcpConfig = JSON.parse(content);
    }

    // Add missing servers
    for (const [name] of Object.entries(this.defaultServers)) {
      if (!(mcpConfig.mcpServers as Record<string, unknown>)[name]) {
        (mcpConfig.mcpServers as Record<string, unknown>)[name] = {
          command: this.getServerCommand(name),
          args: this.getServerArgs(name),
          env: this.getServerEnv(name),
        };

        this.emitEvent('mcp:server-added', { server: name });
      }
    }

    // Write updated .mcp.json
    await secureFs.mkdir(path.dirname(mcpConfigPath), { recursive: true });
    await secureFs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

    // Update permissions in settings.json
    await this.updatePermissions(settingsPath);
  }

  /**
   * Get server command for MCP server
   *
   * @param name - Server name
   * @returns Command to start server
   */
  private getServerCommand(name: string): string {
    const commands: Record<string, string> = {
      exa: 'npx',
      grep: 'npx',
      playwright: 'npx',
    };
    return commands[name] || 'npx';
  }

  /**
   * Get server arguments for MCP server
   *
   * @param name - Server name
   * @returns Arguments for server command
   */
  private getServerArgs(name: string): string[] {
    const args: Record<string, string[]> = {
      exa: ['-y', '@modelcontextprotocol/server-exa'],
      grep: ['-y', '@modelcontextprotocol/server-grep'],
      playwright: ['-y', '@executeautomation/playwright-mcp-server'],
    };
    return args[name] || [];
  }

  /**
   * Get environment variables for server
   *
   * @param name - Server name
   * @returns Environment variables
   */
  private getServerEnv(name: string): Record<string, string | undefined> {
    const definition = this.defaultServers[name];
    if (!definition?.requiredEnvVars) {
      return {};
    }

    const env: Record<string, string | undefined> = {};
    for (const envVar of definition.requiredEnvVars) {
      env[envVar] = process.env[envVar];
    }
    return env;
  }

  /**
   * Update permissions in .claude/settings.json
   *
   * @param settingsPath - Path to settings.json
   */
  private async updatePermissions(settingsPath: string): Promise<void> {
    let settings: Record<string, unknown> = {};

    // Read existing settings or create new
    if (await this.fileExists(settingsPath)) {
      const content = (await secureFs.readFile(settingsPath, 'utf-8')) as string;
      settings = JSON.parse(content);
    }

    // Ensure permissions section exists
    if (!settings.permissions) {
      settings.permissions = {};
    }

    // Add MCP tool permissions
    const mcpTools = [
      'mcp__exa__get_code_context_exa',
      'mcp__exa__web_search_exa',
      'mcp__grep__searchGitHub',
      'mcp__zai-mcp-server__analyze_image',
      'mcp__zai-mcp-server__analyze_video',
      'mcp__zai-mcp-server__diagnose_error_screenshot',
      'mcp__zai-mcp-server__extract_text_from_screenshot',
      'mcp__zai-mcp-server__ui_diff_check',
      'mcp__zai-mcp-server__ui_to_artifact',
      'mcp__zai-mcp-server__understand_technical_diagram',
    ];

    for (const tool of mcpTools) {
      if (!(settings.permissions as Record<string, unknown>)[tool]) {
        (settings.permissions as Record<string, unknown>)[tool] = true;
      }
    }

    // Write updated settings.json
    await secureFs.mkdir(path.dirname(settingsPath), { recursive: true });
    await secureFs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    this.emitEvent('mcp:permissions-updated', { tools: mcpTools });
  }

  /**
   * Validate server availability
   *
   * @returns Validation results for all servers
   */
  async validateServers(): Promise<MCPValidationResult[]> {
    const results: MCPValidationResult[] = [];

    for (const [name, definition] of Object.entries(this.defaultServers)) {
      const result = await this.validateServer(name, definition);
      results.push(result);
    }

    return results;
  }

  /**
   * Validate a single server
   *
   * @param name - Server name
   * @param definition - Server definition
   * @returns Validation result
   */
  private async validateServer(
    name: string,
    definition: MCPServerDefinition
  ): Promise<MCPValidationResult> {
    const mcpConfigPath = path.join(this.projectPath, '.mcp.json');

    // Check if configured
    if (!(await this.fileExists(mcpConfigPath))) {
      return {
        server: name,
        available: false,
        config: 'missing',
        error: '.mcp.json not found',
      };
    }

    const content = (await secureFs.readFile(mcpConfigPath, 'utf-8')) as string;
    const config = JSON.parse(content);

    if (!(config.mcpServers && config.mcpServers[name])) {
      return {
        server: name,
        available: false,
        config: 'missing',
        error: `Server ${name} not configured in .mcp.json`,
      };
    }

    // Check environment variables
    if (definition.requiredEnvVars) {
      const missing = definition.requiredEnvVars.filter((envVar) => !process.env[envVar]);

      if (missing.length > 0) {
        return {
          server: name,
          available: false,
          config: 'misconfigured',
          error: `Missing environment variables: ${missing.join(', ')}`,
        };
      }
    }

    return {
      server: name,
      available: true,
      config: 'present',
    };
  }

  /**
   * Get server configuration
   *
   * @param name - Server name
   * @returns Server definition or undefined
   */
  getServerDefinition(name: string): MCPServerDefinition | undefined {
    return this.defaultServers[name];
  }

  /**
   * Get all server definitions
   *
   * @returns All server definitions
   */
  getAllServerDefinitions(): Record<string, MCPServerDefinition> {
    return { ...this.defaultServers };
  }

  /**
   * Enable or disable a server
   *
   * @param name - Server name
   * @param enabled - Whether to enable server
   */
  async setServerEnabled(name: string, enabled: boolean): Promise<void> {
    const definition = this.defaultServers[name];
    if (definition) {
      definition.enabled = enabled;
      this.emitEvent('mcp:server-toggled', { server: name, enabled });
    }
  }

  /**
   * Emit an MCP event
   *
   * @param type - Event type
   * @param payload - Event payload
   */
  private emitEvent(type: EventType, payload: unknown): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(type, payload);
    }
  }
}
