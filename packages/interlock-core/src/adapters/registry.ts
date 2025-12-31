/**
 * Adapter Registry
 * =================
 * Manages registration and lookup of domain adapters.
 * 
 * Simple, explicit registration - no magic discovery.
 */

import { InterlockAdapter } from './types';

class AdapterRegistryImpl {
    private adapters: Map<string, InterlockAdapter> = new Map();
    private defaultDomain: string | null = null;

    /**
     * Register an adapter for a domain.
     * @throws Error if adapter already registered for domain
     */
    registerAdapter(adapter: InterlockAdapter): void {
        if (this.adapters.has(adapter.domain)) {
            throw new Error(
                `Adapter already registered for domain '${adapter.domain}'. ` +
                `Existing: ${this.adapters.get(adapter.domain)?.adapter_id}`
            );
        }

        this.adapters.set(adapter.domain, adapter);
        console.log(`[AdapterRegistry] Registered: ${adapter.adapter_id} for domain '${adapter.domain}'`);

        // First adapter becomes default
        if (this.defaultDomain === null) {
            this.defaultDomain = adapter.domain;
        }
    }

    /**
     * Get adapter for a specific domain.
     * @returns Adapter or undefined if not found
     */
    getAdapter(domain: string): InterlockAdapter | undefined {
        return this.adapters.get(domain);
    }

    /**
     * Get the default adapter (first registered).
     */
    getDefaultAdapter(): InterlockAdapter | undefined {
        if (this.defaultDomain === null) return undefined;
        return this.adapters.get(this.defaultDomain);
    }

    /**
     * List all registered adapters.
     */
    listAdapters(): InterlockAdapter[] {
        return Array.from(this.adapters.values());
    }

    /**
     * List all registered domains.
     */
    listDomains(): string[] {
        return Array.from(this.adapters.keys());
    }

    /**
     * Check if a domain has a registered adapter.
     */
    hasAdapter(domain: string): boolean {
        return this.adapters.has(domain);
    }

    /**
     * Clear all adapters (for testing).
     */
    clear(): void {
        this.adapters.clear();
        this.defaultDomain = null;
    }
}

// Singleton instance
export const AdapterRegistry = new AdapterRegistryImpl();

// Export type for testing
export type { AdapterRegistryImpl };
