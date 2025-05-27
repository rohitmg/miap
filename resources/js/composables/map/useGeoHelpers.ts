import type { Geometry, Feature } from 'geojson'; // Using standard GeoJSON types
// Assuming you have a shared types file like this:
import type { RegionProperties, RegionFeature } from '@/types/regions'; // Adjust path as needed

/**
 * A composable providing utility functions for working with GeoJSON data.
 */
export function useGeoHelpers() {

    /**
     * Parses a geometry string into a GeoJSON Geometry object.
     * If the input is already a valid GeoJSON Geometry object, it returns it directly.
     *
     * @param g - The geometry, which can be a JSON string or a pre-parsed GeoJSON Geometry object.
     * @returns A GeoJSON Geometry object.
     * @throws Error if parsing fails or the input is invalid.
     */
    const parseGeom = (g: any): Geometry => {
        if (!g) {
            throw new Error("Geometry input is null, undefined, or empty.");
        }

        // Check if 'g' is already an object that looks like a valid Geometry
        if (typeof g === 'object' && g !== null && typeof g.type === 'string' && Array.isArray(g.coordinates)) {
            // It's likely already a Geometry object.
            // For more robustness, you could add more checks here based on GeoJSON spec
            // (e.g., g.type is one of 'Point', 'LineString', etc.)
            return g as Geometry;
        }

        // If 'g' is a string, try to parse it as JSON.
        if (typeof g === 'string') {
            try {
                const parsed = JSON.parse(g);
                // Basic validation after parsing
                if (typeof parsed.type !== 'string' || !Array.isArray(parsed.coordinates)) {
                    throw new Error("Parsed JSON string does not represent a valid GeoJSON Geometry (missing type or coordinates).");
                }
                return parsed as Geometry;
            } catch (e) {
                console.error("Error parsing geometry string:", g, e);
                throw new Error(`Error parsing geometry string: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        // If it's neither a suitable object nor a string, it's an invalid format.
        console.error("Invalid geometry format provided to parseGeom:", g);
        throw new Error("Invalid geometry format: Expected a JSON string or a GeoJSON Geometry object.");
    };


    /**
     * Converts a raw data row (e.g., from an API response or Pinia store)
     * into a valid GeoJSON Feature object.
     *
     * @param row - The raw data object. Expected to have properties like 'id', 'name',
     * and a geometry source (either 'geometry' or 'boundary').
     * @param defaultName - A fallback name to use if `row.name` is not present.
     * @returns A GeoJSON Feature object typed as RegionFeature.
     * @throws Error if essential data like 'id' or geometry is missing or invalid.
     */
    const toFeature = (row: any, defaultName: string = 'Unnamed Region'): RegionFeature => {
        if (!row || typeof row !== 'object') {
            throw new Error("Invalid input for feature conversion: 'row' must be an object.");
        }

        const id = row.id;
        // ID is crucial for D3 data binding and general identification.
        if (id === undefined || id === null || String(id).trim() === '') {
            console.error("Row data for feature conversion is missing a valid 'id':", row);
            throw new Error(`Feature data is missing a valid 'id'.`);
        }

        const name = String(row.name || defaultName); // Ensure name is a string

        // Allow geometry to be sourced from 'geometry' or 'boundary' property.
        const geometryInput = row.geometry ?? row.boundary;
        if (!geometryInput) {
            console.error(`Geometry (from 'geometry' or 'boundary' property) is missing for region: ${name} (ID: ${id})`, row);
            throw new Error(`Geometry is missing for region: ${name} (ID: ${id})`);
        }

        try {
            const parsedGeometry = parseGeom(geometryInput);

            const properties: RegionProperties = {
                id: id, // Store the original ID type (string or number)
                name: name,
                // You can extend properties here if 'row' contains other relevant data:
                // ... (other properties from row that should be in feature.properties)
            };

            return {
                type: 'Feature',
                properties: properties,
                geometry: parsedGeometry,
            };
        } catch (e) {
            // Errors from parseGeom will be caught here, or this adds more context.
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error(`Failed to create feature for region: ${name} (ID: ${id}) due to geometry processing error: ${errorMessage}`, row);
            throw new Error(`Failed to process geometry for region ${name} (ID: ${id}): ${errorMessage}`);
        }
    };

    // Expose the helper functions.
    return {
        parseGeom,
        toFeature,
    };
}