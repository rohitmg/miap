<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Taxon; // Assuming your model is named Taxon
use Illuminate\Http\JsonResponse;

class TaxaController extends Controller
{
    /**
     * Retrieve a list of all taxa.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function all(): JsonResponse
    {
        try {
            $taxa = Taxon::query()
                ->select(['taxon_id as id', 'name']) // IMPORTANT: Only select necessary columns
                ->orderBy('name', 'asc')   // Order them alphabetically for the frontend
                ->get();

            return response()->json($taxa);

        } catch (\Exception $e) {
            \Log::error("Error fetching all taxa: " . $e->getMessage());
            return response()->json(['message' => 'An error occurred while fetching taxa list.'], 500);
        }
    }
}

