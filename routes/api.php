<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\{
    MapController,
    TrendController,
    SpeciesController,
    UserController,
    QualityController,
    AnalysisController,
    DownloadController,
    RegionBoundaryController
};

Route::prefix('v1')->group(function () {
    Route::prefix('regions')->group(function () {
        // Country boundary
        Route::get('country',         [RegionBoundaryController::class, 'country']);
    
        // States
        Route::get('states',          [RegionBoundaryController::class, 'states']);
        Route::get('states/{state}',  [RegionBoundaryController::class, 'state']);
    
        // Districts
        Route::get('districts',                                      [RegionBoundaryController::class, 'districts']);
        Route::get('states/{state}/districts',                       [RegionBoundaryController::class, 'districtsByState']);
        Route::get('districts/{district}',                           [RegionBoundaryController::class, 'district']);
    });
    // 1. Spatial Distribution
    Route::get('map/choropleth', [MapController::class, 'choropleth']);
    Route::get('map/spread', [MapController::class, 'spread']);
    Route::get('map/richness', [MapController::class, 'richness']);

    // // 2. Temporal Trends
    // Route::get('trends/observations', [TrendController::class, 'observationTimeline']);
    // Route::get('trends/species', [TrendController::class, 'speciesReporting']);
    // Route::get('trends/cumulative', [TrendController::class, 'cumulativeGrowth']);

    // // 3. Species Centric
    // Route::get('species/top', [SpeciesController::class, 'topReported']);
    // Route::get('species/presence', [SpeciesController::class, 'presenceMatrix']);
    // Route::get('species/{id}/expansion', [SpeciesController::class, 'rangeExpansion']);
    // Route::get('species/{id}/profile', [SpeciesController::class, 'profile']);

    // // 4. User Participation
    // Route::get('users/stats', [UserController::class, 'contributorsByRegion']);
    // Route::get('users/top', [UserController::class, 'topContributors']);
    // Route::get('users/activity-heatmap', [UserController::class, 'contributionHeatmap']);

    // // 5. Community Science Quality
    // Route::get('quality/identifications', [QualityController::class, 'identificationStats']);
    // Route::get('quality/filtered-map', [QualityController::class, 'filteredMap']);

    // // 6. Cross-Dimensional Analysis
    // Route::get('analysis/effort-vs-richness', [AnalysisController::class, 'effortVsRichness']);
    // Route::get('analysis/habitat', [AnalysisController::class, 'habitatBreakdown']);
    // Route::get('analysis/intensity-index', [AnalysisController::class, 'invasionIndex']);

    // // 7. Download
    // Route::get('download', [DownloadController::class, 'export']);
});



Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
