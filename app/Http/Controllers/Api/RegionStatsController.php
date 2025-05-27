<?php

namespace App\Http\Controllers\Api;

use App\Models\Observation;
use Illuminate\Http\JsonResponse;
use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder; // Import Builder

class RegionStatsController extends Controller
{
    // Helper to calculate stats directly from a query builder
    private function calculateStatsForQuery(Builder $query): array
    {
        // It's important to clone the query before applying aggregate functions
        // if you intend to use the original query builder for other purposes,
        // or if you're calling multiple aggregates.
        return [
            "observations" => $query->clone()->count(), // SELECT COUNT(*) ...
            "taxa" => $query->clone()->distinct('taxon_id')->count('taxon_id'), // SELECT COUNT(DISTINCT taxon_id) ...
            "users" => $query->clone()->distinct('user_id')->count('user_id'), // SELECT COUNT(DISTINCT user_id) ...
        ];
    }

    public function countryStats(): JsonResponse
    {
        return response()->json(
            $this->calculateStatsForQuery(Observation::query()) // Pass the base query builder
        );
    }

    public function stateStats($stateId): JsonResponse // Assuming $state is an ID
    {
        return response()->json(
            $this->calculateStatsForQuery(Observation::where('state_id', $stateId))
        );
    }

    public function districtStats($districtId): JsonResponse // Assuming $district is an ID
    {
        return response()->json(
            $this->calculateStatsForQuery(Observation::where('district_id', $districtId))
        );
    }

    // For grouped stats, direct database aggregation is better
    public function allStatesStats(): JsonResponse
    {
        $statsByState = Observation::query()
            ->selectRaw('state_id, COUNT(*) as observations_count, COUNT(DISTINCT taxon_id) as taxa_count, COUNT(DISTINCT user_id) as users_count')
            ->groupBy('state_id')
            ->whereNotNull('state_id') // Optional: exclude observations without a state_id
            ->get()
            ->keyBy('state_id') // Key the collection by state_id for easier frontend use
            ->map(function ($row) {
                return [
                    'observations' => (int) $row->observations_count,
                    'taxa' => (int) $row->taxa_count,
                    'users' => (int) $row->users_count,
                ];
            });

        return response()->json($statsByState);
    }

    public function allDistrictsStats(): JsonResponse
    {
        $statsByDistrict = Observation::query()
            ->selectRaw('district_id, COUNT(*) as observations_count, COUNT(DISTINCT taxon_id) as taxa_count, COUNT(DISTINCT user_id) as users_count')
            ->groupBy('district_id')
            ->whereNotNull('district_id') // Optional
            ->get()
            ->keyBy('district_id')
            ->map(function ($row) {
                return [
                    'observations' => (int) $row->observations_count,
                    'taxa' => (int) $row->taxa_count,
                    'users' => (int) $row->users_count,
                ];
            });
        return response()->json($statsByDistrict);
    }

    public function districtsStatsByState($stateId): JsonResponse
    {
        $statsByDistrictInState = Observation::query()
            ->where('state_id', $stateId)
            ->selectRaw('district_id, COUNT(*) as observations_count, COUNT(DISTINCT taxon_id) as taxa_count, COUNT(DISTINCT user_id) as users_count')
            ->groupBy('district_id')
            ->whereNotNull('district_id') // Optional
            ->get()
            ->keyBy('district_id')
            ->map(function ($row) {
                return [
                    'observations' => (int) $row->observations_count,
                    'taxa' => (int) $row->taxa_count,
                    'users' => (int) $row->users_count,
                ];
            });

        return response()->json($statsByDistrictInState);
    }
}