import { RosterManager, ClientId } from '@ninja/roster';
import { createLogger } from '@ninja/logging';
import { eventBus, createEvent } from '@ninja/events';

const log = createLogger('kage-runtime:failover');

export class FailoverManager {
  private rosterManager: RosterManager;
  private intervalId: NodeJS.Timeout | null = null;
  private lastHeartbeatMap = new Map<ClientId, number>();
  private failedPingMap = new Map<ClientId, number>();

  constructor(rosterManager: RosterManager) {
    this.rosterManager = rosterManager;
  }

  /**
   * Starts the heartbeat loop.
   */
  start(): void {
    if (this.intervalId) return;

    log.info('Starting Always-On Heartbeat & Failover monitor...');
    const intervalMs = 30000; // 30s heartbeat interval

    // Initialize lastHeartbeat for current orchestrator/sentinel/workers
    try {
      const roster = this.rosterManager.getRoster();
      const now = Date.now();
      
      if (roster.roles.orchestrator) this.lastHeartbeatMap.set(roster.roles.orchestrator, now);
      if (roster.roles.sentinel) this.lastHeartbeatMap.set(roster.roles.sentinel, now);
      for (const w of roster.roles.workers) {
        this.lastHeartbeatMap.set(w, now);
      }
    } catch {
      // Roster not unlocked yet
    }

    this.intervalId = setInterval(() => {
      this.checkHeartbeats();
    }, intervalMs);
  }

  /**
   * Stops the heartbeat loop.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Always-On Heartbeat monitor stopped.');
    }
  }

  /**
   * Registers a heartbeat from a client.
   */
  recordHeartbeat(clientId: ClientId): void {
    this.lastHeartbeatMap.set(clientId, Date.now());
    this.failedPingMap.set(clientId, 0);
    
    // Update status in roster if not already connected
    try {
      const roster = this.rosterManager.getRoster();
      const client = roster.clients[clientId];
      if (client && client.status !== 'connected') {
        client.status = 'connected';
        log.info(`Client ${clientId} is back online.`);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Scans active clients and triggers failover if needed.
   */
  private checkHeartbeats(): void {
    try {
      const roster = this.rosterManager.getRoster();
      const now = Date.now();
      const thresholdMs = 90000; // 90 seconds timeout (3 missed pings)

      const activeIds = [
        roster.roles.orchestrator,
        roster.roles.sentinel,
        ...roster.roles.workers,
      ].filter(Boolean) as ClientId[];

      for (const clientId of activeIds) {
        const lastHb = this.lastHeartbeatMap.get(clientId) || 0;
        const timeSinceLastHb = now - lastHb;

        if (timeSinceLastHb > thresholdMs) {
          const failedCount = (this.failedPingMap.get(clientId) || 0) + 1;
          this.failedPingMap.set(clientId, failedCount);

          log.warn(`Missed heartbeat for client ${clientId} (${failedCount}/3)`);

          if (failedCount >= 3) {
            log.error(`Client ${clientId} declared OFFLINE due to heartbeat timeout.`);
            
            const client = roster.clients[clientId];
            if (client) {
              client.status = 'disconnected';
            }

            // Emit disconnect event
            eventBus.emit(
              createEvent('client.disconnected', 'failover-manager', { clientId })
            );

            // Trigger failover if it is the Orchestrator
            if (clientId === roster.roles.orchestrator) {
              this.handleOrchestratorFailover(clientId);
            }
          }
        }
      }
    } catch (err) {
      log.debug('Roster monitor cycle skipped (roster may be locked).');
    }
  }

  /**
   * Promotes a worker or fallback if the current orchestrator goes offline.
   */
  private handleOrchestratorFailover(failedOrchId: ClientId): void {
    log.error(`CRITICAL: Orchestrator ${failedOrchId} went offline. Initiating failover promotion...`);

    const roster = this.rosterManager.getRoster();

    // 1. Find the best online worker
    let bestWorkerId: ClientId | null = null;
    let maxScore = -1;

    for (const workerId of roster.roles.workers) {
      const worker = roster.clients[workerId];
      if (worker && worker.status === 'connected') {
        const score = worker.capabilities.find((c) => c.name === 'orchestration')?.score || 0;
        if (score > maxScore) {
          maxScore = score;
          bestWorkerId = workerId;
        }
      }
    }

    if (bestWorkerId) {
      // Promote worker
      log.info(`Promoting worker ${bestWorkerId} (orchestration capability score: ${maxScore}) to Orchestrator.`);
      
      roster.roles.orchestrator = bestWorkerId;
      roster.clients[bestWorkerId].assignedRole = 'orchestrator';

      // Move former orchestrator to worker role
      roster.clients[failedOrchId].assignedRole = 'worker';
      if (!roster.roles.workers.includes(failedOrchId)) {
        roster.roles.workers.push(failedOrchId);
      }

      // Remove promoted worker from workers list
      roster.roles.workers = roster.roles.workers.filter((w) => w !== bestWorkerId);

      eventBus.emit(
        createEvent('failover.triggered', 'failover-manager', {
          action: 'promote',
          previousOrchestrator: failedOrchId,
          newOrchestrator: bestWorkerId,
        })
      );
    } else {
      // Fallback to direct model gateway
      log.warn('No online workers available for promotion. Falling back to Model Gateway.');
      roster.roles.alwaysOnFallback = 'model-gateway';

      eventBus.emit(
        createEvent('failover.triggered', 'failover-manager', {
          action: 'model-gateway-fallback',
          previousOrchestrator: failedOrchId,
        })
      );
    }
  }
}
