<template>
    <div class="flex w-screen h-screen bg-slate-900 text-white overflow-hidden antialiased">
        <div class="flex-grow h-full relative">
            <div class="absolute inset-0 w-full h-full p-0 md:p-4">
                <svg ref="svgRefElement" class="w-full h-full rounded-lg shadow-2xl bg-slate-800"></svg>
            </div>

            <div v-if="mapIsInitialized"
                class="absolute top-3 left-3 md:top-5 md:left-5 z-10 breadcrumb-container flex items-center gap-2 text-sm md:text-base bg-slate-700/50 backdrop-blur-sm p-2 px-3 rounded-md shadow">
                <span v-if="navigation.breadcrumbs.value.length === 0 && !navigation.selectedCountry.value"
                    class="cursor-default text-slate-400 italic">
                    Loading Map...
                </span>
                <span v-else-if="navigation.breadcrumbs.value.length === 0 && navigation.selectedCountry.value"
                    @click="navigation.navigateToCrumbByIndex(0)"
                    class="hover:text-cyan-400 transition-colors duration-150 cursor-pointer font-medium">
                    {{ navigation.selectedCountry.value.properties.name }}
                </span>
                <template v-for="(crumb, index) in navigation.breadcrumbs.value"
                    :key="crumb.level + '-' + String(crumb.id)">
                    <span @click="navigation.navigateToCrumbByIndex(index)"
                        class="hover:text-cyan-400 transition-colors duration-150" :class="{
                            'cursor-pointer font-medium': index < navigation.breadcrumbs.value.length - 1,
                            'text-cyan-300 font-semibold cursor-default': index === navigation.breadcrumbs.value.length - 1,
                            'text-slate-300': index < navigation.breadcrumbs.value.length - 1
                        }">
                        {{ crumb.name }}
                    </span>
                    <span v-if="index < navigation.breadcrumbs.value.length - 1"
                        class="text-slate-500 select-none">&gt;</span>
                </template>
            </div>

            <div v-if="mapIsInitialized && scaleBarDisplay.data.value.visible"
                class="absolute bottom-4 left-4 md:bottom-6 md:left-6 z-10 p-2 px-3 bg-slate-700/60 backdrop-blur-sm rounded-md shadow text-xs md:text-sm select-none">
                <div class="flex items-center gap-2">
                    <div class="scale-line h-1 bg-slate-200 transition-all duration-300 ease-out"
                        :style="{ width: scaleBarDisplay.data.value.pixelWidth + 'px' }"></div>
                    <span class="scale-label text-slate-200">{{ scaleBarDisplay.data.value.label }}</span>
                </div>
            </div>
        </div>

        <div
            class="w-1/4 max-w-xs md:max-w-sm h-full bg-slate-800/70 backdrop-blur-md shadow-lg p-4 overflow-y-auto flex flex-col gap-6">
            <h2 class="text-xl font-semibold text-cyan-400 border-b border-slate-700 pb-2">Controls</h2>

            <div>
                <h3 class="text-sm font-medium text-slate-400 mb-1">Region Selection</h3>
                <select v-model="navigation.selectedStateId.value" @change="navigation.onStateSelected"
                    :disabled="!navigation.selectedCountry.value || navigation.stateOptions.value.length === 0"
                    class="control-dropdown mb-3" aria-label="Select State">
                    <option value="">-- Select State --</option>
                    <option v-for="st in navigation.stateOptions.value" :key="st.id" :value="st.id">{{ st.name }}
                    </option>
                </select>

                <select v-model="navigation.selectedDistrictId.value" @change="navigation.onDistrictSelected"
                    :disabled="!navigation.selectedStateId.value || navigation.districtOptions.value.length === 0"
                    class="control-dropdown" aria-label="Select District">
                    <option value="">-- Select District --</option>
                    <option v-for="dt in navigation.districtOptions.value" :key="dt.id" :value="dt.id">{{ dt.name }}
                    </option>
                </select>
            </div>

            <div>
                <h3 class="text-sm font-medium text-slate-400 mb-2">Statistic Mode</h3>
                <div class="mode-selector grid grid-cols-3 gap-1 p-1 bg-slate-700 rounded-md">
                    <button v-for="modeValue in (['observations', 'taxa', 'users'] as const)" :key="modeValue"
                        @click="navigation.setSelectedMode(modeValue)"
                        class="p-2 text-xs md:text-sm rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        :class="navigation.selectedMode.value === modeValue ? 'bg-cyan-600 text-white font-semibold shadow-md' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'">
                        {{ modeValue.charAt(0).toUpperCase() + modeValue.slice(1) }}
                    </button>
                </div>
            </div>

            <div v-if="mapIsInitialized && dataManager.currentStatRange.value.max > 0">
                <h3 class="text-sm font-medium text-slate-400 mb-2">Legend ({{ navigation.selectedMode.value }})</h3>
                <div class="legend bg-slate-700 p-3 rounded-md">
                    <div class="h-3 md:h-4 w-full rounded-sm"
                        :style="{ background: `linear-gradient(to right, ${choroplethColorsForTemplate.minStat}, ${choroplethColorsForTemplate.maxStat})` }">
                    </div>
                    <div class="flex justify-between text-xs text-slate-300 mt-1">
                        <span>{{ dataManager.currentStatRange.value.min.toLocaleString() }}</span>
                        <span>{{ dataManager.currentStatRange.value.max.toLocaleString() }}</span>
                    </div>
                </div>
            </div>
            <div v-else-if="mapIsInitialized && navigation.selectedMode.value"
                class="text-xs text-slate-500 italic mt-2">
                No {{ navigation.selectedMode.value }} data to display for current view or all values are zero.
            </div>

            <div v-if="dataManager.currentError.value"
                class="mt-auto bg-red-700/30 border border-red-600 text-red-300 px-3 py-2 rounded-md text-xs"
                role="alert">
                <strong class="font-bold block">Error:</strong>
                <span>{{ dataManager.currentError.value }}</span>
            </div>
        </div>

        <div v-if="dataManager.isLoading.value || !mapIsInitialized"
            class="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
            <div class="text-center">
                <svg class="animate-spin h-8 w-8 text-cyan-400 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg"
                    fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                    </path>
                </svg>
                <p class="text-lg text-slate-200">Loading Map Data...</p>
            </div>
        </div>

        <div v-if="d3Renderer.tooltip.visible.value"
            class="fixed z-50 p-3 text-sm bg-slate-800/95 text-slate-100 rounded-lg shadow-xl pointer-events-none border border-slate-700"
            :style="{ left: d3Renderer.tooltip.x.value + 'px', top: d3Renderer.tooltip.y.value + 'px', transform: 'translate(15px, 15px)' }">
            <div class="font-bold text-cyan-400 mb-1">{{ d3Renderer.tooltip.name.value }}</div>
            <div class="text-xs grid grid-cols-2 gap-x-3 gap-y-0.5">
                <span class="text-slate-400">Observations:</span><span class="text-right font-mono">{{
                    d3Renderer.tooltip.observations.value?.toLocaleString() ?? 'N/A' }}</span>
                <span class="text-slate-400">Taxa:</span><span class="text-right font-mono">{{
                    d3Renderer.tooltip.taxa.value?.toLocaleString() ?? 'N/A' }}</span>
                <span class="text-slate-400">Users:</span><span class="text-right font-mono">{{
                    d3Renderer.tooltip.users.value?.toLocaleString() ?? 'N/A' }}</span>
            </div>
        </div>

    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, watchEffect, readonly } from 'vue';
import * as d3 from 'd3';

import { useMapNavigationState, type StatMode } from '@/composables/map/useMapNavigationState';
import { useMapDataManager, type FeatureWithStats } from '@/composables/map/useMapDataManager';
import { useD3MapRenderer } from '@/composables/map/useD3MapRenderer';
import { useScaleBar } from '@/composables/map/useScaleBar';
import type { RegionFeature, RegionFeatureCollection } from '@/types/regions'; // Ensure this path is correct

const svgRefElement = ref<SVGSVGElement | null>(null);
const mapIsInitialized = ref(false);

console.log("MapView.vue: script setup begins");

const navigation = useMapNavigationState();
// console.log("MapView.vue: useMapNavigationState instantiated", navigation);

const dataManager = useMapDataManager({
    currentViewLevel: navigation.currentViewLevel,
    currentSelectedCountry: navigation.selectedCountry,
    currentSelectedStateId: navigation.selectedStateId,
    currentSelectedDistrictId: navigation.selectedDistrictId,
    currentSelectedMode: navigation.selectedMode,
    setCountryFeature: navigation.setCountryFeature,
});
// console.log("MapView.vue: useMapDataManager instantiated", dataManager);
// Log initial statRange to see its structure immediately after dataManager is created
// console.log("MapView.vue: Initial dataManager.currentStatRange.value:", dataManager.currentStatRange.value);


const d3Renderer = useD3MapRenderer(
    svgRefElement,
    (event: MouseEvent, feature: RegionFeature) => navigation.handleFeatureClick(feature),
    (transform: d3.ZoomTransform, projection: d3.GeoProjection, width: number, height: number) => {
        scaleBarDisplay.update(transform, projection, width, height);
    },
    () => navigation.handleMapBackgroundClick(),
    dataManager.currentStatRange, // Pass the stat range Ref
    navigation.selectedMode // Pass selectedMode Ref
);

const choroplethColorsForTemplate = d3Renderer.choroplethColors; // Assign to a variable for template

// console.log("MapView.vue: useD3MapRenderer instantiated", d3Renderer);
// Expose choroplethColors for the legend gradient in the template
const choroplethColors = d3Renderer.choroplethColors;


const scaleBarDisplay = useScaleBar();
// console.log("MapView.vue: useScaleBar instantiated", scaleBarDisplay);


onMounted(async () => {
    // console.log("MapView.vue: onMounted - begin");
    if (svgRefElement.value) {
        await d3Renderer.initializeMap(); // This now sets d3Renderer.isReady.value
        // console.log("MapView.vue: onMounted - D3 Map Initialized, d3Renderer.isReady:", d3Renderer.isReady.value);

        await dataManager.loadInitialDataAndStats();
        // console.log("MapView.vue: onMounted - Initial data and stats loaded.");

        mapIsInitialized.value = true;
        // console.log("MapView.vue: onMounted - mapIsInitialized set to true.");
    } else {
        // console.error("MapView.vue: svgRef is not available on mount.");
        dataManager.setErrorManually("Map canvas could not be initialized.");
    }
    // console.log("MapView.vue: onMounted - end");
});

onBeforeUnmount(() => {
    // console.log("MapView.vue: onBeforeUnmount");
    d3Renderer.destroyMap();
});

watch(
    [dataManager.featuresToDisplay, mapIsInitialized],
    ([currentFeaturesToDisplay, currentMapIsInitialized],
        [prevFeaturesToDisplay, prevMapIsInitialized]) => {
        if (currentMapIsInitialized && d3Renderer.isReady.value) {
            if (currentFeaturesToDisplay && currentFeaturesToDisplay.features.length > 0) {
                d3Renderer.renderFeatures(currentFeaturesToDisplay as any); // Cast might still be needed if type isn't perfectly aligned
            } else {
                d3Renderer.clearFeatures();
            }
        }
    },
    {
        deep: true,
    }
);


watch(
    [
        navigation.currentViewLevel,
        navigation.selectedStateId,
        navigation.selectedDistrictId,
        navigation.selectedMode
    ],
    async ([viewLevel, stateId, districtId, mode], [prevViewLevel, prevStateId, prevDistrictId, prevMode]) => {
        if (mapIsInitialized.value) {
            await dataManager.refreshMapFeaturesAndStats();
        }
    },
    { immediate: false }
);

watch(navigation.selectedCountry, async (newCountry, oldCountry) => {
    if (mapIsInitialized.value) {
        if (newCountry?.properties.id !== oldCountry?.properties.id) {
            await dataManager.refreshMapFeaturesAndStats();
        }
    } else if (mapIsInitialized.value && !newCountry) {
        d3Renderer.renderFeatures(null);
    }
});

</script>

<style scoped>
/* Your existing styles for .control-dropdown, .region, .label etc. */
.control-dropdown {
    @reference p-2 md:p-3 border border-slate-600 rounded-md text-sm w-full bg-slate-700/80 text-slate-100 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none backdrop-blur-sm shadow transition-all duration-150 ease-in-out;
}

.control-dropdown:disabled {
    @reference bg-slate-800/70 text-slate-500 cursor-not-allowed opacity-70;
}

.control-dropdown option {
    @reference bg-slate-700 text-white;
}

.region {
    cursor: pointer;
}
</style>