import { defineStore } from 'pinia';
import api from '@/services/api'; // Your API service

// Interface for a single region's stats
interface RegionStatValues {
    observations: number;
    taxa: number;
    users: number;
}

// Interface for the state of this store
interface StatsStoreState {
    country: RegionStatValues | null;
    // For /stats/states - all states stats keyed by state ID
    allStates: Record<string | number, RegionStatValues> | null;
    // For /stats/states/{stateId}/districts - districts keyed by state ID, then by district ID
    districtsInState: Record<string | number, Record<string | number, RegionStatValues>>;
    // For /stats/states/{stateId} - specific state's stats (can update allStates)
    // For /stats/districts/{districtId} - specific district's stats (more complex to store without state context)
    // We will primarily populate the collections above.

    loading: Record<string, boolean>; // More granular loading flags
    error: string | null;
}

export const useStatsStore = defineStore('stats', {
    state: (): StatsStoreState => ({
        country: null, // Was: { observations: 0, taxa: 0, users: 0 } -> init as null
        allStates: null,
        districtsInState: {}, // Example: { stateId1: { districtIdA: stats, districtIdB: stats } }
        loading: { // Granular loading flags
            country: false,
            allStates: false,
            // For state-specific and district-specific loading, you can use dynamic keys
            // e.g., loading[`state_${stateId}`] = true
        },
        error: null,
    }),
    actions: {
        // --- Error Handling ---
        setError(message: string | null) {
            this.error = message;
        },
        clearError() {
            this.error = null;
        },

        // --- Country Stats ---
        async fetchCountryStats() {
            this.loading.country = true;
            this.clearError();
            try {
                const response = await api.get<{ observations: number; taxa: number; users: number }>('/stats/country');
                this.country = response.data;
            } catch (e) {
                this.error = 'Failed to load country stats';
                this.country = null; // Reset on error
                console.error("fetchCountryStats error:", e);
            } finally {
                this.loading.country = false;
            }
        },

        // --- All States Stats ---
        // For API route: GET /stats/states
        // Expected response: { state_id_1: {stats}, state_id_2: {stats}, ... }
        async fetchAllStatesStats() {
            this.loading.allStates = true;
            this.clearError();
            try {
                const response = await api.get<Record<string | number, RegionStatValues>>('/stats/states');
                this.allStates = response.data; // Ensure this line correctly populates the state
            } catch (e) { /* ... error handling ... */ }
            finally { this.loading.allStates = false; }
        },

        // --- Specific State Stats ---
        // For API route: GET /stats/states/{stateId}
        // This action will fetch stats for a single state and update its entry in the allStates collection.
        async fetchStatsForState(stateId: string | number) {
            const loadingKey = `state_${stateId}`;
            this.loading[loadingKey] = true;
            this.clearError();
            try {
                const response = await api.get<RegionStatValues>(`/stats/states/${stateId}`);
                if (!this.allStates) {
                    this.allStates = {};
                }
                this.allStates[stateId] = response.data;
            } catch (e) {
                this.error = `Failed to load stats for state ${stateId}`;
                // Optionally remove or mark stale: delete this.allStates?.[stateId];
                console.error(`WorkspaceStatsForState (${stateId}) error:`, e);
            } finally {
                this.loading[loadingKey] = false;
            }
        },

        // --- Districts Stats By State ---
        // For API route: GET /stats/states/{stateId}/districts
        // Expected response: { district_id_1: {stats}, district_id_2: {stats}, ... }
        async fetchDistrictsStatsByState(stateId: string | number) {
            const loadingKey = `districts_in_state_${stateId}`;
            this.loading[loadingKey] = true;
            this.clearError();
            try {
                const response = await api.get<Record<string | number, RegionStatValues>>(`/stats/states/${stateId}/districts`);
                this.districtsInState[stateId] = response.data;
            } catch (e) {
                this.error = `Failed to load district stats for state ${stateId}`;
                // Optionally clear stale data: delete this.districtsInState[stateId];
                console.error(`WorkspaceDistrictsStatsByState (${stateId}) error:`, e);
            } finally {
                this.loading[loadingKey] = false;
            }
        },

        // --- Specific District Stats ---
        // For API route: GET /stats/districts/{districtId}
        // This one is a bit trickier for normalized storage without knowing the parent stateId from the API response itself.
        // Option 1: The API response for /stats/districts/{districtId} includes its parent state_id.
        // Option 2: The component calling this action provides the stateId.
        // Option 3: Store it in a separate, non-normalized field like `currentDistrictDetailStats`.
        // For now, let's go with Option 2 where the calling component might provide stateId, or it updates a generic field.
        // Let's assume we create a dedicated field for "currently viewed district's stats" if fetched standalone.
        // Alternatively, and more robustly for updating collections:
        async fetchStatsForDistrict(params: { districtId: string | number; stateId?: string | number }) {
            const { districtId, stateId } = params;
            const loadingKey = `district_${districtId}`;
            this.loading[loadingKey] = true;
            this.clearError();
            try {
                const response = await api.get<RegionStatValues & { state_id?: string | number }>(`/stats/districts/${districtId}`);
                const districtData = response.data;
                const parentStateId = stateId || districtData.state_id; // Prefer passed stateId, fallback to API response

                if (parentStateId) {
                    if (!this.districtsInState[parentStateId]) {
                        this.districtsInState[parentStateId] = {};
                    }
                    this.districtsInState[parentStateId][districtId] = {
                        observations: districtData.observations,
                        taxa: districtData.taxa,
                        users: districtData.users,
                    }; // Store/update it within its state's collection
                } else {
                    // Handle case where state_id is not available - perhaps store in a separate field
                    // Or throw an error / set a specific warning if normalization is strict
                    console.warn(`Workspaceed stats for district ${districtId}, but its parent state_id is unknown. Stats not fully normalized.`);
                    // Example: this.someOtherFieldForSingleDistrictStats = districtData;
                }

            } catch (e) {
                this.error = `Failed to load stats for district ${districtId}`;
                console.error(`WorkspaceStatsForDistrict (${districtId}) error:`, e);
            } finally {
                this.loading[loadingKey] = false;
            }
        }
    }
});