import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    dateRange: [null, null] as [string | null, string | null],
    selectedLevel: 'state' as 'country' | 'state' | 'district',
    selectedMetric: 'observations' as 'observations' | 'species' | 'users',
    mapViewport: { zoom: 4, center: [78.96, 22.59] }   // lng,lat
  }),
  actions: { setMetric(m) { this.selectedMetric = m } }
})
