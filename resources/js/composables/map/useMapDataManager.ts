import { ref, readonly, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRegionStore } from '@/stores/regions';
import { useStatsStore } from '@/stores/stats';
import { useObservationStore } from '@/stores/observations';
import { useTaxaStore } from '@/stores/taxa';
import { useGeoHelpers } from './useGeoHelpers';
import type { RegionFeature, RegionFeatureCollection, ViewLevel, RegionProperties } from '@/types/regions';
import type { StatMode, ObservationDisplayMode } from './useMapNavigationState';

interface MapDataManagerOptions {
    currentViewLevel: Ref<ViewLevel>;
    currentSelectedCountry: Ref<RegionFeature | null>;
    currentSelectedStateId: Ref<string | number>;
    currentSelectedDistrictId: Ref<string | number>;
    currentSelectedMode: Ref<StatMode>;
    currentObservationDisplayMode: Ref<ObservationDisplayMode>;
    setCountryFeature: (feature: RegionFeature | null) => void;
}

export type FeatureWithStats = RegionFeature & {
    properties: RegionProperties & {
        displayStatValue?: number;
        observations?: number;
        taxa?: number;
        users?: number;
    };
};

export function useMapDataManager(options: MapDataManagerOptions) {
    const {
        currentViewLevel,
        currentSelectedCountry,
        currentSelectedStateId,
        currentSelectedDistrictId,
        currentSelectedMode,
        currentObservationDisplayMode,
        setCountryFeature,
    } = options;

    const regionStore = useRegionStore();
    const statsStore = useStatsStore();
    const observationStore = useObservationStore();
    const taxaStore = useTaxaStore();
    const { toFeature } = useGeoHelpers();

    const featuresToDisplay = ref<RegionFeatureCollection<Geometry, FeatureWithStats['properties']> | null>(null);
    const isLoading = ref<boolean>(false);
    const currentError = ref<string | null>(null);
    const currentStatsByFeatureId = ref<Record<string | number, any>>({});
    const currentStatRange = ref<{ min: number; max: number }>({ min: 0, max: 0 });
    const gridDensityRange = ref<{ min: number; max: number }>({ min: 0, max: 0 });

    const setErrorManually = (message: string | null) => { currentError.value = message; isLoading.value = false; };
    const setGridDensityRange = (min: number, max: number) => { gridDensityRange.value = { min, max }; };

    const calculateStatRangeAndAugmentFeatures = (
        baseFeatures: RegionFeature[],
        statsSource: Record<string | number, any> | null,
        mode: StatMode
    ): FeatureWithStats[] => {
        let minDisplayStat = Infinity;
        let maxDisplayStat = -Infinity;
        const augmentedFeatures: FeatureWithStats[] = [];

        if (!statsSource) {
            return baseFeatures.map(f => ({ ...f, properties: { ...f.properties, displayStatValue: undefined, observations: undefined, taxa: undefined, users: undefined } }));
        }

        for (const feature of baseFeatures) {
            const featureId = feature.properties.id;
            let statRecord: any = null;

            if (statsSource && typeof statsSource === 'object') {
                const isSingleFeatureStat = baseFeatures.length === 1 && ('observations' in statsSource || 'taxa' in statsSource || 'users' in statsSource);
                statRecord = isSingleFeatureStat ? (statsSource[featureId] || statsSource) : statsSource[featureId];
            }

            let currentModeDisplayValue: number | undefined;
            let obsVal: number | undefined;
            let taxaVal: number | undefined;
            let usersVal: number | undefined;

            if (statRecord && typeof statRecord === 'object') {
                const parse = (val: any) => (val !== null && val !== undefined) ? (parseFloat(String(val))) : undefined;
                const checkFinite = (val?: number) => (val !== undefined && isFinite(val)) ? val : undefined;

                currentModeDisplayValue = checkFinite(parse(statRecord[mode]));
                obsVal = checkFinite(parse(statRecord.observations));
                taxaVal = checkFinite(parse(statRecord.taxa));
                usersVal = checkFinite(parse(statRecord.users));
            }

            augmentedFeatures.push({
                ...feature,
                properties: {
                    ...feature.properties,
                    displayStatValue: currentModeDisplayValue,
                    observations: obsVal,
                    taxa: taxaVal,
                    users: usersVal,
                }
            });

            if (currentModeDisplayValue !== undefined) {
                minDisplayStat = Math.min(minDisplayStat, currentModeDisplayValue);
                maxDisplayStat = Math.max(maxDisplayStat, currentModeDisplayValue);
            }
        }

        currentStatRange.value = { min: isFinite(minDisplayStat) && minDisplayStat !== Infinity ? minDisplayStat : 0, max: isFinite(maxDisplayStat) && maxDisplayStat !== -Infinity ? maxDisplayStat : 0 };
        if (currentStatRange.value.min === currentStatRange.value.max && currentStatRange.value.max !== 0) { currentStatRange.value.min = 0; }
        else if (!isFinite(minDisplayStat)) { currentStatRange.value = { min: 0, max: 0 }; }

        return augmentedFeatures;
    };


    const refreshMapFeaturesAndStats = async () => {
        isLoading.value = true;
        currentError.value = null;
        regionStore.setError(null);
        statsStore.setError(null);

        const selectedTaxaIds = Array.from(taxaStore.selectedTaxaIds);

        // console.log("DataManager: Filtering with these Taxa IDs:", selectedTaxaIds);

        let baseGeoFeatures: RegionFeature[] = [];
        let relevantStatsSource: Record<string | number, any> | null = null;

        try {
            const level = currentViewLevel.value;
            const countryFeature = currentSelectedCountry.value;
            const stateId = currentSelectedStateId.value;
            const districtId = currentSelectedDistrictId.value;
            const mode = currentSelectedMode.value;

            const fetchOptions = { taxaIds: selectedTaxaIds };
            const cacheKey = taxaStore.selectedTaxaIds.size > 0 ? selectedTaxaIds.sort((a, b) => a - b).join(',') : 'all';

            if (level === 'home') {
                // For 'home' view, we only want to display the single country boundary
                if (countryFeature) {
                    baseGeoFeatures = [countryFeature];
                    // Fetch corresponding country stats
                    await statsStore.fetchCountryStats(fetchOptions);
                    relevantStatsSource = statsStore.country[cacheKey] || null;
                } else {
                    regionStore.setError("Country data is not loaded.");
                }
            } else if (level === 'country') {
                if (countryFeature) {
                    baseGeoFeatures = [countryFeature];
                    await statsStore.fetchCountryStats(fetchOptions);
                    relevantStatsSource = statsStore.country[cacheKey] || null;
                } else {
                    regionStore.setError("Country data is not loaded.");
                }
            } else if (level === 'state') {
                if (countryFeature && regionStore.states) {
                    baseGeoFeatures = Object.values(regionStore.states).map(s => toFeature(s, "State"));
                    await statsStore.fetchAllStatesStats(fetchOptions);
                    relevantStatsSource = statsStore.allStates[cacheKey];
                } else if (countryFeature) {
                    // Fallback to show country feature, but DO NOT change view level
                    baseGeoFeatures = [countryFeature];
                    await statsStore.fetchCountryStats(fetchOptions);
                    relevantStatsSource = statsStore.country[cacheKey] || null;
                    console.warn("State GeoJSON not loaded. Displaying country feature as fallback.");
                } else {
                    regionStore.setError("Cannot display states, country information missing.");
                }
            } else if (level === 'district') {
                if (stateId) {
                    if (!regionStore.districtsByState[stateId] || regionStore.districtsByState[stateId].length === 0) {
                        await regionStore.fetchDistricts(+stateId);
                    }
                    const districtsForState = regionStore.districtsByState[stateId];
                    if (districtsForState?.length) {
                        await statsStore.fetchDistrictsStatsByState({ stateId, ...fetchOptions });
                        const allDistrictsStatsInState = statsStore.districtsInState[stateId]?.[cacheKey];
                        if (districtId && allDistrictsStatsInState?.[districtId]) {
                            const districtFeature = districtsForState.find(d => d.id === districtId);
                            if (districtFeature) {
                                baseGeoFeatures = [toFeature(districtFeature, "District")];
                                relevantStatsSource = { [districtId]: allDistrictsStatsInState[districtId] };
                            } else {
                                // Fallback if specific district not found in GeoJSON
                                baseGeoFeatures = districtsForState.map(d => toFeature(d, "District"));
                                relevantStatsSource = allDistrictsStatsInState;
                            }
                        } else {
                            baseGeoFeatures = districtsForState.map(d => toFeature(d, "District"));
                            relevantStatsSource = allDistrictsStatsInState;
                        }
                    } else { // Fallback if no district GeoJSON found
                        if (regionStore.states?.[stateId]) {
                            baseGeoFeatures = [toFeature(regionStore.states[stateId], "State")];
                            console.warn(`No districts found for state ${stateId}. Displaying state feature as fallback.`);
                        }
                    }
                } else { // No state ID selected, but in district view level
                    if (countryFeature && regionStore.states) { // Fallback to state view
                        baseGeoFeatures = Object.values(regionStore.states).map(s => toFeature(s, "State"));
                        console.warn("No state selected for district view. Displaying all states as fallback.");
                    }
                }
            }

            // Fetch Observation Points if needed
            const obsDisplayMode = currentObservationDisplayMode.value;
            if (level === 'district' && districtId && obsDisplayMode !== 'none') {
                // If we are in a single district view and want to show points/grid/heatmap,
                // trigger the fetch from the observation store.
                // The store handles the caching internally.
                console.log(`DM: Triggering fetch for observation points in district ${districtId}. Mode: ${obsDisplayMode}`);
                await observationStore.fetchDistrictObservations({ districtId, taxaIds: selectedTaxaIds });
            } else {
                // If we are not in a view that shows points, ensure any old data is cleared
                // to prevent the renderer from accidentally showing it.
                if (observationStore.allDistrictObservations[districtId as any]) {
                    observationStore.clearObservationsForDistrict(districtId);
                }
            }

            // Augment features and set for display
            if (baseGeoFeatures.length > 0) {
                const augmentedFeatures = calculateStatRangeAndAugmentFeatures(baseGeoFeatures, relevantStatsSource, mode);
                featuresToDisplay.value = { type: 'FeatureCollection', features: augmentedFeatures };
                currentStatsByFeatureId.value = relevantStatsSource || {};
            } else {
                featuresToDisplay.value = null;
                currentStatsByFeatureId.value = {};
                currentStatRange.value = { min: 0, max: 0 };
                console.warn("No GeoJSON features determined for display for current navigation state.");
            }

        } catch (e: any) {
            console.error("Error in refreshMapFeaturesAndStats:", e);
            currentError.value = e.message || "Failed to update map features.";
            featuresToDisplay.value = null;
            currentStatRange.value = { min: 0, max: 0 };
            currentStatsByFeatureId.value = {};
        }
        finally { isLoading.value = false; }
    };

    const loadInitialDataAndStats = async () => {
        isLoading.value = true;
        currentError.value = null;
        try {
            await taxaStore.fetchAllTaxa();
            await regionStore.fetchCountry();
            if (regionStore.country) {
                setCountryFeature(toFeature(regionStore.country, "Country"));
            } else { throw new Error("Failed to load initial country GeoJSON."); }
            await regionStore.fetchStates();
            await refreshMapFeaturesAndStats();
        } catch (e: any) {
            console.error("Error during loadInitialDataAndStats:", e);
            currentError.value = e.message || "Failed to load initial map data.";
            featuresToDisplay.value = null;
            if (typeof setCountryFeature === 'function') setCountryFeature(null);
        }
        finally { isLoading.value = false; }
    };

    return {
        featuresToDisplay: readonly(featuresToDisplay),
        isLoading: readonly(isLoading),
        currentError: readonly(currentError),
        currentStatRange: readonly(currentStatRange),
        gridDensityRange: readonly(gridDensityRange),
        setGridDensityRange,
        loadInitialDataAndStats,
        refreshMapFeaturesAndStats,
        setErrorManually,
    };
}
