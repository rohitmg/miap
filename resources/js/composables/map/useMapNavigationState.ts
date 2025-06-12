import { ref, computed, watch, readonly } from 'vue';
import { storeToRefs } from 'pinia';
import { useRegionStore } from '@/stores/regions';
import type { RegionFeature, RegionProperties } from '@/types/regions';

// Define shared types. These can be moved to a central `types.ts` file.
export type ViewLevel = 'home' | 'country' | 'state' | 'district';
export type StatMode = 'observations' | 'taxa' | 'users';
export type ObservationDisplayMode = 'none' | 'points' | 'grid' | 'heatmap';
export type HeatmapIntensity = 'low' | 'medium' | 'high';

export interface BreadcrumbItem {
    name: string;
    level: ViewLevel;
    id: string | number;
}

export interface DropdownOption {
    id: string | number;
    name: string;
}

export function useMapNavigationState() {
    const regionStore = useRegionStore();
    const { country: storeCountry, states: storeStates, districtsByState: storeDistrictsByState } = storeToRefs(regionStore);

    // --- State ---
    const currentViewLevel = ref<ViewLevel>('home');
    const selectedCountry = ref<RegionFeature | null>(null);
    const selectedStateId = ref<string | number>('');
    const selectedDistrictId = ref<string | number>('');
    const selectedMode = ref<StatMode>('observations');
    const breadcrumbs = ref<BreadcrumbItem[]>([]);

    const districtObservationDisplayMode = ref<ObservationDisplayMode>('none');
    const selectedGridSize = ref<number>(1000);
    // UPDATED: Point radius state with new default
    const pointRadiusMeters = ref<number>(1000); // Default to 1km
    const heatmapIntensity = ref<HeatmapIntensity>('medium');

    // --- Computed Properties ---
    const stateOptions = computed<DropdownOption[]>(() => {
        if (!selectedCountry.value || !storeStates.value || Object.keys(storeStates.value).length === 0) return [];
        return Object.values(storeStates.value).map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
    });

    const districtOptions = computed<DropdownOption[]>(() => {
        if (!selectedStateId.value || !storeDistrictsByState.value[selectedStateId.value] || storeDistrictsByState.value[selectedStateId.value].length === 0) return [];
        return storeDistrictsByState.value[selectedStateId.value].map(d => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name));
    });

    // --- Helper ---
    const resetObservationDisplay = () => {
        districtObservationDisplayMode.value = 'none';
    };

    // --- Actions ---
    const navigateToHome = () => {
        resetObservationDisplay();
        currentViewLevel.value = 'home';
        selectedStateId.value = '';
        selectedDistrictId.value = '';
    };

    const setCountryFeature = (countryFeature: RegionFeature | null) => {
        resetObservationDisplay();
        selectedCountry.value = countryFeature;
        currentViewLevel.value = 'home';
        selectedStateId.value = '';
        selectedDistrictId.value = '';
    };

    const setSelectedMode = (mode: StatMode) => { selectedMode.value = mode; };
    const setDistrictObservationDisplayMode = (mode: ObservationDisplayMode) => { districtObservationDisplayMode.value = mode; };
    const setSelectedGridSize = (sizeInMeters: number) => { selectedGridSize.value = sizeInMeters; };
    const setPointRadius = (radiusInMeters: number) => { pointRadiusMeters.value = radiusInMeters; };
    const setHeatmapIntensity = (intensity: HeatmapIntensity) => { heatmapIntensity.value = intensity; };

    const _updateBreadcrumbsInternal = () => {
        const newCrumbs: BreadcrumbItem[] = [];
        if (currentViewLevel.value !== 'home' && selectedCountry.value) {
            newCrumbs.push({ name: selectedCountry.value.properties.name, level: 'country', id: selectedCountry.value.properties.id });
            if (selectedStateId.value && storeStates.value?.[selectedStateId.value]) {
                const state = storeStates.value[selectedStateId.value];
                newCrumbs.push({ name: state.name, level: 'state', id: state.id });
                if (selectedDistrictId.value && storeDistrictsByState.value?.[selectedStateId.value]) {
                    const district = storeDistrictsByState.value[selectedStateId.value].find(d => d.id === selectedDistrictId.value);
                    if (district) {
                        newCrumbs.push({ name: district.name, level: 'district', id: district.id });
                    }
                }
            }
        }
        breadcrumbs.value = newCrumbs;
    };

    // --- UPDATED: Navigation Handlers ---
    const handleFeatureClick = async (feature: RegionFeature) => {
        if (!feature || !feature.properties) return;
        resetObservationDisplay();

        if (currentViewLevel.value === 'home' || currentViewLevel.value === 'country') {
            currentViewLevel.value = 'state';
            selectedStateId.value = '';
            selectedDistrictId.value = '';

        } else if (currentViewLevel.value === 'state') {
            if (storeStates.value?.[feature.properties.id]) {
                selectedStateId.value = feature.properties.id;
                currentViewLevel.value = 'district';
                await regionStore.fetchDistricts(+selectedStateId.value);
            }
        } else if (currentViewLevel.value === 'district'){
            if (selectedStateId.value && storeDistrictsByState.value?.[selectedStateId.value]?.find(dist => dist.id === feature.properties.id)) {
                selectedDistrictId.value = feature.properties.id;
                currentViewLevel.value = 'district';
            }
        }
    };

    const onStateSelected = async () => {
        resetObservationDisplay();
        selectedDistrictId.value = ''; // Clear district selection when state changes
        if (selectedStateId.value) {
            // Selecting a state from dropdown should show its districts
            currentViewLevel.value = 'state';
            await regionStore.fetchDistricts(+selectedStateId.value);
        } else {
            // Clearing state selection goes back to showing all states
            currentViewLevel.value = 'country';
        }
    };

    const onDistrictSelected = () => {
        resetObservationDisplay();
        if (selectedDistrictId.value) {
            // Selecting a district focuses on it
            currentViewLevel.value = 'district';
        } else {
            // Clearing district selection shows all districts of the current state
            currentViewLevel.value = 'state';
        }
    };

    const navigateToCrumbByIndex = (index: number) => {
        resetObservationDisplay();
        if (index < 0 || index >= breadcrumbs.value.length) return;

        const crumbToNavigate = breadcrumbs.value[index];

        const isAlreadyAtCrumb = currentViewLevel.value === crumbToNavigate.level &&
            ((crumbToNavigate.level === 'country' && !selectedStateId.value) || // At country (all states) view
                (crumbToNavigate.level === 'state' && selectedStateId.value === crumbToNavigate.id && !selectedDistrictId.value) || // At state (all districts) view
                (crumbToNavigate.level === 'district' && selectedDistrictId.value === crumbToNavigate.id)); // At district (single) view
        if (isAlreadyAtCrumb) return;

        currentViewLevel.value = crumbToNavigate.level;

        if (crumbToNavigate.level === 'country') {
            selectedStateId.value = '';
            selectedDistrictId.value = '';
        } else if (crumbToNavigate.level === 'state') {
            selectedStateId.value = crumbToNavigate.id;
            selectedDistrictId.value = '';
        }
    };

    const handleMapBackgroundClick = () => {
        // Navigates up one level
        if (breadcrumbs.value.length > 0) {
            // If we have crumbs, navigating to the "home" link is clearer than "up"
            navigateToHome();
        }
    };

    // --- Watchers ---
    watch([currentViewLevel, selectedStateId, selectedDistrictId], _updateBreadcrumbsInternal, { deep: true });

    watch([currentViewLevel, selectedDistrictId], ([newLevel, newDistrictId]) => {
        if (newLevel !== 'district' || !newDistrictId) {
            if (districtObservationDisplayMode.value !== 'none') {
                resetObservationDisplay();
            }
        }
    });

    return {
        // Return everything needed by MapView.vue
        currentViewLevel: readonly(currentViewLevel), selectedCountry: readonly(selectedCountry),
        selectedStateId, selectedDistrictId, selectedMode, breadcrumbs: readonly(breadcrumbs),
        stateOptions, districtOptions, setCountryFeature, setSelectedMode, handleFeatureClick,
        onStateSelected, onDistrictSelected, navigateToCrumbByIndex, handleMapBackgroundClick,
        districtObservationDisplayMode, selectedGridSize, pointRadiusMeters, heatmapIntensity,
        setDistrictObservationDisplayMode, setSelectedGridSize, setPointRadius, setHeatmapIntensity,
        navigateToHome,
    };
}
