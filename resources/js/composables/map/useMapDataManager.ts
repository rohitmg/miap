// src/composables/map/useMapDataManager.ts
import { ref, readonly, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRegionStore } from '@/stores/regions';
import { useStatsStore } from '@/stores/stats';
import { useGeoHelpers } from './useGeoHelpers';
import type { RegionFeature, RegionFeatureCollection, ViewLevel, RegionProperties } from '@/types/regions';
import type { StatMode } from './useMapNavigationState'; // Ensure this is exported from useMapNavigationState

interface MapDataManagerOptions {
    currentViewLevel: Ref<ViewLevel>;
    currentSelectedCountry: Ref<RegionFeature | null>;
    currentSelectedStateId: Ref<string | number>;
    currentSelectedDistrictId: Ref<string | number>;
    currentSelectedMode: Ref<StatMode>;
    setCountryFeature: (feature: RegionFeature | null) => void;
}

// UPDATED TYPE: To include all stats for tooltip and the current display stat
export type FeatureWithStats = RegionFeature & {
    properties: RegionProperties & {
        displayStatValue?: number; // For the current mode's choropleth & label
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
        setCountryFeature,
    } = options;

    const regionStore = useRegionStore();
    const statsStore = useStatsStore();
    const { toFeature } = useGeoHelpers();

    const featuresToDisplay = ref<RegionFeatureCollection<Geometry, FeatureWithStats['properties']> | null>(null);
    const isLoading = ref<boolean>(false);
    const currentError = ref<string | null>(null);
    const currentStatsByFeatureId = ref<Record<string | number, any>>({});
    const currentStatRange = ref<{ min: number; max: number }>({ min: 0, max: 0 });

    const setErrorManually = (message: string | null) => { /* ... same ... */ currentError.value = message; isLoading.value = false; };

    // UPDATED FUNCTION: To correctly populate all stats and displayStatValue
    const calculateStatRangeAndAugmentFeatures = (
        baseFeatures: RegionFeature[],
        statsSource: Record<string | number, any> | null, // e.g., statsStore.country, statsStore.allStates[featureId], etc.
        mode: StatMode
    ): FeatureWithStats[] => {
        let minDisplayStat = Infinity;
        let maxDisplayStat = -Infinity;
        const augmentedFeatures: FeatureWithStats[] = [];

        if (!statsSource) {
            console.warn("DM: No statsSource provided for augmentation. Features will lack detailed stats.");
            return baseFeatures.map(f => ({
                ...f,
                properties: {
                    ...f.properties,
                    displayStatValue: undefined,
                    observations: undefined,
                    taxa: undefined,
                    users: undefined,
                }
            }));
        }

        for (const feature of baseFeatures) {
            const featureId = feature.properties.id;
            let statRecord: any = null;

            // Determine the correct statRecord for the current feature
            if (statsSource && typeof statsSource === 'object') {
                // Handle cases:
                // 1. statsSource is the direct stat object (e.g., for country, or single selected district stats)
                // 2. statsSource is a map of stats (e.g., allStates, districtsInState)
                if (baseFeatures.length === 1 && Object.keys(statsSource).length <= 3 && ('observations' in statsSource || 'taxa' in statsSource || 'users' in statsSource)) {
                    // Likely statsSource *is* the statRecord for the single baseFeature
                    statRecord = statsSource[featureId] || statsSource; // Check if keyed by ID first, else assume it's the object directly
                } else {
                    statRecord = statsSource[featureId]; // Standard lookup for collections
                }
            }

            let currentModeDisplayValue: number | undefined = undefined;
            let obsVal: number | undefined = undefined;
            let taxaVal: number | undefined = undefined;
            let usersVal: number | undefined = undefined;

            if (statRecord && typeof statRecord === 'object') {
                // Get the value for the current display mode
                if (mode in statRecord && statRecord[mode] !== null && statRecord[mode] !== undefined) {
                    const parsed = parseFloat(String(statRecord[mode]));
                    if (!isNaN(parsed)) currentModeDisplayValue = parsed;
                }

                // Get all individual stats for the tooltip
                const obs = statRecord.observations;
                const tax = statRecord.taxa;
                const usr = statRecord.users;

                if (obs !== null && obs !== undefined) {
                    const parsedObs = parseFloat(String(obs));
                    if (!isNaN(parsedObs)) obsVal = parsedObs;
                }
                if (tax !== null && tax !== undefined) {
                    const parsedTax = parseFloat(String(tax));
                    if (!isNaN(parsedTax)) taxaVal = parsedTax;
                }
                if (usr !== null && usr !== undefined) {
                    const parsedUsr = parseFloat(String(usr));
                    if (!isNaN(parsedUsr)) usersVal = parsedUsr;
                }
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

            if (currentModeDisplayValue !== undefined && isFinite(currentModeDisplayValue)) {
                minDisplayStat = Math.min(minDisplayStat, currentModeDisplayValue);
                maxDisplayStat = Math.max(maxDisplayStat, currentModeDisplayValue);
            }
        }

        currentStatRange.value = {
            min: isFinite(minDisplayStat) && minDisplayStat !== Infinity ? minDisplayStat : 0,
            max: isFinite(maxDisplayStat) && maxDisplayStat !== -Infinity ? maxDisplayStat : 0,
        };

        if (currentStatRange.value.min === currentStatRange.value.max && currentStatRange.value.max !== 0) {
            currentStatRange.value.min = 0;
        } else if (!isFinite(minDisplayStat) || minDisplayStat === Infinity) { // No valid stats found
            currentStatRange.value = { min: 0, max: 0 };
        }
        return augmentedFeatures;
    };

    const refreshMapFeaturesAndStats = async () => {
        isLoading.value = true;
        currentError.value = null;
        regionStore.setError(null);
        statsStore.setError(null);

        let baseGeoFeatures: RegionFeature[] = [];
        let relevantStatsSource: Record<string | number, any> | null = null;

        try {
            const level = currentViewLevel.value;
            const countryFeature = currentSelectedCountry.value;
            const stateId = currentSelectedStateId.value;
            const districtId = currentSelectedDistrictId.value;
            const mode = currentSelectedMode.value; // Crucial for fetching and augmenting

            // 1. Determine GeoJSON Features
            if (level === 'country') {
                if (countryFeature) baseGeoFeatures = [countryFeature];
                else if (regionStore.country) { setCountryFeature(toFeature(regionStore.country)); baseGeoFeatures = [currentSelectedCountry.value!]; }
                else { regionStore.setError("Country data is not loaded."); throw new Error("Country GeoJSON not loaded."); }
            } else if (level === 'state') {
                if (countryFeature && regionStore.states) baseGeoFeatures = Object.values(regionStore.states).map(s => toFeature(s, "State"));
                else { /* ... fallback or error ... */ }
            } else if (level === 'district') {
                if (stateId) {
                    if (!regionStore.districtsByState[stateId] || regionStore.districtsByState[stateId].length === 0) {
                        await regionStore.fetchDistricts(+stateId);
                    }
                    const districtsForState = regionStore.districtsByState[stateId];
                    if (districtsForState?.length) {
                        if (districtId) {
                            const district = districtsForState.find(d => d.id === districtId);
                            if (district) baseGeoFeatures = [toFeature(district, "District")];
                            else baseGeoFeatures = districtsForState.map(d => toFeature(d, "District")); // Fallback
                        } else {
                            baseGeoFeatures = districtsForState.map(d => toFeature(d, "District"));
                        }
                    } // ... fallbacks for no districts ...
                } // ... fallbacks for no stateId ...
            }

            // 2. Fetch Corresponding Stats
            if (baseGeoFeatures.length > 0) {
                if (level === 'country') {
                    await statsStore.fetchCountryStats();
                    if (statsStore.country && countryFeature) {
                        relevantStatsSource = { [countryFeature.properties.id]: statsStore.country };
                    }
                } else if (level === 'state') {
                    await statsStore.fetchAllStatesStats();
                    relevantStatsSource = statsStore.allStates;
                } else if (level === 'district' && stateId) {
                    await statsStore.fetchDistrictsStatsByState(stateId);
                    const allDistrictsStatsInState = statsStore.districtsInState[stateId];
                    if (districtId && allDistrictsStatsInState?.[districtId]) {
                        relevantStatsSource = { [districtId]: allDistrictsStatsInState[districtId] };
                    } else if (allDistrictsStatsInState) {
                        relevantStatsSource = allDistrictsStatsInState;
                    }
                }
            }

            // 3. Augment features and set featuresToDisplay
            if (baseGeoFeatures.length > 0) {
                const augmentedFeatures = calculateStatRangeAndAugmentFeatures(baseGeoFeatures, relevantStatsSource, mode);
                featuresToDisplay.value = { type: 'FeatureCollection', features: augmentedFeatures };
                currentStatsByFeatureId.value = relevantStatsSource || {}; // Store for potential direct access
            } else {
                // ... handle no GeoJSON features ...
                featuresToDisplay.value = null;
                currentStatRange.value = { min: 0, max: 0 };
                currentStatsByFeatureId.value = {};
            }

        } catch (e: any) { /* ... error handling ... */ console.error("Error in refreshMapFeaturesAndStats:", e); currentError.value = e.message || "Failed to update map features."; featuresToDisplay.value = null; currentStatRange.value = { min: 0, max: 0 }; currentStatsByFeatureId.value = {}; }
        finally { isLoading.value = false; }
    };

    const loadInitialDataAndStats = async () => { /* ... (ensure it calls refreshMapFeaturesAndStats correctly) ... */
        isLoading.value = true; currentError.value = null;
        try {
            await regionStore.fetchCountry();
            if (regionStore.country) {
                const countryFeat = toFeature(regionStore.country, "Country");
                setCountryFeature(countryFeat);
            } else { throw new Error("Failed to load initial country GeoJSON."); }
            await regionStore.fetchStates();
            await refreshMapFeaturesAndStats(); // This will handle initial country stats too
        } catch (e: any) { console.error("Error during loadInitialDataAndStats:", e); currentError.value = e.message || "Failed to load initial map data."; featuresToDisplay.value = null; if (typeof setCountryFeature === 'function') setCountryFeature(null); }
        finally { isLoading.value = false; }
    };

    return {
        featuresToDisplay: readonly(featuresToDisplay),
        isLoading: readonly(isLoading),
        currentError: readonly(currentError),
        currentStatRange: readonly(currentStatRange),
        currentStatsByFeatureId: readonly(currentStatsByFeatureId), // Expose this if tooltips need it directly
        loadInitialDataAndStats,
        refreshMapFeaturesAndStats,
        setErrorManually,
    };
}