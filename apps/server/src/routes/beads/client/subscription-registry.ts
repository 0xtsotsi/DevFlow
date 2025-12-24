/**
 * Subscription Registry for Real-Time Updates
 *
 * Port of server/subscriptions.js from beads-ui to TypeScript
 * Manages server-side subscriptions for real-time updates
 */

export interface BdItem {
  id: string;
  [key: string]: unknown;
}

export interface BdSnapshot {
  items: BdItem[];
  version?: number;
}

export interface BdDelta {
  added: BdItem[];
  updated: BdItem[];
  removed: string[];
}

export interface Subscriber {
  send(data: string): boolean;
  close(): void;
  readyState: number;
}

export interface Subscription {
  key: string;
  itemsById: Map<string, BdItem>;
  subscribers: Set<Subscriber>;
  updateLock: Promise<void>;
  version: number;
}

/**
 * Compute delta between two sets of items
 */
export function computeDelta(oldById: Map<string, BdItem>, newById: Map<string, BdItem>): BdDelta {
  const added: BdItem[] = [];
  const updated: BdItem[] = [];
  const removed: string[] = [];

  // Find added and updated items
  for (const [id, newItem] of newById.entries()) {
    const oldItem = oldById.get(id);
    if (!oldItem) {
      added.push(newItem);
    } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
      updated.push(newItem);
    }
  }

  // Find removed items
  for (const id of oldById.keys()) {
    if (!newById.has(id)) {
      removed.push(id);
    }
  }

  return { added, updated, removed };
}

/**
 * Subscription registry class
 */
export class SubscriptionRegistry {
  private subscriptions = new Map<string, Subscription>();

  /**
   * Get or create a subscription
   */
  getSubscription(key: string): Subscription {
    let subscription = this.subscriptions.get(key);

    if (!subscription) {
      subscription = {
        key,
        itemsById: new Map(),
        subscribers: new Set(),
        updateLock: Promise.resolve(),
        version: 0,
      };
      this.subscriptions.set(key, subscription);
    }

    return subscription;
  }

  /**
   * Subscribe a client to a subscription
   */
  subscribe(key: string, subscriber: Subscriber): BdSnapshot {
    const subscription = this.getSubscription(key);
    subscription.subscribers.add(subscriber);

    // Send current snapshot
    return {
      items: Array.from(subscription.itemsById.values()),
      version: subscription.version,
    };
  }

  /**
   * Unsubscribe a client from a subscription
   */
  unsubscribe(key: string, subscriber: Subscriber): void {
    const subscription = this.subscriptions.get(key);
    if (subscription) {
      subscription.subscribers.delete(subscriber);

      // Clean up empty subscriptions
      if (subscription.subscribers.size === 0) {
        this.subscriptions.delete(key);
      }
    }
  }

  /**
   * Unsubscribe a client from all subscriptions
   */
  unsubscribeAll(subscriber: Subscriber): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.subscribers.delete(subscriber);
    }

    // Clean up empty subscriptions
    for (const [key, subscription] of this.subscriptions.entries()) {
      if (subscription.subscribers.size === 0) {
        this.subscriptions.delete(key);
      }
    }
  }

  /**
   * Update snapshot and notify subscribers
   */
  async updateSnapshot(key: string, newItems: BdItem[]): Promise<BdDelta | null> {
    const subscription = this.getSubscription(key);

    // Wait for any pending update
    await subscription.updateLock;

    // Create new lock for this update
    let resolveLock: (() => void) | undefined;
    subscription.updateLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    // Ensure resolveLock was assigned (should always be true)
    if (!resolveLock) {
      throw new Error('Failed to create update lock promise');
    }

    try {
      // Build new index
      const newById = new Map<string, BdItem>();
      for (const item of newItems) {
        if (item.id) {
          newById.set(item.id, item);
        }
      }

      // Compute delta
      const delta = computeDelta(subscription.itemsById, newById);

      // Update snapshot if there are changes
      if (delta.added.length > 0 || delta.updated.length > 0 || delta.removed.length > 0) {
        subscription.itemsById = newById;
        subscription.version++;

        // Notify subscribers
        this.notifySubscribers(subscription, delta);
      }

      return delta;
    } finally {
      resolveLock();
    }
  }

  /**
   * Notify all subscribers of a subscription
   */
  private notifySubscribers(subscription: Subscription, delta: BdDelta): void {
    const message = JSON.stringify({
      type: 'list-delta',
      key: subscription.key,
      version: subscription.version,
      ...delta,
    });

    // Remove closed subscribers
    const closed: Subscriber[] = [];
    for (const subscriber of subscription.subscribers) {
      if (subscriber.readyState === 1) {
        // OPEN
        try {
          subscriber.send(message);
        } catch {
          closed.push(subscriber);
        }
      } else {
        closed.push(subscriber);
      }
    }

    // Clean up closed subscribers
    for (const subscriber of closed) {
      subscription.subscribers.delete(subscriber);
    }
  }

  /**
   * Get all subscriptions (for debugging)
   */
  getSubscriptions(): Map<string, Omit<Subscription, 'subscribers' | 'updateLock'>> {
    const result = new Map();
    for (const [key, sub] of this.subscriptions.entries()) {
      result.set(key, {
        key: sub.key,
        itemsById: sub.itemsById,
        version: sub.version,
        subscriberCount: sub.subscribers.size,
      });
    }
    return result;
  }

  /**
   * Get subscription stats
   */
  getStats(): { totalSubscriptions: number; totalSubscribers: number } {
    let totalSubscribers = 0;
    for (const subscription of this.subscriptions.values()) {
      totalSubscribers += subscription.subscribers.size;
    }

    return {
      totalSubscriptions: this.subscriptions.size,
      totalSubscribers,
    };
  }
}

// Global subscription registry instance
let globalRegistry: SubscriptionRegistry | null = null;

/**
 * Get or create the global subscription registry
 */
export function getGlobalRegistry(): SubscriptionRegistry {
  if (!globalRegistry) {
    globalRegistry = new SubscriptionRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (for testing)
 */
export function resetGlobalRegistry(): void {
  globalRegistry = null;
}
