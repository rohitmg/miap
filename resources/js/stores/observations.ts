import { defineStore } from 'pinia'
import api from '@/services/api'

export interface Observation {
    id: number | string;
    latitude: number;
    longitude: number;
    user_id: number;
    taxon_id: number;
    observed_on: string;
}

interface ObservationStoreState {
    districtObservations: Record<string | number, Observation[]>;
    loading: boolean;
    error: string | null;
}

export const useObservationStore = defineStore('observations', {
    state: () => ({
        districtObservations: {},
        loading: false,
        error: null,
    }),
    getters: {
        getDistrictObservations: (state) => {
            return (districtId: string | number): Observation[] => {
                return state.districtObservations[districtId] || [];
            }
        }
    },
    actions: {
        async fetchDistrictObservations(payload: { districtId: string | number; forceRefresh?: boolean }) {
            const { districtId, forceRefresh = false } = payload;
            if(!districtId){
                console.warn("fetchDistrictObservations called with no districtId.");
                return;
            }

            if(this.districtObservations[districtId] && !forceRefresh){
                console.log(`Using cached observation points for district ${districtId}`);
                return;
            }
            
            this.loading = true;
            this.error = null;

            try{
                const response = await api.get<Observation[]>(`/districts/${districtId}/observations`);
                this.districtObservations[districtId] = response.data;
                console.log(`Fetched and cached ${response.data?.length || 0} observations from district ${districtId}`);
            } catch (e: any) {
                this.error = `Failed to load observations for district ${districtId}`;
                console.error('fetchDistrictObservations error: ', e);
                delete this.districtObservations[districtId];
            } finally {
                this.loading = false;
            }
        },
        clearAllDistrictObservations() {
            this.districtObservations = {};
            console.log("Cleared all cached district observation points.");
        }

    }
})
