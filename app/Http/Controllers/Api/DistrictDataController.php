<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Observation; // Your Observation Eloquent model
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DistrictDataController extends Controller
{
    /**
     * Retrieve all observation point locations (lat, lon, and minimal data) for a given district.
     *
     * @param  \Illuminate\Http\Request $request
     * @param  string|int $districtId  // Or: District $district if using Route Model Binding
     * @return \Illuminate\Http\JsonResponse
     */
    // In app/Http/Controllers/Api/DistrictDataController.php (or your chosen controller)

    public function districtObservations(Request $request, $districtId): JsonResponse
    {
        try {
            $query = Observation::where('district_id', $districtId)
                ->select([
                    'id',
                    'latitude',
                    'longitude',
                    'user_id',
                    'taxon_id',
                    'observed_on'
                ]);

            // CONSIDERATION 1: For performance on very large datasets (>10k points),
            // you might eventually add a ->limit(10000) here to prevent browser crashes.
            // For now, getting all points is correct for the client-side gridding goal.
            $observationPoints = $query->get();

            // CONSIDERATION 2: The commented-out ->groupBy('taxon_id') would fundamentally change
            // the response from a list of points to groups of points. For plotting individual
            // observation locations, keeping it as a flat array from ->get() is correct.

            return response()->json($observationPoints->toArray());
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json(['message' => 'District not found to fetch observation points.'], 404);
        } catch (\Exception $e) {
            \Log::error("Error fetching observation points for district {$districtId}: " . $e->getMessage());
            return response()->json(['message' => 'An error occurred while fetching observation points.'], 500);
        }
    }
}
