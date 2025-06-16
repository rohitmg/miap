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
    allDistrictObservations: Record<string | number, Record<string, ObservationPoint[]>>;
    allStateObservations: Record<string | number, Record<string, ObservationPoint[]>>;
    loading: Record<string, boolean>; // Use dynamic loading keys
    error: string | null;
}

// Helper function to create a consistent cache key from an array of IDs
const createCacheKey = (ids?: number[]): string => {
    if (!ids || ids.length === 0) {
        return 'all';
    }

    return [...ids].sort((a, b) => a - b).join(',');
};


export const useObservationStore = defineStore('observations', {
    state: (): ObservationStoreState => ({
        allDistrictObservations: {},
        allStateObservations: {},
        loading: {},
        error: null,
    }),

    getters: {
        getStateObservations: (state) => {
            return (stateId: string | number, taxaIds?: number[]): ObservationPoint[] => {
                const cacheKey = createCacheKey(taxaIds);
                return state.allStateObservations[stateId]?.[cacheKey] || [];
            }
        },
        getDistrictObservations: (state) => {
            return (districtId: string | number, taxaIds?: number[]): ObservationPoint[] => {
                const cacheKey = createCacheKey(taxaIds);
                return state.allDistrictObservations[districtId]?.[cacheKey] || [];
            };
        },
    },

    actions: {
        async fetchStateObservations(payload: {stateId: string|number; taxaIds?: number[]; forceRefresh?: boolean}) {
            const {stateId, taxaIds, forceRefresh = false} = payload;
            if(!stateId) return;

            const cacheKey = createCacheKey(taxaIds);

            if(this.allStateObservations[stateId]?.[cacheKey] && !forceRefresh){
                console.log(`Using cached observation points for state ${stateId} with filter: ${cacheKey}`);
                return;
            }

            const loadingKey = `state_${stateId}_${cacheKey}`;
            this.loading[loadingKey] = true;
            this.error = null;

            try {
                const params = taxaIds?.length ? {taxa_ids: taxaIds.join(',')} : {};
                const response = await api.get<ObservationPoint[]>(`/states/${stateId}/observations`, {params});

                if(!this.allStateObservations[stateId]){
                    this.allStateObservations[stateId] = {};
                }
                this.allStateObservations[stateId][cacheKey] = response.data;
                console.log(`Fetched and cached ${this.allStateObservations[stateId][cacheKey]?.length || 0} observations from state ${stateId} with filter: ${cacheKey}`);
            } catch (e: any) {
                this.error('fetchStateObservations error: ', e);
                if(this.allStateObservations[stateId]){
                    delete this.allStateObservations[stateId][cacheKey];
                }
            } finally {
                this.loading[loadingKey] = false;
            }
        },

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
                const response = await api.get<ObservationPoint[]>(`/districts/${districtId}/observations`, { params });

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
