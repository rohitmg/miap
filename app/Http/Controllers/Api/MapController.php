<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Observation;
use App\Models\Region;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MapController extends Controller
{
    public function choropleth(Request $request)
    {
        $level = $request->input('level', 'state'); // default: state
        $metric = $request->input('metric', 'observations'); // default: observations
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');

        // Validate level
        if (!in_array($level, ['country', 'state', 'district'])) {
            return response()->json(['error' => 'Invalid level'], 400);
        }

        // Base observation query
        $query = Observation::query()->select("{$level}_id");

        if ($startDate) {
            $query->whereDate('observed_on', '>=', $startDate);
        }

        if ($endDate) {
            $query->whereDate('observed_on', '<=', $endDate);
        }

        // Metric-specific aggregation
        switch ($metric) {
            case 'species':
                $query->selectRaw("COUNT(DISTINCT taxon_id) as value")
                    ->groupBy("{$level}_id");
                break;
            case 'users':
                $query->selectRaw("COUNT(DISTINCT user_id) as value")
                    ->groupBy("{$level}_id");
                break;
            case 'observations':
            default:
                $query->selectRaw("COUNT(*) as value")
                    ->groupBy("{$level}_id");
                break;
        }

        // Execute and index by region ID
        $stats = $query->pluck('value', "{$level}_id");

        // Load boundaries for the level and attach stats
        $regions = Region::where('level', $level)
            ->select('id', 'name', 'boundary')
            ->get()
            ->map(function ($region) use ($stats) {
                return [
                    'id' => $region->id,
                    'name' => $region->name,
                    'geometry' => json_decode($region->boundary), // assuming boundary is GeoJSON
                    'value' => $stats[$region->id] ?? 0,
                ];
            });

        return response()->json([
            'level' => $level,
            'metric' => $metric,
            'data' => $regions,
        ]);
    }

    public function spread(Request $request)
    {
        $speciesId = $request->input('species_id');
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');

        $query = Observation::query()
            ->select('latitude', 'longitude', 'taxon_id', 'id')
            ->whereNotNull('latitude')
            ->whereNotNull('longitude');

        if ($speciesId) {
            $query->where('taxon_id', $speciesId);
        }

        if ($startDate) {
            $query->whereDate('observed_on', '>=', $startDate);
        }

        if ($endDate) {
            $query->whereDate('observed_on', '<=', $endDate);
        }

        $observations = $query->limit(10000)->get(); // limit to prevent overload

        return response()->json([
            'observations' => $observations
        ]);
    }

    public function richness(Request $request)
    {
        $level = $request->input('level', 'district'); // 'state' or 'district'
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');

        $query = Observation::query();

        if ($startDate) {
            $query->whereDate('observed_on', '>=', $startDate);
        }

        if ($endDate) {
            $query->whereDate('observed_on', '<=', $endDate);
        }

        $regionKey = $level . '_id';

        $data = $query
            ->selectRaw("{$regionKey}, COUNT(*) as total_obs, COUNT(DISTINCT taxon_id) as species_richness")
            ->whereNotNull($regionKey)
            ->groupBy($regionKey)
            ->get()
            ->keyBy($regionKey);

        return response()->json([
            'level' => $level,
            'data' => $data,
        ]);
    }
}
