import { defineStore } from 'pinia'
import api from '@/services/api'

export const useRegionStore = defineStore('regions', {
    state: () => ({
        states: <Record<number, GeoJSON.Feature>>{},
        districtsByState: <Record<number, GeoJSON.Feature[]>>{},
        country: null as GeoJSON.Feature | null,
        loading: false,
        error: null as string | null
    }),

    getters: {
        /** flattened list of all districts (rarely needed) */
        allDistricts(state) {
            return Object.values(state.districtsByState).flat()
        }
    },

    actions: {
        async fetchCountry() {
            if (this.country) return        // cached
            this.loading = true
            try {
                this.country = (await api.get('/regions/country')).data
            } catch (e) {
                this.error = 'Failed to load country boundary'
            } finally {
                this.loading = false
            }
        },

        async fetchStates() {
            if (Object.keys(this.states).length) return

            this.loading = true
            try {
                const res = await api.get('/regions/states')

                // Accept both shapes:
                // 1) plain array   →  [ {id,name,geometry}, … ]
                // 2) wrapped object→  { states:[…] }
                const list = Array.isArray(res.data) ? res.data
                    : (res.data.states ?? [])

                for (const f of list) this.states[f.id] = f
            } finally {
                this.loading = false
            }
        },


        /** lazy-fetch districts only when a state is opened */
        async fetchDistricts(stateId: number) {
            if (this.districtsByState[stateId]) return
            this.loading = true
            try {
                const res = await api.get(`/regions/states/${stateId}/districts`)
                const list = Array.isArray(res.data) ? res.data
                    : (res.data.districts ?? [])
                this.districtsByState[stateId] = list

            } finally { this.loading = false }
        },

        setError(errorMessage: string | null) {
            this.error = errorMessage;
        },
    }
})
