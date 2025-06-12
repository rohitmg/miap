<template>
    <div class="flex w-screen h-screen bg-slate-900 text-white overflow-hidden antialiased">
        <!-- Map Area -->
        <div class="flex-grow h-full relative">
            <div class="absolute inset-0 w-full h-full p-0 md:p-4">
                <svg ref="svgRefElement" class="w-full h-full rounded-lg shadow-2xl bg-slate-800"></svg>
            </div>

            <!-- Breadcrumbs -->
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

            <!-- Scale Bar -->
            <div v-if="mapIsInitialized && scaleBarDisplay.data.value.visible"
                class="absolute bottom-4 left-4 md:bottom-6 md:left-6 z-10 p-2 px-3 bg-slate-700/60 backdrop-blur-sm rounded-md shadow text-xs md:text-sm select-none">
                <div class="flex items-center gap-2">
                    <div class="scale-line h-1 bg-slate-200 transition-all duration-300 ease-out"
                        :style="{ width: scaleBarDisplay.data.value.pixelWidth + 'px' }"></div>
                    <span class="scale-label text-slate-200">{{ scaleBarDisplay.data.value.label }}</span>
                </div>
            </div>
        </div>

        <!-- Right Controls Panel -->
        <div
            class="w-1/4 max-w-xs md:max-w-sm h-full bg-slate-800/70 backdrop-blur-md shadow-lg p-4 overflow-y-auto flex flex-col gap-6">
            <h2 class="text-xl font-semibold text-cyan-400 border-b border-slate-700 pb-2">Controls</h2>

            <!-- Region Selection -->
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

            <!-- Statistic Mode -->
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

            <!-- Taxa Selection -->
            <div>
                <h3 class="text-sm font-medium text-slate-400 mb-2">Taxa Selection</h3>
                <div class="taxa-filter-container bg-slate-900/50 p-3 rounded-lg">
                    <input type="text" placeholder="Search species..."
                        class="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-sm placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                        :value="taxaStore.searchTerm"
                        @input="taxaStore.setSearchTerm(($event.target as HTMLInputElement).value)" />
                    <div v-if="taxaStore.selectedTaxa.length > 0" class="mt-3 flex flex-wrap gap-1.5">
                        <span v-for="taxon in taxaStore.selectedTaxa" :key="taxon.id"
                            class="flex items-center bg-cyan-800/70 text-cyan-100 text-xs font-medium px-2 py-1 rounded-full">
                            {{ taxon.name }}
                            <button @click="taxaStore.deselectTaxon(taxon.id)"
                                class="ml-1.5 -mr-0.5 p-0.5 rounded-full hover:bg-red-500/50" aria-label="Remove taxon">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20"
                                    fill="currentColor">
                                    <path fill-rule="evenodd"
                                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                        clip-rule="evenodd" />
                                </svg>
                            </button>
                        </span>
                    </div>
                    <div class="mt-2 max-h-40 overflow-y-auto border-t border-slate-700 pt-2">
                        <div v-if="taxaStore.availableTaxaForSelection.length > 0"
                            v-for="taxon in taxaStore.availableTaxaForSelection.slice(0, 50)" :key="`avail-${taxon.id}`"
                            @click="taxaStore.selectTaxon(taxon.id); taxaStore.setSearchTerm('')"
                            class="p-2 text-sm text-slate-200 hover:bg-slate-700 rounded-md cursor-pointer">
                            {{ taxon.name }}
                        </div>
                        <div v-else-if="taxaStore.searchTerm" class="p-2 text-xs text-slate-500 italic">No matching taxa
                            found.
                        </div>
                        <div v-else-if="taxaStore.allTaxa.length > 0 && taxaStore.availableTaxaForSelection.length === 0 && !taxaStore.searchTerm"
                            class="p-2 text-xs text-slate-500 italic">All available taxa selected.</div>
                    </div>
                </div>
            </div>

            <!-- CORRECTED & CONSOLIDATED: Observation Point Display Options -->
            <div v-if="navigation.currentViewLevel.value === 'district' && navigation.selectedDistrictId.value">
                <h3 class="text-sm font-medium text-slate-400 mb-2">Observation Display</h3>

                <div class="mode-selector grid grid-cols-2 gap-1 p-1 bg-slate-700 rounded-md mb-3">
                    <button @click="navigation.setDistrictObservationDisplayMode('none')"
                        class="p-2 text-xs md:text-sm rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        :class="navigation.districtObservationDisplayMode.value === 'none' ? 'bg-cyan-600 text-white font-semibold shadow-md' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'">Hide</button>
                    <button @click="navigation.setDistrictObservationDisplayMode('points')"
                        class="p-2 text-xs md:text-sm rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        :class="navigation.districtObservationDisplayMode.value === 'points' ? 'bg-cyan-600 text-white font-semibold shadow-md' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'">Points</button>
                    <button @click="navigation.setDistrictObservationDisplayMode('grid')"
                        class="p-2 text-xs md:text-sm rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        :class="navigation.districtObservationDisplayMode.value === 'grid' ? 'bg-cyan-600 text-white font-semibold shadow-md' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'">Grid</button>
                    <button @click="navigation.setDistrictObservationDisplayMode('heatmap')"
                        class="p-2 text-xs md:text-sm rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        :class="navigation.districtObservationDisplayMode.value === 'heatmap' ? 'bg-cyan-600 text-white font-semibold shadow-md' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'">Heatmap</button>
                </div>

                <div v-if="navigation.districtObservationDisplayMode.value === 'points'" class="mt-3">
                    <label for="point-radius" class="flex justify-between text-xs font-medium text-slate-400 mb-1">
                        <span>Point Radius</span>
                        <span class="font-mono text-cyan-300">{{ pointRadiusDisplayValue }}</span>
                    </label>
                    <input id="point-radius" type="range"
                        class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        min="0" :max="pointRadiusOptions.length - 1" step="1" :value="pointRadiusIndex"
                        @input="onPointRadiusSliderChange(($event.target as HTMLInputElement).value)" />
                </div>

                <div v-if="navigation.districtObservationDisplayMode.value === 'grid'" class="mt-3">
                    <label for="grid-size" class="flex justify-between text-xs font-medium text-slate-400 mb-1">
                        <span>Grid Size</span>
                        <span class="font-mono text-cyan-300">{{ gridSliderDisplayValue }}</span>
                    </label>
                    <input id="grid-size" type="range"
                        class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        min="0" :max="gridSizeOptions.length - 1" step="1" :value="gridSizeIndex"
                        @input="onGridSliderChange(($event.target as HTMLInputElement).value)" />
                </div>

                <div v-if="navigation.districtObservationDisplayMode.value === 'heatmap'" class="mt-3">
                    <h4 class="text-xs font-medium text-slate-400 mb-2">Intensity</h4>
                    <div class="mode-selector grid grid-cols-3 gap-1 p-1 bg-slate-900/50 rounded-md">
                        <button v-for="intensity in (['low', 'medium', 'high'] as const)" :key="intensity"
                            @click="navigation.setHeatmapIntensity(intensity)"
                            class="p-1.5 text-xs md:text-sm rounded transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            :class="navigation.heatmapIntensity.value === intensity ? 'bg-cyan-600 text-white font-semibold shadow-md' : 'bg-slate-600 hover:bg-slate-500 text-slate-200'">
                            {{ intensity.charAt(0).toUpperCase() + intensity.slice(1) }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Legend Section -->
            <div class="mt-auto pt-6">
                <div
                    v-if="mapIsInitialized && dataManager.currentStatRange.value.max > 0 && navigation.districtObservationDisplayMode.value === 'none'">
                    <h3 class="text-sm font-medium text-slate-400 mb-2">Legend ({{ navigation.selectedMode.value }})
                    </h3>
                    <div class="legend bg-slate-700 p-3 rounded-md">
                        <div class="h-3 md:h-4 w-full rounded-sm"
                            :style="{ background: `linear-gradient(to right, ${choroplethColors.minStat}, ${choroplethColors.midStat}, ${choroplethColors.maxStat})` }">
                        </div>
                        <div class="flex justify-between text-xs text-slate-300 mt-1">
                            <span>{{ dataManager.currentStatRange.value.min.toLocaleString() }}</span>
                            <span>{{ dataManager.currentStatRange.value.max.toLocaleString() }}</span>
                        </div>
                    </div>
                </div>
                <div
                    v-if="mapIsInitialized && navigation.districtObservationDisplayMode.value === 'grid' && dataManager.gridDensityRange.value.max > 0">
                    <h3 class="text-sm font-medium text-slate-400 mb-2">Grid Legend (Density)</h3>
                    <div class="legend bg-slate-700 p-3 rounded-md">
                        <div class="h-3 md:h-4 w-full rounded-sm"
                            style="background: linear-gradient(to right, #fef0d9, #fdcc8a, #fc8d59, #e34a33, #b30000);">
                        </div>
                        <div class="flex justify-between text-xs text-slate-300 mt-1">
                            <span>{{ dataManager.gridDensityRange.value.min.toLocaleString() }}</span>
                            <span>{{ dataManager.gridDensityRange.value.max.toLocaleString() }}</span>
                        </div>
                    </div>
                </div>
                <div v-else-if="mapIsInitialized && navigation.districtObservationDisplayMode.value === 'none' && navigation.selectedMode.value && dataManager.currentStatRange.value.max === 0"
                    class="text-xs text-slate-500 italic mt-2">
                    No {{ navigation.selectedMode.value }} data for current view or all values are zero.
                </div>
            </div>

            <!-- Error Message -->

            <div v-if="dataManager.currentError.value"
                class="mt-auto bg-red-700/30 border border-red-600 text-red-300 px-3 py-2 rounded-md text-xs"
                role="alert">
                <strong class="font-bold block">Error:</strong>
                <span>{{ dataManager.currentError.value }}</span>
            </div>
        </div>

        <!-- Loading Indicator -->
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

        <!-- Tooltip -->
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
import { ref, onMounted, onBeforeUnmount, watch, computed, readonly } from 'vue';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';

import { useMapNavigationState, type StatMode } from '@/composables/map/useMapNavigationState';
import { useMapDataManager, type FeatureWithStats } from '@/composables/map/useMapDataManager';
import { useD3MapRenderer } from '@/composables/map/useD3MapRenderer';
import { useScaleBar } from '@/composables/map/useScaleBar';
import type { RegionFeature, RegionFeatureCollection } from '@/types/regions';
import { useTaxaStore } from '@/stores/taxa';

const svgRefElement = ref<SVGSVGElement | null>(null);
const mapIsInitialized = ref(false);

const navigation = useMapNavigationState();
const taxaStore = useTaxaStore();
const { selectedTaxaIds } = storeToRefs(taxaStore);

const dataManager = useMapDataManager({
    currentViewLevel: navigation.currentViewLevel,
    currentSelectedCountry: navigation.selectedCountry,
    currentSelectedStateId: navigation.selectedStateId,
    currentSelectedDistrictId: navigation.selectedDistrictId,
    currentSelectedMode: navigation.selectedMode,
    currentObservationDisplayMode: navigation.districtObservationDisplayMode,
    setCountryFeature: navigation.setCountryFeature,
});

const currentDistrictFeature = computed(() => {
    if (navigation.currentViewLevel.value === 'district' && navigation.selectedDistrictId.value) {
        return dataManager.featuresToDisplay.value?.features[0] as FeatureWithStats | undefined;
    }
    return null;
});

// Logic for discrete sliders
const pointRadiusOptions = [100, 1000, 10000];
const pointRadiusIndex = computed(() => {
    const index = pointRadiusOptions.indexOf(navigation.pointRadiusMeters.value);
    return index === -1 ? 1 : index;
});
const pointRadiusDisplayValue = computed(() => {
    const val = navigation.pointRadiusMeters.value;
    return val >= 1000 ? `${val / 1000}km` : `${val}m`;
});
const onPointRadiusSliderChange = (indexStr: string) => {
    navigation.setPointRadius(pointRadiusOptions[parseInt(indexStr, 10)]);
};

const gridSizeOptions = [100, 500, 1000, 2500, 5000, 10000, 50000, 100000];
const gridSizeIndex = computed(() => {
    const index = gridSizeOptions.indexOf(navigation.selectedGridSize.value);
    return index === -1 ? 2 : index;
});
const gridSliderDisplayValue = computed(() => {
    const val = navigation.selectedGridSize.value;
    return val >= 1000 ? `${val / 1000}km` : `${val}m`;
});
const onGridSliderChange = (indexStr: string) => {
    navigation.setSelectedGridSize(gridSizeOptions[parseInt(indexStr, 10)]);
};

const scaleBarDisplay = useScaleBar();

const d3Renderer = useD3MapRenderer(
    svgRefElement,
    (event: MouseEvent, feature: RegionFeature) => navigation.handleFeatureClick(feature),
    (transform, projection, width, height) => scaleBarDisplay.update(transform, projection, width, height),
    () => navigation.handleMapBackgroundClick(),
    dataManager.currentStatRange,
    navigation.districtObservationDisplayMode,
    navigation.selectedGridSize,
    navigation.selectedDistrictId,
    currentDistrictFeature,
    navigation.heatmapIntensity,
    dataManager.setGridDensityRange,
    navigation.pointRadiusMeters
);

const choroplethColors = d3Renderer.choroplethColors;

onMounted(async () => {
    if (svgRefElement.value) {
        await d3Renderer.initializeMap();
        await taxaStore.fetchAllTaxa();
        await dataManager.loadInitialDataAndStats();
        mapIsInitialized.value = true;

        // Explicitly render after everything is loaded.
        d3Renderer.renderFeatures(dataManager.featuresToDisplay.value as any);
    } else {
        dataManager.setErrorManually("Map canvas could not be initialized.");
    }
});

onBeforeUnmount(() => {
    d3Renderer.destroyMap();
});

// --- WATCHERS (REFINED) ---

// This watcher handles re-rendering when the feature data itself changes.
// It is the most robust way to ensure the map updates when its source data is new.
watch(
    () => dataManager.featuresToDisplay.value,
    (newFeaturesCollection) => {
        if (mapIsInitialized.value && d3Renderer.isReady.value) {
            d3Renderer.renderFeatures(newFeaturesCollection as any);
        }
    },
    { deep: true }
);

// This watcher handles re-fetching all necessary data (GeoJSON + Stats + Observation Points)
// when the fundamental data context changes.
watch(
    [
        navigation.currentViewLevel,
        navigation.selectedStateId,
        navigation.selectedDistrictId,
        navigation.selectedMode,
        selectedTaxaIds, // The taxa filter
        navigation.districtObservationDisplayMode, // <<< FIX: ADDED THIS
    ],
    async () => {
        if (mapIsInitialized.value) {
            await dataManager.refreshMapFeaturesAndStats();
        }
    },
    { deep: true } // Use deep watch for selectedTaxaIds (Set)
);

// The watchers for client-side visual changes (grid size, etc.) and for country context changes
// are now implicitly handled by the watchers inside useD3MapRenderer.ts and the main data-fetching
// watcher above, so dedicated empty watchers for them here are not necessary.

</script>



<style scoped>
/* If using Tailwind, these would likely be in a <style lang="postcss"> block or using direct utilities */
.control-dropdown {
    @reference p-2 md:p-3 border border-slate-600 rounded-md text-sm w-full bg-slate-700/80 text-slate-100 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none backdrop-blur-sm shadow transition-all duration-150 ease-in-out;
}

.control-dropdown:disabled {
    @reference bg-slate-800/70 text-slate-500 cursor-not-allowed opacity-70;
}

.control-dropdown option {
    /* For some browsers, option styling is limited. This works in Firefox. */
    @reference bg-slate-700 text-white;
}

.region {
    cursor: pointer;
}
</style>
