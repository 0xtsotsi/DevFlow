/**
 * Metrics Middleware for Express
 *
 * Tracks HTTP request metrics including duration, status codes, and endpoint usage.
 */

import type { Request, Response, NextFunction } from 'express';
import { incrementCounter, recordDistribution, setGauge } from './sentry.js';

/**
 * Metrics middleware for tracking HTTP requests
 *
 * Tracks:
 * - Request duration (distribution)
 * - Request count (counter)
 * - Response status codes (counter)
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();

  // Listen for the response to finish
  res.on('finish', () => {
    const duration = performance.now() - start;

    // Get route path or URL path
    const route = (req as { route?: { path?: string } }).route?.path || req.path;

    // Skip metrics for health checks to reduce noise
    if (req.path === '/api/health') {
      return;
    }

    // Record request duration
    recordDistribution('http.request.duration_ms', duration, {
      unit: 'millisecond',
      attributes: {
        method: req.method,
        route: route.length > 50 ? route.substring(0, 50) : route,
        status_code: res.statusCode.toString(),
      },
    });

    // Count requests by status code category
    const statusCategory =
      res.statusCode < 300 ? 'success' : res.statusCode < 500 ? 'redirect' : 'error';
    incrementCounter('http.request.count', 1, {
      attributes: {
        method: req.method,
        route: route.length > 50 ? route.substring(0, 50) : route,
        status_code: res.statusCode.toString(),
        status_category: statusCategory,
      },
    });

    // Count errors separately
    if (res.statusCode >= 400) {
      incrementCounter('http.request.error', 1, {
        attributes: {
          method: req.method,
          route: route.length > 50 ? route.substring(0, 50) : route,
          status_code: res.statusCode.toString(),
        },
      });
    }
  });

  next();
}

/**
 * WebSocket metrics tracker
 *
 * Tracks WebSocket connection metrics
 */
export interface WebSocketMetrics {
  connectionsOpened: number;
  connectionsClosed: number;
  currentConnections: number;
  messagesReceived: number;
  messagesSent: number;
}

export class WebSocketMetricsTracker {
  private metrics: WebSocketMetrics = {
    connectionsOpened: 0,
    connectionsClosed: 0,
    currentConnections: 0,
    messagesReceived: 0,
    messagesSent: 0,
  };

  private updateGauge(): void {
    setGauge('websocket.connections.current', this.metrics.currentConnections);
    setGauge('websocket.messages.total', this.metrics.messagesReceived + this.metrics.messagesSent);
  }

  trackConnectionOpened(): void {
    this.metrics.connectionsOpened++;
    this.metrics.currentConnections++;
    incrementCounter('websocket.connection.opened', 1);
    this.updateGauge();
  }

  trackConnectionClosed(): void {
    this.metrics.connectionsClosed++;
    this.metrics.currentConnections = Math.max(0, this.metrics.currentConnections - 1);
    incrementCounter('websocket.connection.closed', 1);
    this.updateGauge();
  }

  trackMessageReceived(): void {
    this.metrics.messagesReceived++;
    incrementCounter('websocket.message.received', 1);
    this.updateGauge();
  }

  trackMessageSent(): void {
    this.metrics.messagesSent++;
    incrementCounter('websocket.message.sent', 1);
    this.updateGauge();
  }

  getMetrics(): WebSocketMetrics {
    return { ...this.metrics };
  }
}
