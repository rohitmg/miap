import { defineStore } from 'pinia'
import api from '@/services/api' 

export const useSpeciesStore = defineStore('species', {
  state: () => ({
    top: [] as { taxon_id:number; count:number }[],
    profiles: <Record<number, any>>{},   // keeps lazy-loaded species pages
    expansion: <Record<number, any>>{}   // range-expansion timelines
  }),

  actions: {
    async loadTop(regionId?:number) {
      const { data } = await api.get('/species/top', { params:{ region_id:regionId }})
      this.top = data
    },
    async loadProfile(id:number) {
      if (this.profiles[id]) return
      this.profiles[id] = (await api.get(`/species/${id}/profile`)).data
    },
    async loadExpansion(id:number) {
      if (this.expansion[id]) return
      this.expansion[id] = (await api.get(`/species/${id}/expansion`)).data
    }
  }
})
