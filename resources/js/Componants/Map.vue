<template>
    <div class="relative w-screen h-screen bg-slate-900 text-white overflow-hidden antialiased">

        <div class="absolute inset-0 w-full h-full p-0 md:p-4">
            <svg ref="svgRef" class="w-full h-full rounded-lg shadow-2xl bg-slate-800"></svg>
        </div>

        <div
            class="absolute top-0 left-0 right-0 z-10 p-3 md:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-transparent">
            <div
                class="breadcrumb-container flex items-center gap-2 text-sm md:text-base bg-slate-700/50 backdrop-blur-sm p-2 px-3 rounded-md shadow">
                <span v-if="breadcrumbs.length === 0 && !selectedCountry" class="cursor-default text-slate-400 italic">
                    Loading Map...
                </span>
                <span v-else-if="breadcrumbs.length === 0 && selectedCountry"
                    @click="navigateToCrumb({ name: selectedCountry.properties.name, level: 'country', feature: selectedCountry, id: selectedCountry.properties.id }, 0)"
                    class="hover:text-cyan-400 transition-colors duration-150 cursor-pointer font-medium">
                    {{ selectedCountry.properties.name }}
                </span>
                <template v-for="(crumb, index) in breadcrumbs" :key="crumb.level + '-' + String(crumb.id)">
                    <span @click="navigateToCrumb(crumb, index)"
                        class="hover:text-cyan-400 transition-colors duration-150" :class="{
                            'cursor-pointer font-medium': index < breadcrumbs.length - 1,
                            'text-cyan-300 font-semibold cursor-default': index === breadcrumbs.length - 1,
                            'text-slate-300': index < breadcrumbs.length - 1
                        }">
                        {{ crumb.name }}
                    </span>
                    <span v-if="index < breadcrumbs.length - 1" class="text-slate-500 select-none">&gt;</span>
                </template>
            </div>

            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <select v-model="selectedStateId" @change="handleStateDropdownChange"
                    :disabled="!selectedCountry || stateOptions.length === 0" class="control-dropdown"
                    aria-label="Select State">
                    <option value="">-- Select State --</option>
                    <option v-for="st in stateOptions" :key="st.id" :value="st.id">{{ st.name }}</option>
                </select>

                <select v-model="selectedDistrictId" @change="handleDistrictDropdownChange"
                    :disabled="!selectedStateId || districtOptions.length === 0" class="control-dropdown"
                    aria-label="Select District">
                    <option value="">-- Select District --</option>
                    <option v-for="dt in districtOptions" :key="dt.id" :value="dt.id">{{ dt.name }}</option>
                </select>
            </div>
        </div>


        <div v-if="scaleBar.visible"
            class="absolute bottom-4 left-4 md:bottom-6 md:left-6 z-10 p-2 px-3 bg-slate-700/60 backdrop-blur-sm rounded-md shadow text-xs md:text-sm select-none">
            <div class="flex items-center gap-2">
                <div class="scale-line h-1 bg-slate-200 transition-all duration-300 ease-out"
                    :style="{ width: scaleBar.pixelWidth + 'px' }"></div>
                <span class="scale-label text-slate-200">{{ scaleBar.label }}</span>
            </div>
        </div>

        <div v-if="error"
            class="absolute bottom-4 right-4 z-20 bg-red-700/80 backdrop-blur-sm border-l-4 border-red-400 text-white p-3 rounded-md shadow-lg max-w-xs text-sm"
            role="alert">
            <strong class="font-bold block mb-1">Map Error:</strong>
            <span>{{ error }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import * as d3 from 'd3';
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useRegionStore } from '@/stores/regions';
import { useStatsStore } from '@/stores/stats';
import { Geometry, Feature, FeatureCollection } from 'geojson';

interface RegionProperties {
    id: string | number;
    name: string;
}
type RegionFeature = Feature<Geometry, RegionProperties>;
type RegionFeatureCollection = FeatureCollection<Geometry, RegionProperties>;

/* ───────── Pinia Store ───────── */
const regionStore = useRegionStore();
const {
    country: storeCountry,
    states: storeStates,
    districtsByState: storeDistrictsByState,
    error
} = storeToRefs(regionStore);

const statsStore = useStatsStore();
const { stats } = storeToRefs(statsStore);

/* ───────── View State & Configuration ───────── */
type ViewLevel = 'country' | 'state' | 'district';
const currentViewLevel = ref<ViewLevel>('country');

const selectedCountry = ref<RegionFeature | null>(null);
const selectedStateId = ref<string | number>('');
const selectedDistrictId = ref<string | number>('');

const breadcrumbs = ref<{ name: string; level: ViewLevel; feature?: RegionFeature; id?: string | number }[]>([]);

const scaleBar = ref({ visible: false, label: '0 km', pixelWidth: 0 });
const mapColors = {
    baseFill: 'oklch(0.45 0.05 250 / 0.7)',
    hoverFill: 'oklch(0.55 0.06 255 / 0.85)',
    stroke: 'oklch(0.7 0.03 260)',
    label: 'oklch(0.95 0.01 270)',
    labelShadow: 'rgba(10, 20, 40, 0.7)',
};

/* ───────── SVG and D3 Setup ───────── */
const svgRef = ref<SVGSVGElement | null>(null);
const svgWidth = ref(0);
const svgHeight = ref(0);
let svgSel: d3.Selection<SVGSVGElement, unknown, null, undefined> | undefined;
let gMain: d3.Selection<SVGGElement, unknown, null, undefined> | undefined;
const projection = d3.geoMercator();
const pathGenerator = d3.geoPath().projection(projection);

/* ───────── Computed Properties for Dropdowns ───────── */
const stateOptions = computed(() => {
    if (!selectedCountry.value || !storeStates.value || Object.keys(storeStates.value).length === 0) return [];
    return Object.values(storeStates.value).map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
});

const districtOptions = computed(() => {
    if (!selectedStateId.value || !storeDistrictsByState.value[selectedStateId.value] || storeDistrictsByState.value[selectedStateId.value].length === 0) return [];
    return storeDistrictsByState.value[selectedStateId.value].map(d => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name));
});

/* ───────── GeoJSON Feature Conversion ───────── */
const parseGeom = (g: any): Geometry => { try { return typeof g === 'string' ? JSON.parse(g) : g; } catch (e) { console.error("Error parsing geometry:", g, e); throw new Error(`Error parsing geometry: ${e instanceof Error ? e.message : String(e)}`); } };
const toFeature = (row: any, defaultName = 'Unnamed Region'): RegionFeature => { const geometry = row.geometry ?? row.boundary; if (!geometry) { console.error("Geometry is missing for region:", row); throw new Error(`Geometry is missing for region: ${row.name || defaultName}`); } return { type: 'Feature', properties: { id: row.id, name: row.name || defaultName }, geometry: parseGeom(geometry) }; };

/* ───────── D3 Zoom Behavior ───────── */
const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 25])
    .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (!gMain) return;
        gMain.attr('transform', event.transform.toString());
        const k = event.transform.k;
        // FIX: Define minFontSize here
        const minFontSize = 5;
        const baseFontSize = 10;
        const font = Math.max(minFontSize, baseFontSize / Math.sqrt(k));
        gMain.selectAll<SVGTextElement, RegionFeature>('text.label').attr('font-size', `${font}px`);

        const baseStrokeWidth = 1.5;
        // FIX: Define strokeWidth here, was implicitly global before
        const strokeWidth = Math.max(0.2, baseStrokeWidth / k);
        gMain.selectAll<SVGPathElement, RegionFeature>('path.region').attr('stroke-width', strokeWidth);
        updateScaleBar();
    });

/* ───────── HTML Scale Bar Logic (Corrected) ───────── */
function updateScaleBar() {
    if (!svgSel || !projection || svgWidth.value === 0 || svgHeight.value === 0 || !gMain?.attr('transform')) {
        scaleBar.value.visible = false; return;
    }
    try {
        const currentTransform = d3.zoomTransform(svgSel.node()!);
        const R = 6371;

        const unzoomedTopLeft = currentTransform.invert([0, 0]);
        const unzoomedTopRight = currentTransform.invert([svgWidth.value, 0]);
        const geoTopLeft = projection.invert!(unzoomedTopLeft);
        const geoTopRight = projection.invert!(unzoomedTopRight);

        if (!geoTopLeft || !geoTopRight) { scaleBar.value.visible = false; return; }
        const visibleWidthKm = d3.geoDistance(geoTopLeft, geoTopRight) * R;

        let targetKm: number;
        const niceKmValues = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
        targetKm = niceKmValues.find(v => v < visibleWidthKm / 2.5) || niceKmValues[niceKmValues.length - 1];

        const [centerLon, centerLat] = projection.invert!(currentTransform.invert([svgWidth.value / 2, svgHeight.value / 2]));
        if (centerLon === undefined || centerLat === undefined) { scaleBar.value.visible = false; return; }

        const dLon = (targetKm / (R * Math.cos(centerLat * Math.PI / 180))) * (180 / Math.PI);
        const geoP1 = [centerLon - dLon / 2, centerLat] as [number, number];
        const geoP2 = [centerLon + dLon / 2, centerLat] as [number, number];
        const unzoomedP1 = projection(geoP1);
        const unzoomedP2 = projection(geoP2);

        if (!unzoomedP1 || !unzoomedP2) { scaleBar.value.visible = false; return; }
        const screenP1 = currentTransform.apply(unzoomedP1);
        const screenP2 = currentTransform.apply(unzoomedP2);
        let pixelLen = Math.abs(screenP2[0] - screenP1[0]);

        const maxPixelWidth = Math.min(150, svgWidth.value * 0.25);
        if (pixelLen > maxPixelWidth) {
            const ratio = maxPixelWidth / pixelLen; pixelLen = maxPixelWidth; targetKm *= ratio;
            if (targetKm > 10) targetKm = Math.round(targetKm / 5) * 5;
            else if (targetKm > 1) targetKm = Math.round(targetKm);
            else targetKm = parseFloat(targetKm.toFixed(targetKm < 0.1 ? 2 : 1));
        }
        if (isNaN(pixelLen) || pixelLen <= 5) { scaleBar.value.visible = false; return; }
        scaleBar.value = { visible: true, label: `${targetKm.toLocaleString()} km`, pixelWidth: Math.round(pixelLen) };
    } catch (e) { console.warn("Error updating scale bar:", e); scaleBar.value.visible = false; }
}

/* ───────── Breadcrumb Management ───────── */
function updateBreadcrumbs() {
    const newCrumbs: typeof breadcrumbs.value = [];
    if (selectedCountry.value) {
        newCrumbs.push({ name: selectedCountry.value.properties.name, level: 'country', feature: selectedCountry.value, id: selectedCountry.value.properties.id });
        if (selectedStateId.value && storeStates.value[selectedStateId.value]) {
            const state = storeStates.value[selectedStateId.value];
            newCrumbs.push({ name: state.name, level: 'state', feature: toFeature(state), id: state.id });
            if (selectedDistrictId.value && storeDistrictsByState.value[selectedStateId.value]) {
                const district = storeDistrictsByState.value[selectedStateId.value].find(d => d.id === selectedDistrictId.value);
                if (district) {
                    newCrumbs.push({ name: district.name, level: 'district', feature: toFeature(district), id: district.id });
                }
            }
        }
    }
    breadcrumbs.value = newCrumbs;
}

async function navigateToCrumb(crumb: typeof breadcrumbs.value[0], index: number) {
    // Prevent navigation if already at the deepest level of the clicked crumb
    if (index === breadcrumbs.value.length - 1 && currentViewLevel.value === crumb.level &&
        ((crumb.level === 'country' && selectedCountry.value?.properties.id === crumb.id) ||
            (crumb.level === 'state' && selectedStateId.value === crumb.id) ||
            (crumb.level === 'district' && selectedDistrictId.value === crumb.id))
    ) {
        return;
    }

    currentViewLevel.value = crumb.level;
    if (crumb.level === 'country') {
        selectedStateId.value = ''; selectedDistrictId.value = '';
        if (crumb.feature) selectedCountry.value = crumb.feature;
        // If country feature is not in crumb (e.g. initial crumb), ensure selectedCountry is set from store
        else if (storeCountry.value && (!selectedCountry.value || selectedCountry.value.properties.id !== storeCountry.value.id)) {
            selectedCountry.value = toFeature(storeCountry.value);
        }
    } else if (crumb.level === 'state') {
        selectedStateId.value = crumb.id!; selectedDistrictId.value = '';
        // Ensure selectedCountry is set if not already (e.g. page reload state)
        if (!selectedCountry.value && storeCountry.value) {
            selectedCountry.value = toFeature(storeCountry.value);
        }
    } else if (crumb.level === 'district') {
        selectedDistrictId.value = crumb.id!;
        // selectedStateId and selectedCountry should already be set from previous breadcrumbs
    }
    await refreshMap();
}

/* ───────── Map Feature Click Handler (Corrected) ───────── */
async function handleFeatureClick(event: MouseEvent, d: RegionFeature) {
    event.stopPropagation();

    if (currentViewLevel.value === 'country') {
        selectedCountry.value = d;
        currentViewLevel.value = 'state';
        selectedStateId.value = '';
        selectedDistrictId.value = '';
    } else if (currentViewLevel.value === 'state') {
        if (storeStates.value[d.properties.id]) {
            selectedStateId.value = d.properties.id;
            currentViewLevel.value = 'district';
            selectedDistrictId.value = '';
            await regionStore.fetchDistricts(+selectedStateId.value);
        }
    } else if (currentViewLevel.value === 'district') {
        if (selectedStateId.value && storeDistrictsByState.value[selectedStateId.value]?.find(dist => dist.id === d.properties.id)) {
            selectedDistrictId.value = d.properties.id;
        }
    }
    await refreshMap();
}

/* ───────── Dropdown Change Handlers (Corrected) ───────── */
async function handleStateDropdownChange() {
    selectedDistrictId.value = '';
    if (selectedStateId.value) {
        currentViewLevel.value = 'district';
        await regionStore.fetchDistricts(+selectedStateId.value);
    } else {
        currentViewLevel.value = 'state';
    }
    await refreshMap();
}

async function handleDistrictDropdownChange() {
    await refreshMap();
}

/* ───────── Core Drawing Logic ───────── */
function drawFeatures(featuresToDraw: RegionFeatureCollection | null) {
    if (!svgSel || !gMain || svgWidth.value === 0 || svgHeight.value === 0) { console.warn("Drawing prerequisites not met."); return; }
    if (!featuresToDraw || featuresToDraw.features.length === 0) { gMain.selectAll("*").remove(); scaleBar.value.visible = false; console.warn("No features to draw."); return; }

    projection.fitSize([svgWidth.value, svgHeight.value], featuresToDraw);
    const featureData = featuresToDraw.features;

    gMain.selectAll<SVGPathElement, RegionFeature>('path.region').data(featureData, d => String(d.properties.id)).join(enter => enter.append('path').attr('class', 'region').attr('d', pathGenerator).attr('fill', mapColors.baseFill).attr('stroke', mapColors.stroke).attr('stroke-width', 1.5 / (projection.scale() / 1000)).style('opacity', 0).on('click', handleFeatureClick).on('mouseenter', function () { d3.select(this).attr('fill', mapColors.hoverFill); }).on('mouseleave', function () { d3.select(this).attr('fill', mapColors.baseFill); }).call(s => s.transition("enter-fade").duration(500).style('opacity', 1)), update => update.call(s => s.transition("update-path").duration(750).attr('d', pathGenerator).attr('stroke-width', 1.5 / (projection.scale() / 1000))), exit => exit.call(s => s.transition("exit-fade").duration(300).style('opacity', 0).remove()));
    gMain.selectAll<SVGTextElement, RegionFeature>('text.label').data(featureData, d => String(d.properties.id)).join(enter => enter.append('text').attr('class', 'label').attr('text-anchor', 'middle').attr('dominant-baseline', 'central').attr('fill', mapColors.label).style('pointer-events', 'none').style('user-select', 'none').style('text-shadow', `0 0 3px ${mapColors.labelShadow}, 0 0 5px ${mapColors.labelShadow}`).attr('x', d => pathGenerator.centroid(d)[0]).attr('y', d => pathGenerator.centroid(d)[1]).text(d => d.properties.name).attr('font-size', `${10 / Math.sqrt(projection.scale() / 1000)}px`).style('opacity', 0).call(s => s.transition("enter-label-fade").duration(500).delay(150).style('opacity', 1)), update => update.call(s => s.transition("update-label").duration(750).attr('x', d => pathGenerator.centroid(d)[0]).attr('y', d => pathGenerator.centroid(d)[1]).text(d => d.properties.name)), exit => exit.call(s => s.transition("exit-label-fade").duration(300).style('opacity', 0).remove()));

    const [[x0, y0], [x1, y1]] = pathGenerator.bounds(featuresToDraw);
    if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1) || (x1 - x0 === 0 && y1 - y0 === 0 && featuresToDraw.features.length > 0)) {
        console.warn("Invalid bounds for features, attempting to center on first feature.");
        if (svgSel && zoomBehavior && featuresToDraw.features.length > 0) {
            const firstFeatureCentroid = pathGenerator.centroid(featuresToDraw.features[0]);
            if (isFinite(firstFeatureCentroid[0]) && isFinite(firstFeatureCentroid[1])) {
                const defaultScale = featuresToDraw.features.length === 1 ? 5 : 2; // Zoom in more for a single feature
                svgSel.transition("zoom-invalid-bounds").duration(750)
                    .call(zoomBehavior.transform, d3.zoomIdentity
                        .translate(svgWidth.value / 2, svgHeight.value / 2)
                        .scale(defaultScale)
                        .translate(-firstFeatureCentroid[0], -firstFeatureCentroid[1])
                    );
            } else { // Fallback if centroid is also invalid
                svgSel.transition("zoom-identity-fallback").duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
            }
        } else if (svgSel && zoomBehavior) { // No features, reset zoom
            svgSel.transition("zoom-identity-no-features").duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
        }
    } else {
        const newScale = Math.min(zoomBehavior.scaleExtent()[1], 0.9 / Math.max((x1 - x0) / svgWidth.value, (y1 - y0) / svgHeight.value));
        const newTransform = d3.zoomIdentity.translate(svgWidth.value / 2, svgHeight.value / 2).scale(newScale).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
        if (svgSel && zoomBehavior) {
            svgSel.transition("zoom-fit").duration(750).call(zoomBehavior.transform, newTransform);
        }
    }
    updateScaleBar();
}

/* ───────── Main Map Refresh Logic (Corrected) ───────── */
async function refreshMap() {
    let featuresToDisplay: RegionFeature[] = [];
    regionStore.setError(null);

    try {
        if (currentViewLevel.value === 'country') {
            if (storeCountry.value) {
                if (!selectedCountry.value || selectedCountry.value.properties.id !== storeCountry.value.id) {
                    selectedCountry.value = toFeature(storeCountry.value, "Country");
                }
                featuresToDisplay = [selectedCountry.value!]; // Assert non-null as it's set if storeCountry exists
            } else {
                console.warn("Country data not available for 'country' view level.");
            }
        } else if (currentViewLevel.value === 'state') {
            if (selectedCountry.value && storeStates.value) {
                featuresToDisplay = Object.values(storeStates.value).map(s => toFeature(s, "State"));
            } else if (storeCountry.value) {
                currentViewLevel.value = 'country';
                selectedCountry.value = toFeature(storeCountry.value, "Country");
                featuresToDisplay = [selectedCountry.value];
                console.warn("Switched to country view as state data was not available for selected country.");
            } else {
                console.warn("Cannot display states: selected country or states data is missing.");
            }
        } else if (currentViewLevel.value === 'district') {
            if (selectedStateId.value) {
                if (!storeDistrictsByState.value[selectedStateId.value] || storeDistrictsByState.value[selectedStateId.value].length === 0) {
                    console.log(`Fetching districts for state ID: ${selectedStateId.value}`);
                    await regionStore.fetchDistricts(+selectedStateId.value);
                }

                const districtsForState = storeDistrictsByState.value[selectedStateId.value];
                if (districtsForState && districtsForState.length > 0) {
                    if (selectedDistrictId.value) {
                        const district = districtsForState.find(d => d.id === selectedDistrictId.value);
                        if (district) {
                            featuresToDisplay = [toFeature(district, "District")];
                        } else {
                            featuresToDisplay = districtsForState.map(d => toFeature(d, "District"));
                            selectedDistrictId.value = '';
                            console.warn(`Selected district ID ${selectedDistrictId.value} not found, showing all districts for state ${selectedStateId.value}.`);
                        }
                    } else {
                        featuresToDisplay = districtsForState.map(d => toFeature(d, "District"));
                    }
                } else {
                    console.warn(`No districts found for state ID: ${selectedStateId.value}. Falling back to state view.`);
                    currentViewLevel.value = 'state'; // Fallback to showing all states
                    if (selectedCountry.value && storeStates.value) {
                        featuresToDisplay = Object.values(storeStates.value).map(s => toFeature(s, "State"));
                    } else if (storeCountry.value) { // Further fallback to country
                        currentViewLevel.value = 'country';
                        selectedCountry.value = toFeature(storeCountry.value, "Country");
                        featuresToDisplay = [selectedCountry.value];
                    }
                }
            } else if (selectedCountry.value) {
                currentViewLevel.value = 'state';
                featuresToDisplay = storeStates.value ? Object.values(storeStates.value).map(s => toFeature(s, "State")) : [];
                console.warn("No state selected for district view, falling back to state view.");
            } else {
                console.warn("Cannot display districts: no state or country selected.");
            }
        }

        if (featuresToDisplay.length > 0) {
            drawFeatures({ type: 'FeatureCollection', features: featuresToDisplay });
        } else {
            if (gMain) gMain.selectAll("*").remove();
            scaleBar.value.visible = false;
            console.warn("No features determined for display at current level:", currentViewLevel.value, "StateID:", selectedStateId.value, "DistrictID:", selectedDistrictId.value);
            // Attempt to revert to a known good state if possible
            if (currentViewLevel.value !== 'country' && storeCountry.value) {
                currentViewLevel.value = 'country';
                if (!selectedCountry.value || selectedCountry.value.properties.id !== storeCountry.value.id) {
                    selectedCountry.value = toFeature(storeCountry.value, "Country");
                }
                if (selectedCountry.value) {
                    drawFeatures({ type: 'FeatureCollection', features: [selectedCountry.value] });
                } else {
                    regionStore.setError("Unable to display map. Country data missing.");
                }
            } else if (!storeCountry.value) {
                regionStore.setError("Map data is currently unavailable.");
            }
        }
    } catch (e: any) {
        console.error("Error during refreshMap:", e);
        regionStore.setError(e.message || "Map refresh failed.");
        if (gMain) gMain.selectAll("*").remove();
        scaleBar.value.visible = false;
    }
    updateBreadcrumbs();
}


/* ───────── Lifecycle Hooks & Watchers ───────── */
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
    if (!svgRef.value) {
        console.error("SVG Ref not available on mount.");
        regionStore.setError("Map canvas element not found.");
        return;
    }
    await nextTick();
    svgWidth.value = svgRef.value.clientWidth;
    svgHeight.value = svgRef.value.clientHeight;

    if (svgWidth.value === 0 || svgHeight.value === 0) {
        console.warn("SVG dimensions are zero on mount, attempting to observe for changes.");
        // Fallback: if dimensions are 0, ResizeObserver should pick it up later.
        // But this might indicate a layout issue.
    }

    svgSel = d3.select(svgRef.value).on('click', async (event: MouseEvent) => {
        if (event.target === svgRef.value) {
            if (breadcrumbs.value.length > 1) { const parentCrumb = breadcrumbs.value[breadcrumbs.value.length - 2]; await navigateToCrumb(parentCrumb, breadcrumbs.value.length - 2); } else if (breadcrumbs.value.length === 1 && breadcrumbs.value[0].level !== 'country') {
                currentViewLevel.value = 'country'; selectedStateId.value = ''; selectedDistrictId.value = ''; if (storeCountry.value && (!selectedCountry.value || selectedCountry.value.properties.id !== storeCountry.value.id)) { selectedCountry.value = toFeature(storeCountry.value); } await refreshMap();
            }
        }
    });
    svgSel.call(zoomBehavior as any);
    gMain = svgSel.append('g').attr('class', 'main-map-group');

    resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            svgWidth.value = entry.contentRect.width;
            svgHeight.value = entry.contentRect.height;
        }
        if (svgWidth.value > 0 && svgHeight.value > 0) {
            refreshMap();
        } else {
            console.warn("ResizeObserver: SVG dimensions became zero.");
        }
    });
    resizeObserver.observe(svgRef.value);

    try {
        regionStore.setError(null);
        await regionStore.fetchCountry();
        if (storeCountry.value) {
            selectedCountry.value = toFeature(storeCountry.value);
        } else {
            console.error("Failed to fetch country data on mount.");
            regionStore.setError("Could not load initial map data (country).");
            return; // Stop further execution if country data fails
        }
        await regionStore.fetchStates();

        if (svgWidth.value > 0 && svgHeight.value > 0) {
            await refreshMap();
        } else {
            // This case should ideally be handled by ResizeObserver if initial dimensions were 0
            console.warn("SVG dimensions still not set after data fetch, map might not render correctly until resize.");
        }
    } catch (err: any) {
        console.error("Initialization error:", err);
        regionStore.setError(err.message || "Failed to initialize map data.");
    }

    try{
        statsStore.fetchCountryStats()
    } catch (err: any) {
        console.error("Initialization error:", err);
        // statsStore.setError(err.message || "Failed to initialize map data.");
    }

});
onBeforeUnmount(() => {
    if (svgRef.value && resizeObserver) { resizeObserver.unobserve(svgRef.value); }
    resizeObserver = null;
    if (gMain) { gMain.selectAll("*").remove(); gMain.remove(); gMain = undefined; }
    if (svgSel) { svgSel.on('.zoom', null).on('click', null); svgSel = undefined; }
});

watch(() => storeCountry.value, async (newCountry, oldCountry) => {
    if (newCountry && (!oldCountry || newCountry.id !== oldCountry.id)) {
        const previousSelectedCountryId = selectedCountry.value?.properties.id;
        selectedCountry.value = toFeature(newCountry);
        // Only reset view if the actual country ID changed or if we are at country level
        if (currentViewLevel.value === 'country' || breadcrumbs.value.length === 0 || previousSelectedCountryId !== newCountry.id) {
            currentViewLevel.value = 'country';
            selectedStateId.value = '';
            selectedDistrictId.value = '';
            await refreshMap();
        }
    } else if (!newCountry) {
        selectedCountry.value = null;
        breadcrumbs.value = [];
        currentViewLevel.value = 'country'; // Reset view level
        if (gMain) gMain.selectAll("*").remove();
        scaleBar.value.visible = false;
        regionStore.setError("Country data became unavailable.");
    }
});

watch(() => storeStates.value, async (newStates) => {
    if (newStates && currentViewLevel.value === 'state' && selectedCountry.value) {
        await refreshMap();
    }
}, { deep: true });

watch(() => storeDistrictsByState.value, async (newDistrictsByState) => {
    if (selectedStateId.value &&
        newDistrictsByState[selectedStateId.value] &&
        currentViewLevel.value === 'district') {
        await refreshMap();
    }
}, { deep: true });

</script>

<style scoped>
.control-dropdown {
    @reference p-2 md:p-3 border border-slate-600 rounded-md text-sm w-full sm:min-w-[180px] md:min-w-[200px] bg-slate-700/80 text-slate-100 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none backdrop-blur-sm shadow transition-all duration-150 ease-in-out;
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