import { ref, onBeforeUnmount, readonly, type Ref, nextTick, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import * as d3 from 'd3';
import type { RegionFeature, RegionFeatureCollection, RegionProperties } from '@/types/regions';

import { useObservationStore } from '@/stores/observations';
import type { ObservationDisplayMode, HeatmapIntensity } from './useMapNavigationState';
import type { FeatureWithStats } from './useMapDataManager';

const mapElementColors = {
    hoverFill: 'oklch(0.60 0.07 260 / 0.5)',
    stroke: 'oklch(0.5 0.03 260)',
    labelName: 'oklch(0.95 0.01 270)',
    labelStatValue: 'oklch(0.80 0.02 265 / 0.85)',
    labelShadow: 'rgba(10, 20, 40, 0.7)',
};

const choroplethColors = {
    minStat: '#ad524d',
    midStat: '#8c7f5e',
    maxStat: '#00a69f',
    noData: '#373b40'
};

const baseStrokeWidth = 1.5;
const baseNameFontSize = 9;
const baseStatFontSize = 9;
const minFontSize = 4;

export function useD3MapRenderer(
    svgRefElement: Ref<SVGSVGElement | null>,
    onFeatureClick: (event: MouseEvent, feature: RegionFeature) => void,
    onZoomChange: (transform: d3.ZoomTransform, projection: d3.GeoProjection, width: number, height: number) => void,
    onMapBackgroundClick: () => void,
    statRange: Readonly<Ref<{ min: number; max: number }>>,
    observationDisplayMode: Readonly<Ref<ObservationDisplayMode>>,
    selectedGridSize: Readonly<Ref<number>>,
    selectedDistrictId: Readonly<Ref<string | number>>,
    currentDistrictFeature: Readonly<Ref<FeatureWithStats | null>>,
    heatmapIntensity: Readonly<Ref<HeatmapIntensity>>,
    setGridDensityRange: (min: number, max: number) => void,
    pointRadiusMeters: Readonly<Ref<number>>
) {
    const observationStore = useObservationStore();

    const svgWidth = ref(0);
    const svgHeight = ref(0);
    const isInitialized = ref(false);

    const heatmapBandwidthMap: Record<HeatmapIntensity, number> = {
        low: 20,
        medium: 40,
        high: 70,
    };
    const heatmapThresholdsMap: Record<HeatmapIntensity, number> = {
        low: 10,
        medium: 20,
        high: 30,
    };

    let svgSel: d3.Selection<SVGSVGElement, unknown, null, undefined> | undefined;
    let gMain: d3.Selection<SVGGElement, unknown, null, undefined> | undefined;
    let gPaths: d3.Selection<SVGGElement, unknown, null, undefined> | undefined;
    let gObservations: d3.Selection<SVGElement, unknown, null, undefined> | undefined;
    let gLabels: d3.Selection<SVGGElement, unknown, null, undefined> | undefined;


    const projection = d3.geoMercator();
    const pathGenerator = d3.geoPath().projection(projection);
    const currentTransform = ref<d3.ZoomTransform>(d3.zoomIdentity);

    let lastRenderedFeatures: RegionFeatureCollection<Geometry, RegionProperties & { displayStatValue?: number, observations?: number, taxa?: number, users?: number }> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const tooltip = {
        visible: ref(false), name: ref(''),
        observations: ref<number | undefined>(undefined),
        taxa: ref<number | undefined>(undefined),
        users: ref<number | undefined>(undefined),
        x: ref(0), y: ref(0),
    };

    const colorScale = d3.scaleLinear<string>()
        .range([choroplethColors.minStat, choroplethColors.midStat, choroplethColors.maxStat])
        .interpolate(d3.interpolateRgb);

    watch(statRange, (newRange) => {
        if (!newRange) {
            console.warn("useD3MapRenderer: statRange.value is null/undefined. Defaulting color scale for noData.");
            // Set a simple domain that maps to noData color
            colorScale.domain([0, 1]).range([choroplethColors.noData, choroplethColors.noData]);
            return;
        }

        const { min, max } = newRange;

        if (min === max) {
            let targetColor;
            if (max === 0 && min === 0) {
                targetColor = choroplethColors.noData;
            } else {
                targetColor = choroplethColors.midStat;
            }

            colorScale.domain([min, min + Math.max(Math.abs(min * 0.00001), 0.000001)])
                .range([targetColor, targetColor]);
        } else {
            const midpointValue = min + (max - min) / 2;

            if (midpointValue <= min || midpointValue >= max) {
                console.warn("useD3MapRenderer: Midpoint is too close to min/max. Using 2-color scale.");
                colorScale.domain([min, max])
                    .range([choroplethColors.minStat, choroplethColors.maxStat]);
            } else {
                colorScale.domain([min, midpointValue, max])
                    .range([choroplethColors.minStat, choroplethColors.midStat, choroplethColors.maxStat]);
            }
        }

    }, { deep: true, immediate: true });

    const currentPoints = computed(() => {
        const districtId = selectedDistrictId.value;
        if (!districtId) return [];
        // Use the getter to get the correct array based on the current taxa filter (implicitly handled in dataManager)
        console.log(observationStore.getDistrictObservations(districtId))
        return observationStore.getDistrictObservations(districtId);
    });

    watch(
        [
            currentPoints,
            observationDisplayMode,
            selectedGridSize,
            selectedDistrictId,
            pointRadiusMeters,
            heatmapIntensity
        ],
        () => {
            if (isInitialized.value) {
                renderObservationLayer();
            }
        });


    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 25])
        .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
            if (!gMain) return;
            currentTransform.value = event.transform;
            gMain.attr('transform', event.transform.toString());
            const k = event.transform.k;
            const nameFont = Math.max(minFontSize, baseNameFontSize / Math.sqrt(k));
            const statFont = Math.max(minFontSize, baseStatFontSize / Math.sqrt(k));
            gMain.selectAll<SVGTextElement, FeatureWithStats>('text.label')
                .each(function () {
                    const textLabel = d3.select(this);
                    textLabel.select<SVGTSpanElement>('.label-name').attr('font-size', `${nameFont}px`);
                    textLabel.select<SVGTSpanElement>('.label-stat-value').attr('font-size', `${statFont}px`);
                });
            const strokeVal = Math.max(0.2, baseStrokeWidth / k);
            gMain.selectAll<SVGPathElement, FeatureWithStats>('path.region').attr('stroke-width', strokeVal);
            onZoomChange(event.transform, projection, svgWidth.value, svgHeight.value);
        });

    const initializeMap = async () => {
        if (!svgRefElement.value) {
            console.error("D3MapRenderer: SVG ref not available.");
            isInitialized.value = false;
            return;
        }
        svgSel = d3.select(svgRefElement.value);
        svgSel.selectAll('*').remove();

        gMain = svgSel.append('g').attr('class', 'main-map-group');

        gPaths = gMain.append('g').attr('class', 'map-paths');
        gObservations = gMain.append('g').attr('class', 'map-observations');
        gLabels = gMain.append('g').attr('class', 'map-labels');


        await nextTick();
        svgWidth.value = svgRefElement.value.clientWidth || 600;
        svgHeight.value = svgRefElement.value.clientHeight || 400;
        svgSel.on('click', (event: MouseEvent) => { if (event.target === svgRefElement.value) onMapBackgroundClick(); })
            .on('mousemove', (event: MouseEvent) => {
                if (tooltip.visible.value) { tooltip.x.value = event.pageX; tooltip.y.value = event.pageY; }
            });
        svgSel.call(zoomBehavior as any);
        resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) { svgWidth.value = entry.contentRect.width; svgHeight.value = entry.contentRect.height; }
            if (svgWidth.value > 0 && svgHeight.value > 0 && lastRenderedFeatures) {
                projection.fitSize([svgWidth.value, svgHeight.value], lastRenderedFeatures);
                zoomToFit(lastRenderedFeatures, 0);
                onZoomChange(currentTransform.value, projection, svgWidth.value, svgHeight.value);
            } else if (svgWidth.value > 0 && svgHeight.value > 0 && !lastRenderedFeatures && gMain && svgSel) {
                projection.translate([svgWidth.value / 2, svgHeight.value / 2]).scale(1);
                zoomBehavior.transform(svgSel as any, d3.zoomIdentity);
                gMain.attr('transform', d3.zoomIdentity.toString());
            }
        });
        if (svgRefElement.value) resizeObserver.observe(svgRefElement.value);
        isInitialized.value = true;
        console.log("D3 Map Initialized and Ready");
    };

    const zoomToFit = (features: RegionFeatureCollection<Geometry, RegionProperties & { displayStatValue?: number }> | null, duration: number = 750) => {
        if (!svgSel || !gMain || !features || features.features.length === 0 || svgWidth.value === 0 || svgHeight.value === 0) {
            if (svgSel && zoomBehavior) {
                const identityTransform = d3.zoomIdentity.translate(svgWidth.value / 2, svgHeight.value / 2).scale(1);
                svgSel.transition("zoom-reset-no-features").duration(duration).call(zoomBehavior.transform, identityTransform);
            }
            return;
        }
        const [[x0, y0], [x1, y1]] = pathGenerator.bounds(features);
        if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1) || (x1 - x0 === 0 && y1 - y0 === 0)) {
            let targetTransform = d3.zoomIdentity;
            if (features.features.length > 0) {
                const firstFeatureCentroid = pathGenerator.centroid(features.features[0]);
                if (isFinite(firstFeatureCentroid[0]) && isFinite(firstFeatureCentroid[1])) {
                    const defaultScale = features.features.length === 1 ? Math.min(12, zoomBehavior.scaleExtent()[1]) : 2;
                    targetTransform = d3.zoomIdentity.translate(svgWidth.value / 2, svgHeight.value / 2).scale(defaultScale).translate(-firstFeatureCentroid[0], -firstFeatureCentroid[1]);
                }
            }
            svgSel.transition("zoom-invalid-bounds").duration(duration).call(zoomBehavior.transform, targetTransform);
            return;
        }
        const newScale = Math.min(zoomBehavior.scaleExtent()[1], 0.9 / Math.max((x1 - x0) / svgWidth.value, (y1 - y0) / svgHeight.value));
        const newTransform = d3.zoomIdentity.translate(svgWidth.value / 2, svgHeight.value / 2).scale(newScale).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
        svgSel.transition("zoom-fit").duration(duration).call(zoomBehavior.transform, newTransform);
    };

    const renderObservationLayer = () => {
         if (!gObservations || !isInitialized.value) return;

        const mode = observationDisplayMode.value;
        const points = currentPoints.value; // Use the computed property

        gObservations.selectAll('*').remove();

        if (!points || points.length === 0 || mode === 'none') {
            setGridDensityRange(0,0); // Clear the legend
            return;
        }

        if (mode === 'points') {
            const centerGeo = projection.invert!(currentTransform.value.invert([svgWidth.value / 2, svgHeight.value / 2]));
            if (!centerGeo) return;
            const R = 6371000; // Earth radius in meters
            const dLon = (pointRadiusMeters.value / (R * Math.cos(centerGeo[1] * Math.PI / 180))) * (180 / Math.PI);
            const p1 = projection([centerGeo[0], centerGeo[1]]);
            const p2 = projection([centerGeo[0] + dLon, centerGeo[1]]);
            const pixelRadius = p1 && p2 ? Math.abs(p2[0] - p1[0]) : 1; // Fallback to 1px

            gObservations.selectAll('circle.observation-point')
                .data(points)
                .join('circle')
                .attr('class', 'observation-point')
                .attr('cx', d => projection([d.longitude, d.latitude])?.[0] ?? -999)
                .attr('cy', d => projection([d.longitude, d.latitude])?.[1] ?? -999)
                .attr('r', Math.max(0.5, pixelRadius)) // Use calculated radius, with a minimum
                .attr('fill', 'oklch(0.8 0.2 50 / 0.3)')
                .style('pointer-events', 'none');
        } else if (mode === 'grid') {
            const districtFeature = currentDistrictFeature.value;
            if (!districtFeature) return;

            // --- CORRECTED & ACCURATE GRID CALCULATION ---
            const gridSizeMeters = selectedGridSize.value;
            const [[x0, y0], [x1, y1]] = pathGenerator.bounds(districtFeature); // Screen bounds

            // Find how many grid cells fit across the screen bounds
            const widthInPixels = x1 - x0;
            const heightInPixels = y1 - y0;

            // Convert pixel dimensions back to approximate real-world distance
            const R = 6371000; // Earth radius in meters
            const p1Geo = projection.invert!([x0, y0]);
            const p2Geo = projection.invert!([x1, y0]);
            const p3Geo = projection.invert!([x0, y1]);
            const widthInMeters = d3.geoDistance(p1Geo, p2Geo) * R;
            const heightInMeters = d3.geoDistance(p1Geo, p3Geo) * R;

            // Calculate columns and rows based on real-world distances
            const nCols = Math.max(1, Math.ceil(widthInMeters / gridSizeMeters));
            const nRows = Math.max(1, Math.ceil(heightInMeters / gridSizeMeters));

            // Cell dimensions in pixels
            const cellWidth = widthInPixels / nCols;
            const cellHeight = heightInPixels / nRows;

            const gridCells = new Map<string, { count: number; x: number; y: number }>();

            for (const point of points) {
                // ... (safety checks for coordinates) ...
                const p = projection([point.longitude, point.latitude]);
                if (p && p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) {
                    // Calculate which grid cell the point falls into
                    const col = Math.floor((p[0] - x0) / cellWidth);
                    const row = Math.floor((p[1] - y0) / cellHeight);
                    const key = `${col},${row}`;

                    if (!gridCells.has(key)) {
                        gridCells.set(key, {
                            count: 0,
                            x: x0 + col * cellWidth,
                            y: y0 + row * cellHeight
                        });
                    }
                    gridCells.get(key)!.count++;
                }
            }

            const gridData = Array.from(gridCells.values());
            const minCount = d3.min(gridData, d => d.count) || 0;
            const maxCount = d3.max(gridData, d => d.count) || 1;

            // --- NEW: Update the shared density range for the legend ---
            setGridDensityRange(minCount, maxCount);

            // Using a vibrant sequential color scale for density
            const gridColorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([minCount, maxCount]);

            gObservations.selectAll('rect.grid-cell')
                .data(gridData)
                .join('rect')
                .attr('class', 'grid-cell')
                .attr('x', d => d.x)
                .attr('y', d => d.y)
                .attr('width', cellWidth) // Use calculated pixel width
                .attr('height', cellHeight) // Use calculated pixel height
                .attr('fill', d => gridColorScale(d.count))
                .attr('fill-opacity', 0.6)
                .style('pointer-events', 'none');
        } else if (mode === 'heatmap') {
            const projectedPoints = points.map(p => {
                if (p && isFinite(p.longitude) && isFinite(p.latitude)) {
                    return projection([p.longitude, p.latitude]);
                }
                return null;
            }).filter((p): p is [number, number] => p !== null); // Filter out any nulls

            if (projectedPoints.length === 0) return; // Guard clause

            // Use the intensity mapping for bandwidth and thresholds
            const currentBandwidth = heatmapBandwidthMap[heatmapIntensity.value];
            const currentThresholds = heatmapThresholdsMap[heatmapIntensity.value];

            const densityData = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([svgWidth.value, svgHeight.value])
                .bandwidth(currentBandwidth)
                .thresholds(currentThresholds)
                (projectedPoints);

            const maxDensity = d3.max(densityData, d => d.value);

            // To ensure single points are visible, we can't use 0 as the min for a log/pow scale.
            // Find the minimum non-zero density value.
            const minPositiveDensity = d3.min(densityData, d => d.value > 0 ? d.value : undefined);

            if (!maxDensity || !minPositiveDensity) return; // No density calculated, exit

            // NEW: Use a Power Scale for the "curved" effect
            const heatmapColorScale = d3.scaleSequentialPow(d3.interpolateTurbo)
                .exponent(0.5) // Exponent < 1 emphasizes lower values. 0.5 is sqrt scale.
                .domain([minPositiveDensity, maxDensity]);

            gObservations.selectAll('path.heatmap-contour')
                .data(densityData)
                .join('path')
                .attr('class', 'heatmap-contour')
                .attr('d', d3.geoPath())
                .attr('fill', d => d.value > 0 ? heatmapColorScale(d.value) : 'none') // Only color contours with density
                .attr('fill-opacity', 0.25)
                .attr('stroke', 'none');
        }
    }

    const renderPathsAndLabels = (featureData: FeatureWithStats[]) => {
        if (!gMain || !svgSel) return;
        gPaths.selectAll<SVGPathElement, FeatureWithStats>('path.region')
            .data(featureData, d => String(d.properties.id))
            .join(
                enter => enter.append('path')
                    .attr('class', 'region')
                    .attr('d', pathGenerator)
                    .attr('fill', d => {
                        const statVal = d.properties.displayStatValue;
                        const color = (statVal !== undefined && isFinite(statVal)) ? colorScale(statVal) : choroplethColors.noData;
                        return color;
                    })
                    .attr('stroke', mapElementColors.stroke)
                    .attr('stroke-width', baseStrokeWidth / currentTransform.value.k)
                    .style('opacity', 0)
                    .on('click', (event, d) => onFeatureClick(event, d as RegionFeature))
                    .on('mouseenter', function (event, d) {
                        d3.select(this).attr('fill', mapElementColors.hoverFill).raise();
                        tooltip.name.value = d.properties.name;
                        tooltip.observations.value = d.properties.observations;
                        tooltip.taxa.value = d.properties.taxa;
                        tooltip.users.value = d.properties.users;
                        tooltip.x.value = event.pageX;
                        tooltip.y.value = event.pageY;
                        tooltip.visible.value = true;
                    })
                    .on('mouseleave', function (event, d) {
                        const statVal = d.properties.displayStatValue;
                        d3.select(this).attr('fill', (statVal !== undefined && isFinite(statVal)) ? colorScale(statVal) : choroplethColors.noData);
                        tooltip.visible.value = false;
                    })
                    .call(s => s.transition("enter-fade").duration(500).style('opacity', 1)),
                update => update
                    .attr('d', pathGenerator)
                    .attr('stroke-width', baseStrokeWidth / currentTransform.value.k)
                    .transition("update-fill").duration(750)
                    .attr('fill', d => {
                        const statVal = d.properties.displayStatValue;
                        const color = (statVal !== undefined && isFinite(statVal)) ? colorScale(statVal) : choroplethColors.noData;
                        return color;
                    }),
                exit => exit
                    .call(s => s.transition("exit-fade").duration(300).style('opacity', 0).remove())
            );

        const labels = gMain.selectAll<SVGTextElement, FeatureWithStats>('text.label')
            .data(featureData, d => String(d.properties.id));
        labels.exit().transition("exit-label-fade").duration(300).style('opacity', 0).remove();
        const labelsEnter = labels.enter().append('text')
            .attr('class', 'label')
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
            .style('pointer-events', 'none').style('user-select', 'none')
            .style('text-shadow', `0 0 2px ${mapElementColors.labelShadow}, 0 0 4px ${mapElementColors.labelShadow}`)
            .style('opacity', 0);

        labelsEnter.append('tspan')
            .attr('class', 'label-name')
            .attr('fill', mapElementColors.labelName)
            .attr('dy', "-0.25em"); // Name tspan (shifted up slightly)

        labelsEnter.append('tspan')
            .attr('class', 'label-stat-value')
            .attr('fill', mapElementColors.labelStatValue)
            .attr('dy', "1.2em"); // MODIFIED: Increased dy for more vertical spacing (was "0.9em")

        labels.merge(labelsEnter)
            .attr('x', d => pathGenerator.centroid(d)[0])
            .attr('y', d => pathGenerator.centroid(d)[1])
            .each(function (d) {
                const k = currentTransform.value.k;
                const nameFont = Math.max(minFontSize, baseNameFontSize / Math.sqrt(k));
                const statFont = Math.max(minFontSize, baseStatFontSize / Math.sqrt(k));
                const statVal = d.properties.displayStatValue;
                const statText = (statVal !== undefined && isFinite(statVal) && k > 0.7) ? statVal.toLocaleString() : '';
                const textElement = d3.select(this);
                const centroidX = pathGenerator.centroid(d)[0];

                textElement.select<SVGTSpanElement>('.label-name')
                    .attr('x', centroidX) // Ensure x is set for each tspan for proper centering
                    .attr('font-size', `${nameFont}px`)
                    .text(d.properties.name);

                textElement.select<SVGTSpanElement>('.label-stat-value')
                    .attr('x', centroidX) // Ensure x is set for each tspan
                    .attr('font-size', `${statFont}px`)
                    .text(statText);
            })
            .transition("label-opacity-fade").duration(500).delay(150).style('opacity', 1);
    };

    const renderFeatures = (
        featuresCollection: FeatureWithStatsCollection | null
    ) => {
        lastRenderedFeatures = featuresCollection;
        if (!isInitialized.value || !svgSel || !gMain || svgWidth.value === 0 || svgHeight.value === 0) {
            console.warn("D3MapRenderer: Cannot render features, map not fully initialized or no dimensions."); return;
        }
        if (!featuresCollection || featuresCollection.features.length === 0) {
            // Clear all layers
            if(gPaths) gPaths.selectAll("*").remove();
            if(gLabels) gLabels.selectAll("*").remove();
            if(gObservations) gObservations.selectAll("*").remove();
            zoomToFit(null);
            return;
        }
        projection.fitSize([svgWidth.value, svgHeight.value], featuresCollection as any);
        renderPathsAndLabels(featuresCollection.features as FeatureWithStats[]);
        zoomToFit(featuresCollection);
        renderObservationLayer();
    };

    const clearFeatures = () => {
        if (gPaths) gPaths.selectAll("*").remove();
        if (gLabels) gLabels.selectAll("*").remove();
        lastRenderedFeatures = null;
        zoomToFit(null); // Reset zoom
    };

    const destroyMap = () => {
        if (svgRefElement.value && resizeObserver) {
            resizeObserver.unobserve(svgRefElement.value);
        }
        resizeObserver = null;
        if (svgSel) {
            svgSel.on('.zoom', null).on('click', null).on('mousemove', null);
            // svgSel.selectAll('*').remove(); // gMain will be removed or its children
        }
        if (gMain) { // Clear children of gMain instead of svgSel directly
            gMain.selectAll('*').remove();
            // Optionally remove gMain itself if re-initializeMap always recreates it
            // gMain.remove(); 
        }
        gPaths = undefined;
        gLabels = undefined;
        gMain = undefined; // Ensure gMain is also cleared if it's removed
        svgSel = undefined;
        isInitialized.value = false;
        console.log("D3 Map Destroyed");
    };

    return {
        initializeMap, renderFeatures, clearFeatures, destroyMap,
        isReady: readonly(isInitialized),
        choroplethColors: choroplethColors, // Return as a plain object for easier template use
        projection: readonly(ref(projection)),
        currentTransform: readonly(currentTransform),
        svgWidth: readonly(svgWidth), svgHeight: readonly(svgHeight),
        tooltip: { 
            visible: readonly(tooltip.visible), name: readonly(tooltip.name),
            observations: readonly(tooltip.observations), taxa: readonly(tooltip.taxa), users: readonly(tooltip.users),
            x: readonly(tooltip.x), y: readonly(tooltip.y),
        }
    };
}