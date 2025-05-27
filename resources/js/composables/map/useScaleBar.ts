import { ref, readonly, type Ref } from 'vue';
import * as d3 from 'd3'; // For d3.geoDistance, d3.ZoomTransform, d3.GeoProjection types

// Interface for the reactive scale bar data that will be used in the template
export interface ScaleBarData {
    visible: boolean;
    label: string;
    pixelWidth: number;
}

export function useScaleBar() {
    const data = ref<ScaleBarData>({
        visible: false,
        label: '0 km',
        pixelWidth: 0,
    });

    /**
     * Updates the scale bar's data based on the current map view.
     * @param currentTransform The current d3.ZoomTransform from the map.
     * @param projection The current d3.GeoProjection instance from the map.
     * @param svgWidth The current width of the SVG map container.
     * @param svgHeight The current height of the SVG map container.
     */
    const update = (
        currentTransform: d3.ZoomTransform,
        projection: d3.GeoProjection,
        svgWidth: number,
        svgHeight: number
    ): void => {
        if (!projection || !currentTransform || svgWidth <= 0 || svgHeight <= 0) {
            data.value = { visible: false, label: '0 km', pixelWidth: 0 };
            return;
        }

        try {
            const R = 6371; // Earth's radius in kilometers

            // 1. Determine the geographic coordinates of two points on the screen's horizontal midline
            //    to estimate the currently visible geographic width.
            //    These points are first inverted from screen space through the zoom transform,
            //    then inverted from the projection's planar space to geographic coordinates.
            const screenMidLeft = [0, svgHeight / 2] as [number, number];
            const screenMidRight = [svgWidth, svgHeight / 2] as [number, number];

            const unzoomedMidLeft = currentTransform.invert(screenMidLeft);
            const unzoomedMidRight = currentTransform.invert(screenMidRight);

            const geoMidLeft = projection.invert!(unzoomedMidLeft);
            const geoMidRight = projection.invert!(unzoomedMidRight);

            if (!geoMidLeft || !geoMidRight) {
                data.value = { visible: false, label: '0 km', pixelWidth: 0 };
                return;
            }

            // 2. Calculate the visible geographic distance across the screen width (approx).
            const visibleKmWidth = d3.geoDistance(geoMidLeft, geoMidRight) * R;

            if (isNaN(visibleKmWidth) || visibleKmWidth <= 0) {
                data.value = { visible: false, label: '0 km', pixelWidth: 0 };
                return;
            }

            // 3. Choose a "nice" round number for the scale bar length in kilometers.
            //    Aim for the scale bar to represent roughly 1/4 to 1/5 of the visible width.
            let targetKm: number;
            const niceKmValues = [ // From large to small
                5000, 2500, 2000, 1500, 1000, 750, 500, 250, 200, 150, 100,
                75, 50, 25, 20, 15, 10, 5, 2, 1,
                0.5, 0.25, 0.1, 0.05, 0.02, 0.01
            ];
            
            const idealTargetKm = visibleKmWidth / 4; // Aim for scale bar to be ~1/4 of screen width
            targetKm = niceKmValues.find(v => v <= idealTargetKm) || niceKmValues[niceKmValues.length - 1];
            
            // Ensure targetKm is not excessively small if zoom is very high, choose a reasonable minimum
            if (idealTargetKm < niceKmValues[niceKmValues.length -1] && idealTargetKm > 0) {
                 targetKm = parseFloat(idealTargetKm.toPrecision(1)); // e.g. 0.03 for 0.034, 0.7 for 0.72
                 if (targetKm === 0) targetKm = idealTargetKm; // Avoid 0 if idealTargetKm was just very small
            }
            if (targetKm === 0 && visibleKmWidth > 0) targetKm = parseFloat(visibleKmWidth.toPrecision(1))/4 || 0.01; // Last fallback


            // 4. Calculate how many screen pixels this chosen `targetKm` represents.
            //    Find the geographic center of the current view.
            const viewCenterScreen = [svgWidth / 2, svgHeight / 2] as [number, number];
            const unzoomedViewCenter = currentTransform.invert(viewCenterScreen);
            const [centerLon, centerLat] = projection.invert!(unzoomedViewCenter);

            if (centerLon === undefined || centerLat === undefined) {
                data.value = { visible: false, label: '0 km', pixelWidth: 0 }; return;
            }

            // Create two geographic points `targetKm` apart horizontally at the view's center latitude.
            // This is an approximation for longitude delta.
            const cosLat = Math.cos(centerLat * Math.PI / 180);
            if (cosLat === 0) { // Avoid division by zero at poles
                 data.value = { visible: false, label: '0 km', pixelWidth: 0 }; return;
            }
            const dLon = (targetKm / (R * cosLat)) * (180 / Math.PI);
            
            const geoP1ForLength = [centerLon - dLon / 2, centerLat] as [number, number];
            const geoP2ForLength = [centerLon + dLon / 2, centerLat] as [number, number];

            // Project these geo points to the "unzoomed" planar coordinate space.
            const unzoomedP1ForLength = projection(geoP1ForLength);
            const unzoomedP2ForLength = projection(geoP2ForLength);

            if (!unzoomedP1ForLength || !unzoomedP2ForLength) {
                data.value = { visible: false, label: '0 km', pixelWidth: 0 }; return;
            }

            // Apply the current zoom transform to get their final screen positions.
            const screenP1 = currentTransform.apply(unzoomedP1ForLength);
            const screenP2 = currentTransform.apply(unzoomedP2ForLength);
            
            let finalPixelWidth = Math.abs(screenP2[0] - screenP1[0]);

            // 5. Sanity checks and adjustments for display.
            const maxPixelDisplayWidth = Math.min(200, svgWidth * 0.30); // Cap visual length.
            const minPixelDisplayWidth = 40; // Don't show if too small to be useful.

            if (finalPixelWidth > maxPixelDisplayWidth) {
                // If the calculated pixel width for our "nice" targetKm is too long,
                // adjust targetKm downwards to fit maxPixelDisplayWidth.
                const ratio = maxPixelDisplayWidth / finalPixelWidth;
                targetKm *= ratio;
                finalPixelWidth = maxPixelDisplayWidth;
            }
            
            if (isNaN(finalPixelWidth) || finalPixelWidth < minPixelDisplayWidth) {
                data.value = { visible: false, label: '0 km', pixelWidth: 0 };
                return;
            }
            
            // Format the label string.
            let labelKmFormatted: string;
            if (targetKm < 1) { // For distances less than 1 km, show in meters or precise km
                 if (targetKm * 1000 < 10) { // Very small, maybe too small
                     labelKmFormatted = `${(targetKm * 1000).toPrecision(1)} m`;
                 } else if (targetKm * 1000 < 1000){
                     labelKmFormatted = `${Math.round(targetKm * 1000)} m`;
                 } else {
                    labelKmFormatted = `${parseFloat(targetKm.toFixed(2))} km`;
                 }
            } else if (targetKm < 10) {
                labelKmFormatted = `${parseFloat(targetKm.toFixed(1))} km`;
            } else {
                labelKmFormatted = `${Math.round(targetKm).toLocaleString()} km`;
            }

            data.value = {
                visible: true,
                label: labelKmFormatted,
                pixelWidth: Math.round(finalPixelWidth),
            };

        } catch (e) {
            console.warn("Error updating scale bar:", e);
            data.value = { visible: false, label: '0 km', pixelWidth: 0 };
        }
    };

    // Expose the reactive data (as readonly) and the update function.
    return {
        data: readonly(data),
        update,
    };
}