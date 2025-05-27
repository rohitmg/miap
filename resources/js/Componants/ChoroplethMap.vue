<template>
    <div class="w-full h-full relative">
        <!-- UI controls -->
        <div class="absolute top-2 right-2 z-10 flex gap-2">
            <select v-model="selectedMetric" class="p-1 border rounded">
                <option value="observations">Observations</option>
                <option value="species">Species</option>
                <option value="users">Users</option>
            </select>
            <select v-model="selectedLevel" class="p-1 border rounded">
                <option value="state">State</option>
                <option value="district">District</option>
            </select>
        </div>
        <!-- D3 canvas -->
        <svg ref="svg" class="w-full h-full"></svg>
    </div>
</template>

<script setup lang="ts">
import * as d3 from 'd3'
import { onMounted, watch, ref, computed } from 'vue'
import axios from 'axios'
import { storeToRefs } from 'pinia'
import { useRegionStore } from '@/stores/regions'

/* ------------ state ------------- */
const regionStore = useRegionStore()
const { country } = storeToRefs(regionStore)

const svg = ref < SVGSVGElement | null > (null)
const selectedMetric = ref < 'observations' | 'species' | 'users' > ('observations')
const selectedLevel = ref < 'state' | 'district' > ('state')

const width = 800
const height = 600

/* ------------ drawing ------------ */
const drawMap = async () => {
    if (!country.value) return            // wait until boundary is loaded

    /* fetch choropleth data from backend */
    const res = await axios.get('/api/v1/map/choropleth', {
        params: { level: selectedLevel.value, metric: selectedMetric.value }
    })
    const geojson = res.data.geojson      // FeatureCollection for states|districts

    /* Fit projection using the country outline */
    const projection = d3.geoMercator()
        .fitSize([width, height], country.value)

    const path = d3.geoPath().projection(projection)

    /* Color scale */
    const vals = geojson.features.map(f => f.properties.value)
    const color = d3.scaleSequential()
        .domain([0, d3.max(vals) as number])
        .interpolator(d3.interpolateYlOrRd)

    /* Clear & redraw */
    const svgEl = d3.select(svg.value).attr('width', width).attr('height', height)
    svgEl.selectAll('*').remove()

    // draw country outline (thin stroke, transparent fill)
    svgEl.append('path')
        .datum(country.value)
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', '#888')
        .attr('stroke-width', 0.8)

    // draw choropleth layer
    svgEl.selectAll('path.region')
        .data(geojson.features)
        .join('path')
        .attr('class', 'region')
        .attr('d', path as any)
        .attr('fill', d => color(d.properties.value || 0))
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.4)
        .append('title')
        .text(d => `${d.properties.name}: ${d.properties.value}`)
}

/* ------------ lifecycle ---------- */
onMounted(async () => {
    await regionStore.fetchCountry()  // lazy-load country boundary
    drawMap()
})

watch([selectedMetric, selectedLevel, country], drawMap)
</script>

<style scoped>
select {
    background-color: white;
}
</style>