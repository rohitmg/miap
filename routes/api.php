<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\{
    MapController,
    RegionBoundaryController,
    RegionStatsController,
    ObservationDataController,
    TaxaController,
    TrendController,
    SpeciesController,
    UserController,
    QualityController,
    AnalysisController,
    DownloadController,
};

use App\Models\Observation;

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

    Route::prefix('stats')->group(function () { // Or 'region-stats'
        // Country Level Stats
        Route::get('country',         [RegionStatsController::class, 'countryStats']); // Stats for the whole country

        // State Level Stats
        Route::get('states',          [RegionStatsController::class, 'allStatesStats']); // Summary stats for all states (e.g., a list)
        Route::get('states/{state}',  [RegionStatsController::class, 'stateStats']);    // Specific stats for a single state

        // District Level Stats
        Route::get('districts',                                      [RegionStatsController::class, 'allDistrictsStats']);    // Summary stats for all districts (less common, might be too much data)
        Route::get('states/{state}/districts',                       [RegionStatsController::class, 'districtsStatsByState']); // Stats for all districts within a specific state
        Route::get('districts/{district}',                           [RegionStatsController::class, 'districtStats']);       // Specific stats for a single district
    });

    Route::get('taxa/all', [TaxaController::class, 'all']);



    // 1. Spatial Distribution
    Route::get('map/choropleth', [MapController::class, 'choropleth']);
    Route::get('map/spread', [MapController::class, 'spread']);
    Route::get('map/richness', [MapController::class, 'richness']);

    Route::prefix('states/{state}')->group(function (){
        Route::get('observations', [ObservationDataController::class, 'byState']);
    });

    Route::prefix('districts/{district}')->group(function (){
        Route::get('observations', [ObservationDataController::class, 'byDistrict']);
    });

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

Route::get('/custom', function (Request $request) {
  $x = Observation::where('taxon_id', 1493141)->get();
  $fields = ["id","inat_id","user_id","taxon_id","latitude","longitude","observed_on","positional_accuracy","place_guess","quality_grade","license","is_captive","num_identification_agreements","num_identification_disagreements","geoprivacy","location_is_exact","time_zone","inat_created_at","inat_updated_at","district_id","state_id","created_at","updated_at",];
  echo "<table>";
  echo "<tr>";
    foreach($fields as $f){
        echo "<th>" . $f . "</th>";
    }
    echo "</tr>";
  foreach($x as $y){
    echo "<tr>";
    foreach($fields as $f){
        echo "<td>" . $y->{$f} . "</td>";
    }
    echo "</tr>";
  }
  echo "</table>";
  return $x->count();
});

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
