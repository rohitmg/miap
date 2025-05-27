import { ref, onBeforeUnmount, readonly, type Ref, nextTick, watch } from 'vue';
import * as d3 from 'd3';
import type { RegionFeature, RegionFeatureCollection, RegionProperties } from '@/types/regions';
// Ensure FeatureWithStats type is correctly defined and imported.
// It's expected from useMapDataManager.ts and should include:
// properties: RegionProperties & {
//   displayStatValue?: number; // For current mode, used for color and label
//   observations?: number;    // For tooltip
//   taxa?: number;            // For tooltip
//   users?: number;           // For tooltip
// };
import type { FeatureWithStats } from './useMapDataManager';

const mapElementColors = {
    hoverFill: 'oklch(0.60 0.07 260 / 0.5)',
    stroke: 'oklch(0.5 0.03 260)',
    labelName: 'oklch(0.95 0.01 270)',
    labelStatValue: 'oklch(0.80 0.02 265 / 0.85)',
    labelShadow: 'rgba(10, 20, 40, 0.7)',
};

const choroplethColors = {
    minStat: '#961e14', // Your chosen subdued red
    maxStat: '#3c6c29',  // Your chosen subdued green
    noData: '#6B7280'    // Grey for no data
};

const baseStrokeWidth = 1.5;
const baseNameFontSize = 9;
const baseStatFontSize = 7;
const minFontSize = 4;

export function useD3MapRenderer(
    svgRefElement: Ref<SVGSVGElement | null>,
    onFeatureClick: (event: MouseEvent, feature: RegionFeature) => void,
    onZoomChange: (transform: d3.ZoomTransform, projection: d3.GeoProjection, width: number, height: number) => void,
    onMapBackgroundClick: () => void,
    statRange: Readonly<Ref<{ min: number; max: number }>>,
) {
    const svgWidth = ref(0);
    const svgHeight = ref(0);
    const isInitialized = ref(false);

    let svgSel: d3.Selection<SVGSVGElement, unknown, null, undefined> | undefined;
    let gMain: d3.Selection<SVGGElement, unknown, null, undefined> | undefined;

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
        .range([choroplethColors.minStat, choroplethColors.maxStat])
        .interpolate(d3.interpolateRgb);

    watch(statRange, (newRange) => {
        if (!newRange) {
            console.warn("D3MapRenderer: statRange.value is null/undefined. Defaulting color scale.");
            // Default to a scale that will likely result in noData color for most inputs
            colorScale.domain([0, 1]).range([choroplethColors.noData, choroplethColors.noData]);
            return;
        }
        if (newRange.min === newRange.max) {
            // If all values are 0, or no data, color everything as 'noData'
            if (newRange.max === 0) {
                colorScale.domain([0, 1]).range([choroplethColors.noData, choroplethColors.noData]);
            } else {
                // If all values are the same non-zero value, color them with maxStat color.
                // Give the domain a tiny nudge to prevent issues with single value domains if interpolator needs it.
                colorScale.domain([newRange.min, newRange.min + Math.max(Math.abs(newRange.min * 0.001), 0.001)])
                          .range([choroplethColors.maxStat, choroplethColors.maxStat]);
            }
        } else {
            colorScale.domain([newRange.min, newRange.max])
                      .range([choroplethColors.minStat, choroplethColors.maxStat]); // Ensure range is reset if it was changed
        }
         // console.log("D3: Color scale domain updated:", colorScale.domain(), "Range:", colorScale.range());
    }, { deep: true, immediate: true });


    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>() // ... (same as your provided code)
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

    const initializeMap = async () => { /* ... same as your provided code ... */ 
        if (!svgRefElement.value) { console.error("D3MapRenderer: SVG ref not available."); isInitialized.value = false; return; }
        svgSel = d3.select(svgRefElement.value);
        svgSel.selectAll('*').remove();
        gMain = svgSel.append('g').attr('class', 'main-map-group');
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
    
    const zoomToFit = (features: RegionFeatureCollection<Geometry, RegionProperties & { displayStatValue?: number }> | null, duration: number = 750) => { /* ... same as your provided code ... */ 
        if (!svgSel || !gMain || !features || features.features.length === 0 || svgWidth.value === 0 || svgHeight.value === 0) { if (svgSel && zoomBehavior) { const identityTransform = d3.zoomIdentity.translate(svgWidth.value / 2, svgHeight.value / 2).scale(1); svgSel.transition("zoom-reset-no-features").duration(duration).call(zoomBehavior.transform, identityTransform); } return; } const [[x0, y0], [x1, y1]] = pathGenerator.bounds(features); if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1) || (x1 - x0 === 0 && y1 - y0 === 0)) { let targetTransform = d3.zoomIdentity; if (features.features.length > 0) { const firstFeatureCentroid = pathGenerator.centroid(features.features[0]); if (isFinite(firstFeatureCentroid[0]) && isFinite(firstFeatureCentroid[1])) { const defaultScale = features.features.length === 1 ? Math.min(12, zoomBehavior.scaleExtent()[1]) : 2; targetTransform = d3.zoomIdentity.translate(svgWidth.value / 2, svgHeight.value / 2).scale(defaultScale).translate(-firstFeatureCentroid[0], -firstFeatureCentroid[1]); } } svgSel.transition("zoom-invalid-bounds").duration(duration).call(zoomBehavior.transform, targetTransform); return; } const newScale = Math.min(zoomBehavior.scaleExtent()[1], 0.9 / Math.max((x1 - x0) / svgWidth.value, (y1 - y0) / svgHeight.value)); const newTransform = d3.zoomIdentity.translate(svgWidth.value / 2, svgHeight.value / 2).scale(newScale).translate(-(x0 + x1) / 2, -(y0 + y1) / 2); svgSel.transition("zoom-fit").duration(duration).call(zoomBehavior.transform, newTransform);
    };

    const renderPathsAndLabels = (featureData: FeatureWithStats[]) => {
        if (!gMain || !svgSel) return;

        // Your debugging logs - useful! Keep them during debugging.
        // console.log("D3: Rendering paths/labels. Feature count:", featureData.length);
        // if (featureData.length > 0) {
        //     console.log("D3: First feature properties for rendering:", JSON.parse(JSON.stringify(featureData[0].properties)));
        //     console.log("D3: Current colorScale domain:", colorScale.domain(), "Range:", colorScale.range(), "Current statRange from prop:", statRange.value);
        // }

        // --- Paths (Regions) ---
        // REMOVED DUPLICATE JOIN BLOCK that was here in your provided code.
        // This is the single, correct join block for paths:
        gMain.selectAll<SVGPathElement, FeatureWithStats>('path.region')
            .data(featureData, d => String(d.properties.id))
            .join(
                enter => enter.append('path')
                    .attr('class', 'region')
                    .attr('d', pathGenerator)
                    .attr('fill', d => {
                        const statVal = d.properties.displayStatValue;
                        const color = (statVal !== undefined && isFinite(statVal)) ? colorScale(statVal) : choroplethColors.noData;
                        // console.log(`D3 Path Enter: Feat ID ${d.properties.id}, StatVal: ${statVal}, Color: ${color}, Domain: ${colorScale.domain()}, Range: ${colorScale.range()}`);
                        return color;
                    })
                    // .attr('value', d => d.properties.displayStatValue) // HTML 'value' attr is not standard for SVG paths & not used
                    .attr('stroke', mapElementColors.stroke)
                    .attr('stroke-width', baseStrokeWidth / currentTransform.value.k)
                    .style('opacity', 0)
                    .on('click', (event, d) => onFeatureClick(event, d as RegionFeature))
                    .on('mouseenter', function (event, d) {
                        d3.select(this).attr('fill', mapElementColors.hoverFill).raise();
                        tooltip.name.value = d.properties.name;
                        tooltip.observations.value = d.properties.observations; // EXPECTS this property
                        tooltip.taxa.value = d.properties.taxa;             // EXPECTS this property
                        tooltip.users.value = d.properties.users;           // EXPECTS this property
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
                        // console.log(`D3 Path Update: Feat ID ${d.properties.id}, StatVal: ${statVal}, Color: ${color}`);
                        return color;
                    }),
                exit => exit
                    .call(s => s.transition("exit-fade").duration(300).style('opacity', 0).remove())
            );

        // --- Labels (Modified for two lines: Name + Stat Value) ---
        // ... (Label logic remains the same as the version I provided previously, 
        //      ensure it uses d.properties.displayStatValue for the stat text) ...
        const labels = gMain.selectAll<SVGTextElement, FeatureWithStats>('text.label')
            .data(featureData, d => String(d.properties.id));
        labels.exit().transition("exit-label-fade").duration(300).style('opacity', 0).remove();
        const labelsEnter = labels.enter().append('text')
            .attr('class', 'label')
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
            .style('pointer-events', 'none').style('user-select', 'none')
            .style('text-shadow', `0 0 2px ${mapElementColors.labelShadow}, 0 0 4px ${mapElementColors.labelShadow}`)
            .style('opacity', 0);
        labelsEnter.append('tspan').attr('class', 'label-name').attr('fill', mapElementColors.labelName).attr('dy', "-0.25em");
        labelsEnter.append('tspan').attr('class', 'label-stat-value').attr('fill', mapElementColors.labelStatValue).attr('dy', "0.9em");
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
                textElement.select<SVGTSpanElement>('.label-name').attr('x', centroidX).attr('font-size', `${nameFont}px`).text(d.properties.name);
                textElement.select<SVGTSpanElement>('.label-stat-value').attr('x', centroidX).attr('font-size', `${statFont}px`).text(statText);
            })
            .transition("label-opacity-fade").duration(500).delay(150).style('opacity', 1);
    };

    const renderFeatures = (
        featuresCollection: FeatureCollection<Geometry, RegionProperties & { displayStatValue?: number, observations?: number, taxa?: number, users?: number }> | null
    ) => {
        lastRenderedFeatures = featuresCollection;
        if (!isInitialized.value || !svgSel || !gMain || svgWidth.value === 0 || svgHeight.value === 0) {
            console.warn("D3MapRenderer: Cannot render features, map not fully initialized or no dimensions."); return;
        }
        if (!featuresCollection || featuresCollection.features.length === 0) {
            gMain.selectAll("*").remove(); zoomToFit(null); return;
        }
        projection.fitSize([svgWidth.value, svgHeight.value], featuresCollection as any);
        renderPathsAndLabels(featuresCollection.features as FeatureWithStats[]);
        zoomToFit(featuresCollection);
    };

    const clearFeatures = () => { /* ... same ... */ if (gMain) { gMain.selectAll("*").remove(); } lastRenderedFeatures = null; zoomToFit(null); };
    const destroyMap = () => { /* ... same ... */ if (svgRefElement.value && resizeObserver) { resizeObserver.unobserve(svgRefElement.value); } resizeObserver = null; if (svgSel) { svgSel.on('.zoom', null).on('click', null).on('mousemove', null); svgSel.selectAll('*').remove(); } gMain = undefined; svgSel = undefined; isInitialized.value = false; console.log("D3 Map Destroyed"); };

    return {
        initializeMap, renderFeatures, clearFeatures, destroyMap,
        isReady: readonly(isInitialized),
        choroplethColors: readonly(choroplethColors), // Expose for MapView legend
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