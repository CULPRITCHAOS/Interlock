/**
 * WebSocket Service for SOS Tournament Live Backend
 * ==================================================
 * Connects to the Python FastAPI backend for real-time updates.
 * Falls back to simulated mode if the backend is unavailable.
 */

import { SOSGenome, Law, SimulationLog } from "../types";

export type SOSEventType =
  | "genome_update"
  | "law_discovered"
  | "log"
  | "cross_pollination"
  | "status"
  | "pong";

export interface SOSEvent {
  type: SOSEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface GenomeUpdateData {
  genomes: Record<string, SOSGenome>;
  generation: number;
}

export interface StatusData {
  action: string;
  is_running?: boolean;
  generation?: number;
  genomes?: Record<string, SOSGenome>;
}

export interface CrossPollinationData {
  source: string;
  target: string;
  strategy: string;
}

export type EventCallback = (event: SOSEvent) => void;

const DEFAULT_WS_URL = "ws://localhost:8001/ws";
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private isIntentionallyClosed = false;
  private callbacks: Map<SOSEventType | "all", Set<EventCallback>> = new Map();
  private _isConnected = false;

  constructor(url: string = DEFAULT_WS_URL) {
    this.url = url;
  }

  /**
   * Check if connected to the backend
   */
  get isConnected(): boolean {
    return this._isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }

      this.isIntentionallyClosed = false;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("[WS] Connected to SOS Backend");
          this._isConnected = true;
          this.reconnectAttempts = 0;
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const sosEvent: SOSEvent = JSON.parse(event.data);
            this.dispatchEvent(sosEvent);
          } catch (e) {
            console.error("[WS] Failed to parse message:", e);
          }
        };

        this.ws.onclose = () => {
          console.log("[WS] Connection closed");
          this._isConnected = false;
          
          if (!this.isIntentionallyClosed) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error("[WS] Connection error:", error);
          this._isConnected = false;
          resolve(false);
        };

        // Timeout for initial connection
        setTimeout(() => {
          if (!this._isConnected) {
            resolve(false);
          }
        }, 5000);

      } catch (e) {
        console.error("[WS] Failed to create WebSocket:", e);
        resolve(false);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
  }

  /**
   * Attempt to reconnect after a connection loss
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log("[WS] Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(`[WS] Attempting reconnect (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    setTimeout(() => {
      this.connect();
    }, RECONNECT_DELAY);
  }

  /**
   * Send a command to the backend
   */
  send(command: string, data?: Record<string, unknown>): void {
    if (!this.isConnected) {
      console.warn("[WS] Cannot send - not connected");
      return;
    }

    const message = JSON.stringify({ command, ...data });
    this.ws?.send(message);
  }

  /**
   * Send a start command
   */
  start(): void {
    this.send("start");
  }

  /**
   * Send a stop command
   */
  stop(): void {
    this.send("stop");
  }

  /**
   * Send a reset command
   */
  reset(): void {
    this.send("reset");
  }

  /**
   * Inject drift into a domain
   */
  injectDrift(domain: string): void {
    this.send("inject_drift", { domain });
  }

  /**
   * Send a ping to check connection
   */
  ping(): void {
    this.send("ping");
  }

  /**
   * Subscribe to events
   * @param eventType - Specific event type or "all" for all events
   * @param callback - Function to call when event is received
   * @returns Unsubscribe function
   */
  on(eventType: SOSEventType | "all", callback: EventCallback): () => void {
    if (!this.callbacks.has(eventType)) {
      this.callbacks.set(eventType, new Set());
    }
    this.callbacks.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.callbacks.get(eventType)?.delete(callback);
    };
  }

  /**
   * Dispatch an event to all subscribers
   */
  private dispatchEvent(event: SOSEvent): void {
    // Dispatch to specific listeners
    this.callbacks.get(event.type)?.forEach((cb) => cb(event));
    
    // Dispatch to "all" listeners
    this.callbacks.get("all")?.forEach((cb) => cb(event));
  }
}

// Singleton instance
export const wsService = new WebSocketService();

export default WebSocketService;
