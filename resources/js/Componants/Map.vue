<template>
    <div class="relative w-screen h-screen bg-slate-900 text-white overflow-hidden antialiased">

        <div class="absolute inset-0 w-full h-full p-0 md:p-4">
            <svg ref="svgRef" class="w-full h-full rounded-lg shadow-2xl bg-slate-800"></svg>
        </div>

        <div class="absolute top-0 left-0 right-0 z-10 p-3 md:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-transparent">
            <div class="breadcrumb-container flex items-center gap-2 text-sm md:text-base bg-slate-700/50 backdrop-blur-sm p-2 px-3 rounded-md shadow">
                <span
                    v-if="breadcrumbs.length === 0"
                    class="cursor-default text-slate-400 italic"
                >
                    World Map
                </span>
                <template v-for="(crumb, index) in breadcrumbs" :key="crumb.level + '-' + crumb.id">
                    <span
                        @click="navigateToCrumb(crumb, index)"
                        class="hover:text-cyan-400 transition-colors duration-150"
                        :class="{
                            'cursor-pointer font-medium': index < breadcrumbs.length -1 || breadcrumbs.length === 1,
                            'text-cyan-300 font-semibold cursor-default': index === breadcrumbs.length -1 && breadcrumbs.length > 0,
                            'text-slate-300': index < breadcrumbs.length -1
                        }"
                    >
                        {{ crumb.name }}
                    </span>
                    <span v-if="index < breadcrumbs.length - 1" class="text-slate-500 select-none">&gt;</span>
                </template>
            </div>

            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <select
                    v-model="selectedStateId"
                    @change="handleStateDropdownChange"
                    :disabled="currentViewLevel === 'country' || !storeCountry"
                    class="control-dropdown"
                    aria-label="Select State"
                >
                    <option value="">-- Select State --</option>
                    <option v-for="st in stateOptions" :key="st.id" :value="st.id">{{ st.name }}</option>
                </select>

                <select
                    v-model="selectedDistrictId"
                    @change="handleDistrictDropdownChange"
                    :disabled="currentViewLevel !== 'district' && currentViewLevel !== 'state' || !selectedStateId"
                    class="control-dropdown"
                    aria-label="Select District"
                >
                    <option value="">-- Select District --</option>
                    <option v-for="dt in districtOptions" :key="dt.id" :value="dt.id">{{ dt.name }}</option>
                </select>
            </div>
        </div>


        <div
            v-if="scaleBar.visible"
            class="absolute bottom-4 left-4 md:bottom-6 md:left-6 z-10 p-2 px-3 bg-slate-700/60 backdrop-blur-sm rounded-md shadow text-xs md:text-sm select-none"
        >
            <div class="flex items-center gap-2">
                <div
                    class="scale-line h-1 bg-slate-200 transition-all duration-300 ease-out"
                    :style="{ width: scaleBar.pixelWidth + 'px' }"
                ></div>
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
// Make sure this path is correct for your project structure
// For example, if stores is in src/stores: import { useRegionStore } from '@/stores/regions';
import { useRegionStore } from '@/stores/regions';
import { Geometry, Feature, FeatureCollection } from 'geojson';


interface RegionProperties {
    id: string | number;
    name: string;
    // Add other properties if your GeoJSON features have them
}

type RegionFeature = Feature<Geometry, RegionProperties>;
type RegionFeatureCollection = FeatureCollection<Geometry, RegionProperties>;


/* ───────── Pinia Store ───────── */
const regionStore = useRegionStore();
const {
    country: storeCountry, // Renamed to avoid conflict with local country ref
    states: storeStates,
    districtsByState: storeDistrictsByState,
    error
} = storeToRefs(regionStore);

/* ───────── View State & Configuration ───────── */
type ViewLevel = 'country' | 'state' | 'district';
const currentViewLevel = ref<ViewLevel>('country');

const selectedCountry = ref<RegionFeature | null>(null); // To store the feature of the selected country
const selectedStateId = ref<string | number>('');
const selectedDistrictId = ref<string | number>('');

const breadcrumbs = ref<{ name: string; level: ViewLevel; feature?: RegionFeature; id?: string|number }[]>([]);

const scaleBar = ref({
    visible: false,
    label: '0 km',
    pixelWidth: 0,
});

const mapColors = {
    baseFill: 'oklch(0.45 0.05 250 / 0.7)', // Slightly desaturated blue/purple
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
let gMain: d3.Selection<SVGGElement, unknown, null, undefined> | undefined; // Main group for map features

const projection = d3.geoMercator();
const pathGenerator = d3.geoPath().projection(projection);

/* ───────── Computed Properties for Dropdowns ───────── */
const stateOptions = computed(() => {
    if (!storeCountry.value || !storeStates.value) return [];
    // Assuming storeStates is an object where keys are state IDs
    return Object.values(storeStates.value).map(s => ({ id: s.id, name: s.name }));
});

const districtOptions = computed(() => {
    if (!selectedStateId.value || !storeDistrictsByState.value[selectedStateId.value]) return [];
    return storeDistrictsByState.value[selectedStateId.value].map(d => ({ id: d.id, name: d.name }));
});


/* ───────── GeoJSON Feature Conversion ───────── */
const parseGeom = (g: any): Geometry => {
    try {
        return typeof g === 'string' ? JSON.parse(g) : g;
    } catch (e) {
        console.error("Error parsing geometry:", g, e);
        throw new Error(`Error parsing geometry: ${e instanceof Error ? e.message : String(e)}`);
    }
};

const toFeature = (row: any, defaultName = 'Unnamed Region'): RegionFeature => {
    const geometry = row.geometry ?? row.boundary;
    if (!geometry) {
        console.error("Geometry is missing for region:", row);
        throw new Error(`Geometry is missing for region: ${row.name || defaultName}`);
    }
    return {
        type: 'Feature',
        properties: {
            id: row.id,
            name: row.name || defaultName,
        },
        geometry: parseGeom(geometry),
    };
};

/* ───────── D3 Zoom Behavior ───────── */
const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 18]) // Min/max zoom levels
    .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (!gMain) return;
        gMain.attr('transform', event.transform.toString());

        const k = event.transform.k;
        const baseFontSize = 10;
        const minFontSize = 5;
        const font = Math.max(minFontSize, baseFontSize / Math.sqrt(k));
        gMain.selectAll<SVGTextElement, RegionFeature>('text.label')
            .attr('font-size', `${font}px`);

        // Thinner strokes when zoomed in more
        const baseStrokeWidth = 1.5;
        const strokeWidth = Math.max(0.2, baseStrokeWidth / k);
         gMain.selectAll<SVGPathElement, RegionFeature>('path.region')
            .attr('stroke-width', strokeWidth);

        updateScaleBar();
    });

/* ───────── HTML Scale Bar Logic ───────── */
function updateScaleBar() {
    if (!svgSel || !projection || svgWidth.value === 0 || svgHeight.value === 0 || !projection.scale || !gMain?.attr('transform')) {
        scaleBar.value.visible = false;
        return;
    }
    
    try {
        const currentTransform = d3.zoomTransform(svgSel.node()!);

        // Calculate a target real-world distance (e.g., 100km, 50km)
        // This is a simplified approach. More accurate methods consider map center latitude.
        const R = 6371; // Earth radius in km
        
        // Estimate visible width in km
        const topLeft = projection.invert!([0,0]);
        const topRight = projection.invert!([svgWidth.value, 0]);
        if(!topLeft || !topRight) { scaleBar.value.visible = false; return;}

        const visibleWidthKmRough = d3.geoDistance(topLeft, topRight) * R;

        let targetKm: number;
        const niceKmValues = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];
        targetKm = niceKmValues.find(v => v < visibleWidthKmRough / 3) || niceKmValues[niceKmValues.length -1];


        // Calculate pixel width for this targetKm
        // Project two points that are targetKm apart horizontally at the center of the map view
        const viewCenterX = svgWidth.value / 2;
        const viewCenterY = svgHeight.value / 2;
        
        const [centerLon, centerLat] = projection.invert!([viewCenterX, viewCenterY]);
        if (centerLon === undefined || centerLat === undefined) { scaleBar.value.visible = false; return; }

        // Approximate longitude diff for targetKm. More accurate would use Vincenty or similar.
        const dLon = (targetKm / (R * Math.cos(centerLat * Math.PI / 180))) * (180 / Math.PI);

        const p1 = projection([centerLon - dLon / 2, centerLat]);
        const p2 = projection([centerLon + dLon / 2, centerLat]);

        if (!p1 || !p2 || isNaN(p1[0]) || isNaN(p2[0])) {
            scaleBar.value.visible = false;
            return;
        }
        
        let pixelLen = Math.abs(p2[0] - p1[0]);

        // Cap pixel length to avoid excessively long scale bars
        const maxPixelWidth = Math.min(150, svgWidth.value * 0.25); // Max 150px or 25% of map width
        if (pixelLen > maxPixelWidth) {
            const ratio = maxPixelWidth / pixelLen;
            pixelLen = maxPixelWidth;
            targetKm *= ratio;
            // Make targetKm a bit nicer after adjustment
            if(targetKm > 10) targetKm = Math.round(targetKm/5)*5; 
            else if (targetKm > 1) targetKm = Math.round(targetKm);
            else targetKm = Math.round(targetKm*10)/10;
        }
        if (isNaN(pixelLen) || pixelLen <= 5) { // Min 5px
             scaleBar.value.visible = false; return;
        }

        scaleBar.value = {
            visible: true,
            label: `${targetKm.toLocaleString()} km`,
            pixelWidth: Math.round(pixelLen),
        };

    } catch (e) {
        console.warn("Error updating scale bar:", e);
        scaleBar.value.visible = false;
    }
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
    if (index === breadcrumbs.value.length -1 && breadcrumbs.value.length > 0) return; // Already at this level

    currentViewLevel.value = crumb.level;
    
    if (crumb.level === 'country') {
        selectedStateId.value = '';
        selectedDistrictId.value = '';
        // selectedCountry remains from initial load or click
    } else if (crumb.level === 'state') {
        selectedStateId.value = crumb.id!;
        selectedDistrictId.value = '';
    }
    // No 'district' level crumb navigation needed as it's the deepest.

    await refreshMap();
    updateBreadcrumbs();
}

/* ───────── Map Feature Click Handler ───────── */
async function handleFeatureClick(event: MouseEvent, d: RegionFeature) {
    event.stopPropagation(); // Prevent map click if feature is clicked

    if (currentViewLevel.value === 'country') {
        selectedCountry.value = d; // Assume the clicked feature is the country itself
        currentViewLevel.value = 'state';
        selectedStateId.value = ''; // Clear state selection
        selectedDistrictId.value = '';
    } else if (currentViewLevel.value === 'state') {
        if (storeStates.value[d.properties.id]) { // Clicked on a state
            selectedStateId.value = d.properties.id;
            currentViewLevel.value = 'district';
            selectedDistrictId.value = ''; // Clear district selection
        }
    } else if (currentViewLevel.value === 'district') {
         if (storeDistrictsByState.value[selectedStateId.value]?.find(dist => dist.id === d.properties.id)) {
            selectedDistrictId.value = d.properties.id;
            // currentViewLevel remains 'district', but now a specific one is selected
            // No further drill down from district click in this setup
         }
    }
    
    await refreshMap();
    updateBreadcrumbs();
}

/* ───────── Dropdown Change Handlers ───────── */
async function handleStateDropdownChange() {
    selectedDistrictId.value = ''; // Clear district when state changes
    if (selectedStateId.value) {
        currentViewLevel.value = 'district'; // Ready to show districts or specific state
        await regionStore.fetchDistricts(+selectedStateId.value); // Ensure districts are loaded
    } else {
        currentViewLevel.value = 'state'; // Go back to showing all states if "-- Select State --"
    }
    await refreshMap();
    updateBreadcrumbs();
}

async function handleDistrictDropdownChange() {
    // currentViewLevel is already 'district'
    // if selectedDistrictId.value is set, refreshMap will focus on it
    await refreshMap();
    updateBreadcrumbs();
}


/* ───────── Core Drawing Logic ───────── */
function drawFeatures(featuresToDraw: RegionFeatureCollection | null) {
    if (!svgSel || !gMain || svgWidth.value === 0 || svgHeight.value === 0) {
        console.warn("Drawing prerequisites not met.");
        return;
    }

    if (!featuresToDraw || featuresToDraw.features.length === 0) {
        gMain.selectAll("*").remove(); // Clear previous features
        scaleBar.value.visible = false;
        console.warn("No features to draw.");
        return;
    }

    // Fit projection to the new set of features
    projection.fitSize([svgWidth.value, svgHeight.value], featuresToDraw);

    const featureData = featuresToDraw.features;

    // Paths (Regions)
    gMain.selectAll<SVGPathElement, RegionFeature>('path.region')
        .data(featureData, d => String(d.properties.id)) // Use string ID for key
        .join(
            enter => enter.append('path')
                .attr('class', 'region')
                .attr('d', pathGenerator)
                .attr('fill', mapColors.baseFill)
                .attr('stroke', mapColors.stroke)
                .attr('stroke-width', 1.5 / (projection.scale() / 1000)) // Initial stroke width
                .style('opacity', 0)
                .on('click', handleFeatureClick)
                .on('mouseenter', function() { d3.select(this).attr('fill', mapColors.hoverFill); })
                .on('mouseleave', function() { d3.select(this).attr('fill', mapColors.baseFill); })
                .call(s => s.transition().duration(500).style('opacity', 1)),
            update => update
                .call(s => s.transition().duration(750) // Smooth transition for path changes
                    .attr('d', pathGenerator)
                    .attr('stroke-width', 1.5 / (projection.scale() / 1000))
                 ),
            exit => exit
                .call(s => s.transition().duration(300).style('opacity', 0).remove())
        );

    // Labels
    gMain.selectAll<SVGTextElement, RegionFeature>('text.label')
        .data(featureData, d => String(d.properties.id))
        .join(
            enter => enter.append('text')
                .attr('class', 'label')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('fill', mapColors.label)
                .style('pointer-events', 'none')
                .style('user-select', 'none')
                .style('text-shadow', `0 0 3px ${mapColors.labelShadow}, 0 0 5px ${mapColors.labelShadow}`)
                .attr('x', d => pathGenerator.centroid(d)[0])
                .attr('y', d => pathGenerator.centroid(d)[1])
                .text(d => d.properties.name)
                .attr('font-size', `${10 / Math.sqrt(projection.scale() / 1000)}px`)
                .style('opacity', 0)
                .call(s => s.transition().duration(500).delay(200).style('opacity', 1)),
            update => update
                .call(s => s.transition().duration(750)
                    .attr('x', d => pathGenerator.centroid(d)[0])
                    .attr('y', d => pathGenerator.centroid(d)[1])
                    .text(d => d.properties.name)
                ),
            exit => exit
                .call(s => s.transition().duration(300).style('opacity', 0).remove())
        );

    // Apply zoom transform to fit the new features
    // Calculate the transform needed to fit the features
    const [[x0, y0], [x1, y1]] = pathGenerator.bounds(featuresToDraw);
    const newTransform = d3.zoomIdentity
        .translate(svgWidth.value / 2, svgHeight.value / 2)
        .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / svgWidth.value, (y1 - y0) / svgHeight.value)))
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);

    if (svgSel && zoomBehavior) {
        svgSel.transition().duration(750)
            .call(zoomBehavior.transform, newTransform);
    }
    updateScaleBar(); // Update scale bar after zoom/pan
}


/* ───────── Main Map Refresh Logic ───────── */
async function refreshMap() {
    let featuresToDisplay: RegionFeature[] = [];

    try {
        if (currentViewLevel.value === 'country') {
            if (storeCountry.value) {
                selectedCountry.value = toFeature(storeCountry.value, "Country"); // Set the active country
                featuresToDisplay = [selectedCountry.value];
            }
        } else if (currentViewLevel.value === 'state') {
            // Show all states of the selectedCountry
            if (storeStates.value && selectedCountry.value) { // Ensure country is selected
                 featuresToDisplay = Object.values(storeStates.value).map(s => toFeature(s, "State"));
            } else if (storeCountry.value) { // Fallback if somehow states not loaded but country is
                currentViewLevel.value = 'country';
                selectedCountry.value = toFeature(storeCountry.value, "Country");
                featuresToDisplay = [selectedCountry.value];
            }
        } else if (currentViewLevel.value === 'district') {
            if (selectedStateId.value && storeDistrictsByState.value[selectedStateId.value]) {
                if (selectedDistrictId.value) { // A specific district is selected
                    const district = storeDistrictsByState.value[selectedStateId.value].find(d => d.id === selectedDistrictId.value);
                    if (district) featuresToDisplay = [toFeature(district, "District")];
                } else { // Show all districts for the selected state
                    featuresToDisplay = storeDistrictsByState.value[selectedStateId.value].map(d => toFeature(d, "District"));
                }
            } else if (selectedStateId.value && storeStates.value[selectedStateId.value]) { // Fallback to show selected state if districts not loaded/found
                 featuresToDisplay = [toFeature(storeStates.value[selectedStateId.value], "State")];
            }
        }

        if (featuresToDisplay.length > 0) {
            drawFeatures({ type: 'FeatureCollection', features: featuresToDisplay });
        } else {
            // No features, clear map. This might happen if data is missing.
             if (gMain) gMain.selectAll("*").remove();
             scaleBar.value.visible = false;
             if (currentViewLevel.value === 'country' && storeCountry.value) { // Attempt to redraw country if everything else fails
                selectedCountry.value = toFeature(storeCountry.value, "Country");
                drawFeatures({type: 'FeatureCollection', features: [selectedCountry.value]});
             }
        }
    } catch (e: any) {
        console.error("Error during refreshMap:", e);
        regionStore.setError(e.message || "An unknown error occurred while refreshing the map.");
        if (gMain) gMain.selectAll("*").remove(); // Clear map on error
        scaleBar.value.visible = false;
    }
    updateBreadcrumbs(); // Update breadcrumbs after map refresh attempt
}


/* ───────── Lifecycle Hooks & Watchers ───────── */
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
    if (!svgRef.value) return;

    svgWidth.value = svgRef.value.clientWidth;
    svgHeight.value = svgRef.value.clientHeight;

    svgSel = d3.select(svgRef.value)
        .on('click', async () => { // Handle click on map background (e.g., to go up a level)
            if (breadcrumbs.value.length > 0) {
                 const parentCrumbIndex = breadcrumbs.value.length - 2;
                 if (parentCrumbIndex >= 0) {
                    await navigateToCrumb(breadcrumbs.value[parentCrumbIndex], parentCrumbIndex);
                 } else { // Clicked map bg when only country is shown, or no crumbs
                    currentViewLevel.value = 'country';
                    selectedStateId.value = '';
                    selectedDistrictId.value = '';
                    await refreshMap(); // Redraw country
                    updateBreadcrumbs();
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
            updateScaleBar();
        }
    });
    resizeObserver.observe(svgRef.value);

    try {
        regionStore.setError(null); // Clear any previous errors
        await regionStore.fetchCountry();
        if (storeCountry.value) {
             selectedCountry.value = toFeature(storeCountry.value); // Set initial country
        }
        await regionStore.fetchStates(); // Fetch all states initially
        // Initial draw will be handled by the watcher or direct call after data load
        await nextTick(); // Ensure DOM is ready for initial size calculation
        if (svgWidth.value > 0 && svgHeight.value > 0) {
             await refreshMap();
             updateBreadcrumbs(); // Initial breadcrumb
        }

    } catch (err: any) {
        console.error("Initialization error:", err);
        regionStore.setError(err.message || "Failed to initialize map data.");
    }
});

onBeforeUnmount(() => {
    if (svgRef.value && resizeObserver) {
        resizeObserver.unobserve(svgRef.value);
    }
    resizeObserver = null;
    if (gMain) gMain.remove();
    if (svgSel) svgSel.on('.zoom', null).on('click', null); // Clean up D3 listeners
});

// Watch for changes that require a map refresh
// Note: storeCountry, storeStates, storeDistrictsByState are refs from storeToRefs,
// so they are reactive and can be watched directly.
watch(
    [currentViewLevel, selectedCountry, selectedStateId, selectedDistrictId, storeCountry, storeStates, storeDistrictsByState],
    async () => {
        // This watcher can be too aggressive. refreshMap is called by interactions.
        // Only call refreshMap if it's a state change NOT initiated by an interaction that already calls refreshMap.
        // For now, let interactions primarily drive refreshMap.
        // However, if underlying store data changes, we might need a refresh.
        // Consider if this deep watch is necessary or if specific interactions are enough.
        // For simplicity, let's assume interactions call refreshMap.
        // If you need to react to store data changing *outside* of user interaction,
        // then a more targeted watch would be better.
    },
    { deep: true } // Deep watch might be heavy; consider more targeted watchers if performance issues arise.
);

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

/* SVG elements are styled via D3 attributes for dynamic properties like fill, stroke, etc.
   Scoped CSS can provide base styles or transitions if needed. */
.region {
    cursor: pointer;
    transition: fill 0.2s ease-out, stroke 0.2s ease-out, opacity 0.3s ease-out;
}

.label {
    transition: opacity 0.3s ease-out;
}

/* Tailwind JIT might not pick up dynamic classes from :style,
   so critical layout/positioning is done with Tailwind classes directly in template. */
</style>