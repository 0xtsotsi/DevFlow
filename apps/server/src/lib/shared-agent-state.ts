/**
 * Shared Agent State Store - Centralized state management for multi-agent coordination
 *
 * Provides:
 * - Key-value state storage with subscriptions
 * - Transaction support for atomic updates
 * - State change notifications
 * - Type-safe state access
 */

import { EventEmitter } from './events.js';

export type StateKey = string;
export type StateValue = unknown;

export interface StateChange<T = StateValue> {
  key: StateKey;
  oldValue: T | undefined;
  newValue: T;
  timestamp: string;
}

export type StateCallback<T = StateValue> = (change: StateChange<T>) => void;

export interface StateTransaction {
  update: <T>(key: StateKey, value: T) => void;
  delete: (key: StateKey) => void;
  commit: () => Promise<void>;
  rollback: () => void;
}

export class SharedAgentState {
  private state: Map<StateKey, StateValue> = new Map();
  private subscriptions: Map<StateKey, Set<StateCallback>> = new Map();
  private events: EventEmitter;
  private transactionActive = false;
  private transactionState: Map<StateKey, StateValue> = new Map();
  private transactionDeletes: Set<StateKey> = new Set();

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Set a state value and notify subscribers
   */
  setState<T extends StateValue>(key: StateKey, value: T): void {
    const oldValue = this.state.get(key);

    // If in transaction, buffer the change
    if (this.transactionActive) {
      this.transactionState.set(key, value);
      this.transactionDeletes.delete(key);
      return;
    }

    // Check if value actually changed
    if (JSON.stringify(oldValue) === JSON.stringify(value)) {
      return;
    }

    // Update state
    this.state.set(key, value);

    // Notify subscribers
    this.notifySubscribers(key, oldValue, value);
  }

  /**
   * Get a state value
   */
  getState<T extends StateValue>(key: StateKey): T | undefined {
    // If in transaction, check transaction state first
    if (this.transactionActive) {
      if (this.transactionDeletes.has(key)) {
        return undefined;
      }
      const transactionValue = this.transactionState.get(key);
      if (transactionValue !== undefined) {
        return transactionValue as T;
      }
    }

    return this.state.get(key) as T | undefined;
  }

  /**
   * Check if a key exists in state
   */
  hasState(key: StateKey): boolean {
    if (this.transactionActive && this.transactionDeletes.has(key)) {
      return false;
    }

    if (this.transactionActive && this.transactionState.has(key)) {
      return true;
    }

    return this.state.has(key);
  }

  /**
   * Delete a state value
   */
  deleteState(key: StateKey): void {
    const oldValue = this.state.get(key);

    if (this.transactionActive) {
      this.transactionState.delete(key);
      this.transactionDeletes.add(key);
      return;
    }

    if (!this.state.has(key)) {
      return;
    }

    this.state.delete(key);

    // Notify subscribers
    this.notifySubscribers(key, oldValue, undefined);
  }

  /**
   * Subscribe to state changes for a specific key
   * Returns unsubscribe function
   */
  subscribe<T extends StateValue>(key: StateKey, callback: StateCallback<T>): () => void {
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }

    const callbacks = this.subscriptions.get(key)!;
    callbacks.add(callback as StateCallback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback as StateCallback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(key);
      }
    };
  }

  /**
   * Subscribe to all state changes (wildcard)
   * Returns unsubscribe function
   */
  subscribeAll(callback: StateCallback): () => void {
    const wildcardKey = '*';
    return this.subscribe(wildcardKey, callback);
  }

  /**
   * Get all current state (snapshot)
   */
  getAllState(): Record<StateKey, StateValue> {
    const snapshot: Record<StateKey, StateValue> = {};

    for (const [key, value] of this.state.entries()) {
      // Skip transaction-deleted keys
      if (this.transactionActive && this.transactionDeletes.has(key)) {
        continue;
      }
      // Use transaction value if available
      if (this.transactionActive && this.transactionState.has(key)) {
        snapshot[key] = this.transactionState.get(key)!;
      } else {
        snapshot[key] = value;
      }
    }

    // Add new keys from transaction
    if (this.transactionActive) {
      for (const [key, value] of this.transactionState.entries()) {
        if (!snapshot[key]) {
          snapshot[key] = value;
        }
      }
    }

    return snapshot;
  }

  /**
   * Clear all state
   */
  clearAllState(): void {
    const oldState = new Map(this.state);

    this.state.clear();

    // Notify all subscribers
    for (const [key, oldValue] of oldState.entries()) {
      this.notifySubscribers(key, oldValue, undefined);
    }
  }

  /**
   * Begin a transaction for atomic updates
   */
  beginTransaction(): StateTransaction {
    if (this.transactionActive) {
      throw new Error('Transaction already active');
    }

    this.transactionActive = true;
    this.transactionState.clear();
    this.transactionDeletes.clear();

    return {
      update: <T>(key: StateKey, value: T) => {
        if (!this.transactionActive) {
          throw new Error('Transaction not active');
        }
        this.transactionState.set(key, value);
        this.transactionDeletes.delete(key);
      },
      delete: (key: StateKey) => {
        if (!this.transactionActive) {
          throw new Error('Transaction not active');
        }
        this.transactionState.delete(key);
        this.transactionDeletes.add(key);
      },
      commit: async () => {
        if (!this.transactionActive) {
          throw new Error('Transaction not active');
        }

        // Apply all transaction changes
        const appliedChanges: Array<{
          key: StateKey;
          oldValue: StateValue | undefined;
          newValue: StateValue;
        }> = [];

        for (const [key, value] of this.transactionState.entries()) {
          const oldValue = this.state.get(key);
          this.state.set(key, value);
          appliedChanges.push({ key, oldValue, newValue: value });
        }

        for (const key of this.transactionDeletes) {
          const oldValue = this.state.get(key);
          this.state.delete(key);
          appliedChanges.push({ key, oldValue, newValue: undefined as StateValue });
        }

        // Notify subscribers for all changes
        for (const change of appliedChanges) {
          this.notifySubscribers(change.key, change.oldValue, change.newValue);
        }

        this.transactionActive = false;
        this.transactionState.clear();
        this.transactionDeletes.clear();
      },
      rollback: () => {
        if (!this.transactionActive) {
          throw new Error('Transaction not active');
        }

        this.transactionActive = false;
        this.transactionState.clear();
        this.transactionDeletes.clear();
      },
    };
  }

  /**
   * Get state size (number of keys)
   */
  get size(): number {
    if (this.transactionActive) {
      let count = 0;
      for (const key of this.state.keys()) {
        if (!this.transactionDeletes.has(key)) {
          count++;
        }
      }
      // Add new keys
      for (const key of this.transactionState.keys()) {
        if (!this.state.has(key)) {
          count++;
        }
      }
      return count;
    }
    return this.state.size;
  }

  /**
   * Notify subscribers of a state change
   */
  private notifySubscribers(
    key: StateKey,
    oldValue: StateValue | undefined,
    newValue: StateValue | undefined
  ): void {
    const change: StateChange = {
      key,
      oldValue,
      newValue: newValue as StateValue,
      timestamp: new Date().toISOString(),
    };

    // Notify key-specific subscribers
    const keySubscribers = this.subscriptions.get(key);
    if (keySubscribers) {
      for (const callback of keySubscribers) {
        try {
          callback(change);
        } catch (error) {
          console.error(`Error in state subscriber for key "${key}":`, error);
        }
      }
    }

    // Notify wildcard subscribers
    const wildcardSubscribers = this.subscriptions.get('*');
    if (wildcardSubscribers) {
      for (const callback of wildcardSubscribers) {
        try {
          callback(change);
        } catch (error) {
          console.error('Error in wildcard state subscriber:', error);
        }
      }
    }
  }
}
