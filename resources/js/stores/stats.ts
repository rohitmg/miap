import { defineStore } from 'pinia';
import api from '@/services/api';

// --- Types ---
interface RegionStatValues {
    observations: number;
    taxa: number;
    users: number;
}

interface StatsStoreState {
    // MODIFIED: State properties are now objects to cache results
    // based on a filter key (e.g., 'all' or '123,456').
    country: Record<string, RegionStatValues | null>;
    allStates: Record<string, Record<string | number, RegionStatValues> | null>;
    districtsInState: Record<string | number, Record<string, Record<string | number, RegionStatValues>>>;

    loading: Record<string, boolean>;
    error: string | null;
}

// Helper function to create a consistent cache key from an array of IDs
const createCacheKey = (ids?: number[]): string => {
    if (!ids || ids.length === 0) {
        return 'all'; // Default key when no filter is applied
    }
    // Create a consistent, sorted key to ensure [1,2] and [2,1] are treated the same
    return [...ids].sort((a, b) => a - b).join(',');
};

export const useStatsStore = defineStore('stats', {
    state: (): StatsStoreState => ({
        country: {}, // Is now an object for caching
        allStates: {}, // Is now an object for caching
        districtsInState: {}, // Is now a nested object for caching
        loading: {},
        error: null,
    }),
    actions: {
        setError(message: string | null) { this.error = message; },
        clearError() { this.error = null; },

        /**
         * UPDATED: Fetches country stats, now accepts a taxa filter.
         */
        async fetchCountryStats(options?: { taxaIds?: number[]; forceRefresh?: boolean }) {
            const cacheKey = createCacheKey(options?.taxaIds);
            
            if (this.country[cacheKey] && !options?.forceRefresh) {
                console.log(`Using cached country stats for filter: ${cacheKey}`);
                return;
            }

            const loadingKey = `country_${cacheKey}`;
            this.loading[loadingKey] = true;
            this.clearError();

            try {
                // Pass taxa_ids as query params if they exist
                const params = options?.taxaIds?.length ? { taxa_ids: options.taxaIds.join(',') } : {};
                const response = await api.get<RegionStatValues>('/stats/country', { params });
                this.country[cacheKey] = response.data;
            } catch (e) {
                this.error = 'Failed to load country stats';
                console.error("fetchCountryStats error:", e);
            } finally {
                this.loading[loadingKey] = false;
            }
        },

        /**
         * UPDATED: Fetches all states' stats, now accepts a taxa filter.
         */
        async fetchAllStatesStats(options?: { taxaIds?: number[]; forceRefresh?: boolean }) {
            const cacheKey = createCacheKey(options?.taxaIds);

            if (this.allStates[cacheKey] && !options?.forceRefresh) {
                console.log(`Using cached allStates stats for filter: ${cacheKey}`);
                return;
            }

            const loadingKey = `allStates_${cacheKey}`;
            this.loading[loadingKey] = true;
            this.clearError();

            try {
                const params = options?.taxaIds?.length ? { taxa_ids: options.taxaIds.join(',') } : {};
                const response = await api.get<Record<string | number, RegionStatValues>>('/stats/states', { params });
                this.allStates[cacheKey] = response.data;
            } catch (e) {
                this.error = 'Failed to load stats for all states';
                console.error("fetchAllStatesStats error:", e);
            } finally {
                this.loading[loadingKey] = false;
            }
        },

        /**
         * UPDATED: Fetches district stats for a state, now accepts a taxa filter.
         */
        async fetchDistrictsStatsByState(options: { stateId: string | number; taxaIds?: number[]; forceRefresh?: boolean }) {
            const { stateId, taxaIds, forceRefresh = false } = options;
            if (!stateId) return;

            const cacheKey = createCacheKey(taxaIds);

            if (this.districtsInState[stateId]?.[cacheKey] && !forceRefresh) {
                console.log(`Using cached district stats for state ${stateId} with filter: ${cacheKey}`);
                return;
            }

            const loadingKey = `districts_in_state_${stateId}_${cacheKey}`;
            this.loading[loadingKey] = true;
            this.clearError();

            try {
                const params = taxaIds?.length ? { taxa_ids: taxaIds.join(',') } : {};
                const response = await api.get<Record<string | number, RegionStatValues>>(`/stats/states/${stateId}/districts`, { params });
                
                if (!this.districtsInState[stateId]) {
                    this.districtsInState[stateId] = {};
                }
                this.districtsInState[stateId][cacheKey] = response.data;
            } catch (e) {
                this.error = `Failed to load district stats for state ${stateId}`;
                console.error(`fetchDistrictsStatsByState (${stateId}) error:`, e);
            } finally {
                this.loading[loadingKey] = false;
            }
        },
    }
});
