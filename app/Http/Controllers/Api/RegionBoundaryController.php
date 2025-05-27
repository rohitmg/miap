<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Region;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RegionBoundaryController extends Controller
{
    public function country(): JsonResponse
    {
        $country = Region::where('level', 'country')
            ->select('id', 'name', DB::raw('ST_AsGeoJSON(boundary) as geometry'))
            ->firstOrFail();
        return response()->json($country);
    }

    public function states(): JsonResponse
    {
        $states = Region::where('level', 'state')
            ->select('id', 'name', DB::raw('ST_AsGeoJSON(boundary) as geometry'))
            ->orderBy('name')
            ->get();
        return response()->json($states);
    }

    public function state(Region $state): JsonResponse
    {
        // Implicit Route-Model binding ensures $state->level==='state'
        return response()->json([
            'id'       => $state->id,
            'name'     => $state->name,
            'geometry' => json_decode($state->boundary),
        ]);
    }

    public function districts(): JsonResponse
    {
        $districts = Region::where('level', 'district')
            ->select('id', 'name', DB::raw('ST_AsGeoJSON(boundary) as geometry'))
            ->orderBy('name')
            ->get();
        return response()->json($districts);
    }

    public function districtsByState(Region $state): JsonResponse
    {
        $districts = Region::where('level', 'district')
            ->where('parent_id', $state->id)
            ->select('id', 'name', DB::raw('ST_AsGeoJSON(boundary) as geometry'))
            ->orderBy('name')
            ->get();
        return response()->json($districts);
    }

    public function district(Region $district): JsonResponse
    {
        // Implicit binding with a check could ensure level==='district'
        return response()->json([
            'id'       => $district->id,
            'name'     => $district->name,
            'geometry' => json_decode($district->boundary),
        ]);
    }
}
