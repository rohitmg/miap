import { defineStore } from 'pinia';
import api from '@/services/api';

/**
 * Interface for a single observation point.
 * Matches the data selected in your Laravel controller.
 */
export interface ObservationPoint {
    id: number | string;
    latitude: number;
    longitude: number;
    user_id: number;
    taxon_id: number;
    observed_on: string;
}

/**
 * Defines the shape of the observations store's state.
 */
interface ObservationStoreState {
    /**
     * MODIFIED: Caches observation points in a nested structure.
     * The first key is the district ID.
     * The second key is a filter-based cache key (e.g., 'all' or '123,456').
     * The value is the array of points for that district and filter.
     * e.g., { 123: { 'all': [ObservationPoint, ...], '45,67': [ObservationPoint, ...] } }
     */
    allDistrictObservations: Record<string | number, Record<string, ObservationPoint[]>>;
    loading: Record<string, boolean>; // Use dynamic loading keys
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


export const useObservationStore = defineStore('observations', {
    state: (): ObservationStoreState => ({
        allDistrictObservations: {},
        loading: {},
        error: null,
    }),

    getters: {
        /**
         * UPDATED: A getter that returns a function to safely get points for a specific district
         * and a specific taxa filter.
         * Returns an empty array if the data isn't cached yet.
         */
        getDistrictObservations: (state) => {
            return (districtId: string | number, taxaIds?: number[]): ObservationPoint[] => {
                const cacheKey = createCacheKey(taxaIds);
                return state.allDistrictObservations[districtId]?.[cacheKey] || [];
            };
        },
    },

    actions: {
        /**
         * UPDATED: Fetches observation points for a given district from the API, now accepting a taxa filter.
         * Implements caching based on both districtId and the taxa filter.
         */
        async fetchDistrictObservations(payload: { districtId: string | number; taxaIds?: number[]; forceRefresh?: boolean }) {
            const { districtId, taxaIds, forceRefresh = false } = payload;

            if (!districtId) {
                console.warn("fetchDistrictObservations called with no districtId.");
                return;
            }

            const cacheKey = createCacheKey(taxaIds);

            // Caching logic: If data exists for this specific district and filter, and not forcing refresh, do nothing.
            if (this.allDistrictObservations[districtId]?.[cacheKey] && !forceRefresh) {
                console.log(`Using cached observation points for district ${districtId} with filter: ${cacheKey}`);
                return;
            }

            const loadingKey = `district_${districtId}_${cacheKey}`;
            this.loading[loadingKey] = true;
            this.error = null;

            try {
                // Pass taxa_ids as query params if they exist
                const params = taxaIds?.length ? { taxa_ids: taxaIds.join(',') } : {};
                const response = await api.get<ObservationPoint[]>(`/districts/${districtId}/observation-points`, { params });

                // Ensure the nested object for the district exists
                if (!this.allDistrictObservations[districtId]) {
                    this.allDistrictObservations[districtId] = {};
                }

                // Store the fetched data in the state, keyed by the districtId and then by the filter cacheKey.
                this.allDistrictObservations[districtId][cacheKey] = response.data;

                console.log(`Fetched and cached ${this.allDistrictObservations[districtId][cacheKey]?.length || 0} observations from district ${districtId} with filter: ${cacheKey}`);

            } catch (e: any) {
                this.error = `Failed to load observations for district ${districtId}`;
                console.error('fetchDistrictObservations error: ', e);
                // On error, remove the key to allow a re-fetch attempt next time.
                if (this.allDistrictObservations[districtId]) {
                    delete this.allDistrictObservations[districtId][cacheKey];
                }
            } finally {
                this.loading[loadingKey] = false;
            }
        },

        /**
         * Clears all cached district observation data from the store.
         */
        clearAllDistrictObservations() {
            this.allDistrictObservations = {};
            console.log("Cleared all cached district observation points.");
        },

        /**
         * Clears cached observation data for a single district.
         */
        clearObservationsForDistrict(districtId: string | number) {
            if (this.allDistrictObservations[districtId]) {
                delete this.allDistrictObservations[districtId];
                console.log(`Cleared all cached observation points for district ${districtId}.`);
            }
        }
    }
});
