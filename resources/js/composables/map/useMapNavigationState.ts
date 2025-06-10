import { ref, computed, watch, readonly } from 'vue';
import { storeToRefs } from 'pinia';
import { useRegionStore } from '@/stores/regions'; // Adjust path if needed
// Assuming you have these types defined in a shared file, e.g., src/types/regions.ts
import type { RegionFeature, ViewLevel, RegionProperties } from '@/types/regions';

// Define StatMode here or import from a shared types file (e.g., src/types/stats.ts)
export type StatMode = 'observations' | 'taxa' | 'users';
export type ObservationDisplayMode = 'none' | 'points' | 'grid' | 'heatmap';
export type HeatmapIntensity = 'low' | 'medium' | 'high';

export interface BreadcrumbItem {
    name: string;
    level: ViewLevel;
    id: string | number; // ID of the country, state, or district feature
    // feature?: RegionFeature; // Optional: Could store the feature if useful for quick nav restore
}

export interface DropdownOption {
    id: string | number;
    name: string;
}

export function useMapNavigationState() {
    const regionStore = useRegionStore();
    const {
        country: storeCountry,      // Raw country data from the store
        states: storeStates,        // Raw states data { [id]: stateObj }
        districtsByState: storeDistrictsByState // Raw districts data { [stateId]: [districtObj, ...] }
    } = storeToRefs(regionStore);

    // --- Reactive Navigation State ---
    const currentViewLevel = ref<ViewLevel>('country');
    const selectedCountry = ref<RegionFeature | null>(null); // Holds the GeoJSON *Feature* object
    const selectedStateId = ref<string | number>('');
    const selectedDistrictId = ref<string | number>('');
    const selectedMode = ref<StatMode>('observations'); // Default mode
    const breadcrumbs = ref<BreadcrumbItem[]>([]);
    const districtObservationDisplayMode = ref<ObservationDisplayMode>('none');
    const selectedGridSize = ref<number>(1000);
    const pointRadiusMeters = ref<number>(10);
    const heatmapIntensity = ref<HeatmapIntensity>('medium');


    // --- Computed Properties for Dropdowns ---
    const stateOptions = computed<DropdownOption[]>(() => {
        if (!selectedCountry.value || !storeStates.value || Object.keys(storeStates.value).length === 0) {
            return [];
        }
        return Object.values(storeStates.value)
            .map(stateData => ({ id: stateData.id, name: stateData.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });

    const districtOptions = computed<DropdownOption[]>(() => {
        if (!selectedStateId.value ||
            !storeDistrictsByState.value[selectedStateId.value] ||
            storeDistrictsByState.value[selectedStateId.value].length === 0) {
            return [];
        }
        return storeDistrictsByState.value[selectedStateId.value]
            .map(districtData => ({ id: districtData.id, name: districtData.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });

    // --- Core Functions ---

    /**
     * Sets the current primary country feature.
     * Also resets view to country level and clears sub-selections.
     * Typically called by useMapDataManager on initial load.
     */
    const setCountryFeature = (countryFeature: RegionFeature | null) => {
        selectedCountry.value = countryFeature;
        currentViewLevel.value = 'country';
        selectedStateId.value = '';
        selectedDistrictId.value = '';
        // Breadcrumbs will update via watcher
    };

    const setSelectedMode = (mode: StatMode) => selectedMode.value = mode;

    const setDistrictObservationDisplayMode = (mode: ObservationDisplayMode) => districtObservationDisplayMode.value = mode;
    const setSelectedGridSize = (sizeInMeters: number) => selectedGridSize.value = sizeInMeters;
    const setPointRadius = (radiusInMeters: number) => pointRadiusMeters.value = radiusInMeters;
    const setHeatmapIntensity = (intensity: HeatmapIntensity) => heatmapIntensity.value = intensity;

    //  --- Helper to reset point display state ---
    const resetObservationDisplay = () => {
        districtObservationDisplayMode.value = 'none';
    }

    const _updateBreadcrumbsInternal = () => {
        const newCrumbs: BreadcrumbItem[] = [];
        if (selectedCountry.value) {
            newCrumbs.push({
                name: selectedCountry.value.properties.name,
                level: 'country',
                id: selectedCountry.value.properties.id
            });
            if (selectedStateId.value && storeStates.value && storeStates.value[selectedStateId.value]) {
                const state = storeStates.value[selectedStateId.value];
                newCrumbs.push({ name: state.name, level: 'state', id: state.id });

                if (selectedDistrictId.value && storeDistrictsByState.value[selectedStateId.value]) {
                    const district = storeDistrictsByState.value[selectedStateId.value].find(d => d.id === selectedDistrictId.value);
                    if (district) {
                        newCrumbs.push({ name: district.name, level: 'district', id: district.id });
                    }
                }
            }
        }
        breadcrumbs.value = newCrumbs;
    };

    const handleFeatureClick = async (feature: RegionFeature) => {
        if (!feature || !feature.properties) return;

        resetObservationDisplay();
        if (currentViewLevel.value === 'country') {
            // Assumes clicking the country feature means drill down to its states
            // selectedCountry.value should already be this feature if map shows only one country
            currentViewLevel.value = 'state';
            selectedStateId.value = ''; // Clear any previous state selection
            selectedDistrictId.value = '';
        } else if (currentViewLevel.value === 'state') {
            // Clicked on a state feature when viewing all states
            if (storeStates.value && storeStates.value[feature.properties.id]) {
                selectedStateId.value = feature.properties.id;
                currentViewLevel.value = 'district'; // Prepare to show districts of this state
                selectedDistrictId.value = '';
                await regionStore.fetchDistricts(+selectedStateId.value); // Fetch districts
            } else {
                console.warn("Clicked state feature not found in storeStates:", feature.properties.name);
            }
        } else if (currentViewLevel.value === 'district') {
            // Clicked on a district feature when viewing districts of a state
            if (selectedStateId.value && storeDistrictsByState.value[selectedStateId.value]?.find(dist => dist.id === feature.properties.id)) {
                selectedDistrictId.value = feature.properties.id;
                // currentViewLevel remains 'district'.
                // MapView's watcher on selectedDistrictId will trigger dataManager to update featuresToDisplay.
            } else {
                console.warn("Clicked district feature not found or state context missing:", feature.properties.name);
            }
        }
    };

    const onStateSelected = async () => { // Called by @change on state dropdown
        selectedDistrictId.value = ''; // Clear previous district selection
        resetObservationDisplay();
        if (selectedStateId.value) {
            currentViewLevel.value = 'district'; // Prepare to show districts for this state
            await regionStore.fetchDistricts(+selectedStateId.value);
        } else { // "-- Select State --" was chosen
            currentViewLevel.value = 'state'; // Go back to showing all states for the current country
        }
    };

    const onDistrictSelected = () => { // Called by @change on district dropdown
        resetObservationDisplay();
    };

    const navigateToCrumbByIndex = (index: number) => {
        if (index < 0 || index >= breadcrumbs.value.length) return;

        const crumbToNavigate = breadcrumbs.value[index];

        // Prevent re-navigation if already exactly at this crumb's state
        const isAlreadyAtCrumb = currentViewLevel.value === crumbToNavigate.level &&
            ((crumbToNavigate.level === 'country' && selectedCountry.value?.properties.id === crumbToNavigate.id) ||
                (crumbToNavigate.level === 'state' && selectedStateId.value === crumbToNavigate.id) ||
                (crumbToNavigate.level === 'district' && selectedDistrictId.value === crumbToNavigate.id));
        if (isAlreadyAtCrumb && index === breadcrumbs.value.length - 1) return;

        currentViewLevel.value = crumbToNavigate.level;

        if (crumbToNavigate.level === 'country') {
            // selectedCountry.value should be correct as it's the root
            selectedStateId.value = '';
            selectedDistrictId.value = '';
        } else if (crumbToNavigate.level === 'state') {
            selectedStateId.value = crumbToNavigate.id;
            selectedDistrictId.value = '';
        } else if (crumbToNavigate.level === 'district') {
            // selectedStateId should be set from the parent crumb.
            // This assumes breadcrumbs are always hierarchical and consistent.
            selectedDistrictId.value = crumbToNavigate.id;
        }
    };

    const handleMapBackgroundClick = () => {
        resetObservationDisplay();
        if (breadcrumbs.value.length > 1) { // If viewing state's districts or a specific district
            navigateToCrumbByIndex(breadcrumbs.value.length - 2); // Go to parent crumb
        } else if (breadcrumbs.value.length === 1 && currentViewLevel.value !== 'country') { // If at state level (showing all states)
            currentViewLevel.value = 'country'; // Go to country view
            selectedStateId.value = '';
            selectedDistrictId.value = '';
        }
    };

    // Auto-update breadcrumbs
    watch([selectedCountry, selectedStateId, selectedDistrictId], _updateBreadcrumbsInternal, { deep: true });

    // Watcher to automatically reset observation display if user navigates away from single district view
    watch([currentViewLevel, selectedDistrictId], ([newLevel, newDistrictId]) => {
        if (newLevel !== 'district' || !newDistrictId) {
            if (districtObservationDisplayMode.value !== 'none') {
                resetObservationDisplay();
            }
        }
    });

    return {
        // --- Existing exports ---
        currentViewLevel, selectedCountry, selectedStateId, selectedDistrictId,
        selectedMode, breadcrumbs, stateOptions, districtOptions,
        setCountryFeature, setSelectedMode, handleFeatureClick,
        onStateSelected, onDistrictSelected, navigateToCrumbByIndex, handleMapBackgroundClick,

        // --- Updated/New Exports ---
        districtObservationDisplayMode,
        selectedGridSize,
        pointRadiusMeters, // EXPORT this
        heatmapIntensity,   // EXPORT this
        setDistrictObservationDisplayMode,
        setSelectedGridSize,
        setPointRadius,     // EXPORT this
        setHeatmapIntensity,  // EXPORT this
    };
}