import Database from 'better-sqlite3';
import { NinjaEvent } from '@ninja/contracts';
import { eventBus } from '@ninja/events';
import { EventSubscription } from '@ninja/events';

/**
 * Starts persisting events from the event bus to the database.
 * @param db The database instance to persist events to
 * @returns An object with a stop() method to cancel event persistence
 */
export function startEventPersistence(db: Database.Database): { stop(): void } {
  // Prepare the SQL statement for inserting events
  const insertStmt = db.prepare(`
    INSERT INTO event_log (id, type, source, payload, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Subscribe to all events on the bus
  const subscription: EventSubscription = eventBus.onAny((event: NinjaEvent) => {
    try {
      // Insert the event into the database
      insertStmt.run(
        event.id,
        event.type,
        event.source,
        JSON.stringify(event.payload),
        event.timestamp
      );
    } catch (error) {
      console.error(`Failed to persist event to database:`, error);
    }
  });

  // Return an object with a stop method to unsubscribe
  return {
    stop: () => {
      subscription.unsubscribe();
    },
  };
}
