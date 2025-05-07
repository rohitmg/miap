<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use App\Models\Region;

class ImportRegionsCommand extends Command
{
    protected $signature = 'regions:import {--file= : Path to GeoJSON file}';
    protected $description = 'Import regions from a GeoJSON file into the regions table';

    public function handle()
    {
        $path = $this->option('file') ?? public_path('data/regions.geojson');

        if (!file_exists($path)) {
            $this->error("File not found: {$path}");
            return Command::FAILURE;
        }

        $geojson = json_decode(file_get_contents($path), true);

        if (!isset($geojson['features'])) {
            $this->error("Invalid GeoJSON file");
            return Command::FAILURE;
        }

        $stateNames = [];

        // First pass: insert all districts
        foreach ($geojson['features'] as $feature) {
            $props = $feature['properties'];
            if (!isset($props['dtname'])) continue;

            $stateName = ucwords(strtolower(trim($props['stname'])));
            $districtName = ucwords(strtolower(trim($props['dtname'])));
            $geometry = json_encode($feature['geometry']);

            $stateNames[$stateName] = true;

            // Insert district
            Region::create([
                'name' => $districtName,
                'level' => 'district',
                'original_id' => $props['id'] ?? null,
                'shape_length' => $props['SHAPE_Length'] ?? null,
                'shape_area' => $props['SHAPE_Area'] ?? null,
                'boundary' => DB::raw("ST_Multi(ST_GeomFromGeoJSON('{$geometry}'))"),
            ]);

            $this->info("Imported district: {$districtName}");
        }

        $states = [];

        // Second pass: insert states after computing their geometry
        foreach (array_keys($stateNames) as $stateName) {
            $districtNames = collect($geojson['features'])
                ->filter(fn($f) => isset($f['properties']['dtname']) && strtolower($f['properties']['stname']) === strtolower($stateName))
                ->map(fn($f) => ucwords(strtolower(trim($f['properties']['dtname']))))
                ->unique()
                ->values()
                ->toArray();

            if (empty($districtNames)) {
                $this->warn("No districts found for state: {$stateName}");
                continue;
            }

            $mergedGeom = DB::table('regions')
                ->where('level', 'district')
                ->whereIn('name', $districtNames)
                ->selectRaw('ST_AsText(ST_Union(boundary)) as geom')
                ->value('geom');


            if (!$mergedGeom) {
                $this->warn("Could not compute geometry for state: {$stateName}");
                continue;
            }

            $state = Region::create([
                'name' => $stateName,
                'level' => 'state',
                'boundary' => DB::raw("ST_GeomFromText('{$mergedGeom}', 4326)"),
            ]);

            // Update districts with parent_id
            $districtNames = collect($geojson['features'])
                ->filter(fn($f) => isset($f['properties']['dtname']) && strtolower($f['properties']['stname']) === strtolower($stateName))
                ->map(fn($f) => ucwords(strtolower(trim($f['properties']['dtname']))))
                ->unique()
                ->values()
                ->toArray();

            if (!empty($districtNames)) {
                Region::where('level', 'district')
                    ->whereIn('name', $districtNames)
                    ->update(['parent_id' => $state->id]);
            } else {
                $this->warn("No districts found to assign for state: {$stateName}");
            }


            $states[] = $state;
            $this->info("Created state: {$stateName}");
        }

        // Final step: create the country by union of all state geometries
        $countryGeom = DB::table('regions')
            ->where('level', 'state')
            ->selectRaw('ST_Union(boundary) as geom')
            ->value('geom');

        Region::create([
            'name' => 'India',
            'level' => 'country',
            'boundary' => DB::raw("'$countryGeom'::geometry"),
        ]);

        $this->info("Created country: India");

        return Command::SUCCESS;
    }
}
