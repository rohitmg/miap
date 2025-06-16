<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Observation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ObservationDataController extends Controller
{

    /**
     * Retrieve all observation point locations for a given state.
     *
     * @param  \Illuminate\Http\Request $request
     * @param  string|int $stateId
     * @return \Illuminate\Http\JsonResponse
     */
    public function byState(Request $request, $stateId): JsonResponse
    {
        try {
            $query = Observation::where('state_id', $stateId);

            if ($request->has('taxa_ids')) {
                $taxaIds = explode(',', $request->input('taxa_ids'));
                if (!empty($taxaIds) && !empty($taxaIds[0])) {
                    $query->whereIn('taxon_id', $taxaIds);
                }
            }
       
            $observationPoints = $query->select([
                'id',
                'latitude',
                'longitude',
                'user_id',
                'taxon_id',
                'observed_on'
            ])->get();

            return response()->json($observationPoints);
        } catch (\Exception $e) {
            \Log::error("Error fetching observation points for state {$stateId}: " . $e->getMessage());
            return response()->json(['message' => 'An error occurred while fetching observation points.'], 500);
        }
    }


    /**
     * Retrieve all observation point locations (lat, lon, and minimal data) for a given district.
     *
     * @param  \Illuminate\Http\Request $request
     * @param  string|int $districtId  // Or: District $district if using Route Model Binding
     * @return \Illuminate\Http\JsonResponse
     */
    //

    public function byDistrict(Request $request, $districtId): JsonResponse
    {
        $query = Observation::where('district_id', $districtId);

        if ($request->has('taxa_ids')) {
            $taxaIds = explode(',', $request->input('taxa_ids'));
            $query->whereIn('taxon_id', $taxaIds);
        }
        try {
            $query->select([
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
