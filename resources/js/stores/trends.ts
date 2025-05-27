import { defineStore } from 'pinia'
import api from '@/services/api'

export const useTrendStore = defineStore('trends', {
  state: () => ({
    timeline: <Record<string, any[]>>{},   // key = `${level}:${id}`
    cumulative: <Record<string, any[]>>{}
  }),
  actions: {
    async loadTimeline(level: 'country' | 'state' | 'district', id: number | null) {
      const key = `${level}:${id ?? 0}`
      if (this.timeline[key]) return
      const { data } = await api.get('/trends/observations', { params: { level, id } })
      this.timeline[key] = data
    }
  }
})
