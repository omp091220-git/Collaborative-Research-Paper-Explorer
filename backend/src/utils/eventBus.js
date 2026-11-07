/**
 * Event Bus & Standard Event Contract (FR-19)
 * Provides a decoupled, transactional-safe event contract for user mentions (FR-17),
 * paper tag assignments (FR-11), and paper notes/metadata updates.
 */

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

export const EVENT_TYPES = {
  MENTION_CREATED: 'mention.created',
  TAG_ASSIGNED: 'tag.assigned',
  TAG_REMOVED: 'tag.removed',
  TAG_BULK_UPDATED: 'tag.bulk_updated',
  PAPER_NOTE_ADDED: 'paper.note_added',
  PAPER_METADATA_UPDATED: 'paper.metadata_updated',
};

/**
 * Creates a standardized event contract envelope.
 *
 * @param {object} params
 * @param {string} params.eventType - One of EVENT_TYPES
 * @param {object} [params.actor] - User who triggered the event { id, full_name, email, username, role }
 * @param {object} [params.paper] - Target paper { id, title }
 * @param {object} [params.payload] - Event-specific details
 * @param {object} [params.metadata] - Ancillary metadata
 * @param {string} [params.idempotencyKey] - Optional explicit idempotency key
 * @returns {object} Standardized event envelope
 */
export const createEvent = ({
  eventType,
  actor = null,
  paper = null,
  payload = {},
  metadata = {},
  idempotencyKey = null,
}) => {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    idempotencyKey: idempotencyKey || crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: actor
      ? {
          id: actor.id,
          fullName: actor.full_name || actor.fullName || null,
          email: actor.email || null,
          username: actor.username || null,
          role: actor.role || null,
        }
      : null,
    paper: paper
      ? {
          id: paper.id,
          title: paper.title || null,
        }
      : null,
    payload,
    metadata,
  };
};

class AppEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Publishes an event on the event bus.
   *
   * @param {string} eventType
   * @param {object} event
   * @returns {boolean}
   */
  publish(eventType, event) {
    return this.emit(eventType, event);
  }

  /**
   * Subscribes a listener to an event type.
   *
   * @param {string} eventType
   * @param {(event: object) => void|Promise<void>} listener
   */
  subscribe(eventType, listener) {
    this.on(eventType, listener);
  }

  /**
   * Unsubscribes a listener from an event type.
   *
   * @param {string} eventType
   * @param {(event: object) => void|Promise<void>} listener
   */
  unsubscribe(eventType, listener) {
    this.off(eventType, listener);
  }
}

export const eventBus = new AppEventBus();
export default eventBus;
