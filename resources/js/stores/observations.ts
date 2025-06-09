// src/stores/observations.ts

import { defineStore } from 'pinia';
import api from '@/services/api'; // Assuming your configured axios/api service is here

/**
 * Interface for a single observation point.
 * Matches the data selected in your Laravel controller.
 * Renamed to ObservationPoint for clarity.
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
     * RENAMED: Caches observation points for multiple districts.
     * The key is the district ID, and the value is the array of points for that district.
     * e.g., { 123: [ObservationPoint, ...], 456: [ObservationPoint, ...] }
     */
    allDistrictObservations: Record<string | number, ObservationPoint[]>;
    loading: boolean;
    error: string | null;
}

export const useObservationStore = defineStore('observations', {
    state: (): ObservationStoreState => ({
        allDistrictObservations: {}, // RENAMED
        loading: false,
        error: null,
    }),

    getters: {
        /**
         * UPDATED: A getter that returns a function to safely get points for a specific district.
         * Returns an empty array if the data isn't cached yet.
         * @param state - The store's state.
         * @returns A function that takes a districtId and returns its observation points.
         */
        getDistrictObservations: (state) => {
            return (districtId: string | number): ObservationPoint[] => {
                // Use the new state variable name
                return state.allDistrictObservations[districtId] || [];
            };
        },
    },

    actions: {
        /**
         * Fetches observation points for a given district from the API.
         * Implements caching: it will only make a network request if the data for the
         * specified districtId has not already been loaded into the state.
         *
         * @param payload - An object containing districtId and an optional forceRefresh flag.
         */
        async fetchDistrictObservations(payload: { districtId: string | number; forceRefresh?: boolean }) {
            const { districtId, forceRefresh = false } = payload;

            if (!districtId) {
                console.warn("fetchDistrictObservations called with no districtId.");
                return;
            }

            // Caching logic: If data exists and we are not forcing a refresh, do nothing.
            if (this.allDistrictObservations[districtId] && !forceRefresh) {
                console.log(`Using cached observation points for district ${districtId}.`);
                return;
            }
            
            this.loading = true;
            this.error = null;

            try {
                // IMPORTANT: The route path must match your api.php file.
                // Based on previous discussions, it was 'districts/{id}/observation-points'.
                // Your Laravel controller method name `districtObservations` implies the route might be `/district/{id}/observations`.
                // Please double-check this path.
                const response = await api.get<ObservationPoint[]>(`/districts/${districtId}/observations`);
                
                // CRITICAL FIX: Assign the entire response data array, not just the first element.
                this.allDistrictObservations[districtId] = response.data;
                
                console.log(`Fetched and cached ${this.allDistrictObservations[districtId]?.length || 0} observations from district ${districtId}.`);

            } catch (e: any) {
                this.error = `Failed to load observations for district ${districtId}`;
                console.error('fetchDistrictObservations error: ', e);
                // On error, remove the key to allow a re-fetch attempt next time.
                delete this.allDistrictObservations[districtId];
            } finally {
                this.loading = false;
            }
        },

        /**
         * Clears all cached district observation data from the store.
         * Useful when the user navigates away from the map or a full data reload is needed.
         */
        clearAllDistrictObservations() {
            this.allDistrictObservations = {};
            console.log("Cleared all cached district observation points.");
        },

        /**
         * Clears cached observation data for a single district.
         * @param districtId The ID of the district to clear from the cache.
         */
        clearObservationsForDistrict(districtId: string | number) {
            if (this.allDistrictObservations[districtId]) {
                delete this.allDistrictObservations[districtId];
                console.log(`Cleared cached observation points for district ${districtId}.`);
            }
        }
    }
});