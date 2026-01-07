/**
 * WebSocket Event Streaming
 *
 * Manages WebSocket connection for real-time DevFlow events.
 */

import type { DevFlowMCPServerConfig } from './config.js';
import { WebSocket } from 'ws';

export interface DevFlowEvent {
  type: string;
  payload: unknown;
  timestamp?: string;
}

export type EventListener = (event: DevFlowEvent) => void;

export class DevFlowEventStream {
  private ws: WebSocket | null = null;
  private config: DevFlowMCPServerConfig;
  private listeners: Map<string, Set<EventListener>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // Start at 5 seconds

  constructor(config: DevFlowMCPServerConfig) {
    this.config = config;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (!this.config.enableEvents || !this.config.wsUrl) {
      console.log('[DevFlow MCP] Event streaming disabled');
      return;
    }

    const wsUrl = `${this.config.wsUrl}/api/events`;
    console.log(`[DevFlow MCP] Connecting to events: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('[DevFlow MCP] Event stream connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 5000;
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString()) as DevFlowEvent;
          this.emit(event);
        } catch (error) {
          console.error('[DevFlow MCP] Failed to parse event:', error);
        }
      });

      this.ws.on('close', () => {
        console.log('[DevFlow MCP] Event stream disconnected');
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('[DevFlow MCP] Event stream error:', error);
      });

      this.ws.on('ping', (data: Buffer) => {
        // Respond to ping with pong
        this.ws?.pong(data);
      });
    } catch (error) {
      console.error('[DevFlow MCP] Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[DevFlow MCP] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

    console.log(
      `[DevFlow MCP] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Add event listener
   */
  on(eventType: string, listener: EventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  /**
   * Remove event listener
   */
  off(eventType: string, listener: EventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: DevFlowEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error(`[DevFlow MCP] Error in event listener for ${event.type}:`, error);
        }
      }
    }

    // Also emit to wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('[DevFlow MCP] Error in wildcard event listener:', error);
        }
      }
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
