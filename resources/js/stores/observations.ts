import { defineStore } from 'pinia'
import api from '@/services/api'

export const useObservationStore = defineStore('observations', {
  state: () => ({
    pins: [] as { lat:number; lng:number; taxon_id:number }[],
    loading:false, error:null as string|null
  }),
  actions: {
    async loadPins (params:{species_id?:number; start?:string; end?:string}) {
      this.loading = true
      try {
        const { data } = await api.get('/map/spread', { params })
        this.pins = data.observations
      } finally { this.loading = false }
    }
  }
})
