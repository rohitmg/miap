<?php

namespace App\Services;

use App\Models\Observation;
use App\Models\Region;
use Illuminate\Support\Facades\DB;

class AssignRegionService
{
    public function assignRegions(): void
    {
        $this->info("Fetching observations without district...");

        // Get observations without district, only those with coordinates
        $observations = Observation::whereNull('district_id')
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->select('id', 'latitude', 'longitude')
            ->get();

        $count = $observations->count();

        if ($count === 0) {
            $this->info("No unassigned observations found.");
            return;
        }

        $this->info("Found $count observations. Grouping by coordinates...");

        // Group by rounded lat/lng to reduce repeated spatial queries
        $grouped = $observations->groupBy(function ($obs) {
            return round($obs->latitude, 5) . ',' . round($obs->longitude, 5);
        });

        $totalCoords = count($grouped);
        $this->info("Processing $totalCoords unique locations...");

        $updates = [];
        $progress = 0;

        foreach ($grouped as $coordKey => $group) {
            [$lat, $lng] = explode(',', $coordKey);
            $pointWKT = "POINT($lng $lat)";

            // Spatial query: Find district containing this point
            $district = Region::where('level', 'district')
                ->whereRaw("ST_Contains(boundary, ST_SetSRID(ST_GeomFromText(?), 4326))", [$pointWKT])
                ->select('id', 'parent_id')
                ->first();

            if ($district) {
                foreach ($group as $obs) {
                    $updates[] = [
                        'id' => $obs->id,
                        'district_id' => $district->id,
                        'state_id' => $district->parent_id,
                    ];
                }
            }

            $progress++;
            if ($progress % 1000 === 0 || $progress === $totalCoords) {
                $this->info("Processed $progress / $totalCoords coordinate groups...");
            }
        }

        $this->info("Total observations to update: " . count($updates));

        foreach (array_chunk($updates, 1000) as $chunk) {
            // Build a case update query for batch efficiency
            $ids = collect($chunk)->pluck('id')->all();

            foreach ($chunk as $row) {
                Observation::where('id', $row['id'])->update([
                    'district_id' => $row['district_id'],
                    'state_id' => $row['state_id'],
                ]);
            }
        }

        $this->info("✅ Region assignment complete.");
    }

    protected function info(string $message): void
    {
        if (app()->runningInConsole()) {
            echo "[INFO] $message\n";
        }
    }
}
