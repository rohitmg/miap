<?php

namespace App\Console\Commands;

use App\Models\Observation;
use App\Models\Taxon;
use App\Models\User;
use App\Models\Photo;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use League\Csv\Reader;
use League\Csv\Statement;
use Illuminate\Support\Carbon;
use App\Services\AssignRegionService;

class ImportObservationsCommand extends Command
{
    protected $signature = 'import:observations {csv : Path to the CSV file to import}';
    protected $description = 'Import observations from CSV file in two passes (users + taxa, then observations)';

    protected $userCache = [];
    protected $taxonCache = [];


    public function handle()
    {
        $path = $this->argument('csv');

        if (!file_exists($path)) {
            $this->error("File not found: {$path}");
            return Command::FAILURE;
        }

        $csv = Reader::createFromPath($path);
        $csv->setHeaderOffset(0);
        $records = iterator_to_array($csv->getRecords());
        $total = count($records);

        $this->info("Starting import for $total rows...");

        // First: Import unique users
        $this->importUsers($records);

        // Second: Import unique taxa
        $this->importTaxa($records);

        // Third: Import observations (batched)
        $this->importObservations($records, $total);

        // Fourth: Import photos
        $this->importPhotos($records);

        // Fifth: Assign regions using spatial query
        $this->info("Assigning regions to observations...");
        app(AssignRegionService::class)->assignRegions();

        $this->info("All import tasks completed successfully.");
        return Command::SUCCESS;
    }



    protected function importUsers(array $records): void
    {
        $this->info("Importing users...");

        $existing = User::pluck('user_id')->all();
        $existingSet = array_flip($existing); // faster lookup

        $newUsers = [];
        foreach ($records as $row) {
            $inatId = $row['user_id'];
            // dd(!$inatId ,isset($existingSet[$inatId]));
            if (!$inatId || isset($existingSet[$inatId])) continue;

            $newUsers[$inatId] = [
                'user_id' => $inatId,
                'username' => $row['user_login'] ?? null,
                'user_icon_url' => null,
                'observations_count' => 0,
                'identifications_count' => 0,
                'reputation_score' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        $chunks = array_chunk($newUsers, 1000);
        foreach ($chunks as $chunk) {
            User::insert($chunk);
        }

        $this->info("Users imported: " . count($newUsers));
    }

    protected function importTaxa(array $records): void
    {
        $this->info("Importing taxa...");

        $existing = Taxon::pluck('taxon_id')->all();
        $existingSet = array_flip($existing); // fast lookup

        $newTaxa = [];
        foreach ($records as $row) {
            $inatTaxonId = $row['taxon_id'];
            if (!$inatTaxonId || isset($existingSet[$inatTaxonId])) continue;

            $newTaxa[$inatTaxonId] = [
                'taxon_id' => $inatTaxonId,
                'name' => $row['scientific_name'] ?? null,
                'common_name' => $row['common_name'] ?? null,
                'rank' => null,
                'rank_level' => null,
                'ancestry' => null,
                'is_invasive' => false,
                'invasive_status' => null,
                'impact_level' => null,
                'first_india_report' => null,
                'native_range' => null,
                'parent_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        $chunks = array_chunk($newTaxa, 1000);
        foreach ($chunks as $chunk) {
            Taxon::insert($chunk);
        }

        $this->info("Taxa imported: " . count($newTaxa));
    }


    protected function importObservations($records, $total)
    {
        $batch = [];
        $batchSize = 2500;
        $processed = 0;
        $skipped = 0;

        foreach ($records as $record) {
            $observedOn = $record['observed_on'] ?? null;
            $createdAt = $record['created_at'] ?? null;
            $updatedAt = $record['updated_at'] ?? null;

            // Skip rows without mandatory fields
            if (empty($record['id']) || empty($observedOn) || empty($record['user_id']) || empty($record['taxon_id'])) {
                $skipped++;
                continue;
            }

            $batch[] = [
                'inat_id'               => $record['id'],
                'user_id'               => (int)$record['user_id'],
                'taxon_id'              => (int)$record['taxon_id'],
                'latitude'              => $record['latitude'] ?? null,
                'longitude'             => $record['longitude'] ?? null,
                'observed_on'           => $observedOn ?: null,
                'positional_accuracy'   => is_numeric($record['positional_accuracy']) ? (float)$record['positional_accuracy'] : null,
                'place_guess'           => $record['place_guess'] ?? null,
                'quality_grade'         => $record['quality_grade'] ?? null,
                'license'               => $record['license'] ?? null,
                'is_captive'            => in_array(strtolower($record['captive_cultivated']), ['1', 'true', 't', 'yes', 'y']) ? true : false,
                'inat_created_at'       => $this->parseDate($record['created_at']),
                'inat_updated_at'       => $this->parseDate($record['updated_at']),
                'created_at'            => $this->parseDate($createdAt) ?? now(),
                'updated_at'            => $this->parseDate($updatedAt) ?? now(),
            ];

            if (count($batch) === $batchSize) {
                DB::table('observations')->insert($batch);
                $processed += count($batch);
                $this->info("Inserted $processed / $total rows...");
                $batch = [];
            }
        }

        if (count($batch)) {
            DB::table('observations')->insert($batch);
            $processed += count($batch);
            $this->info("Inserted final batch. Total inserted: $processed");
        }

        $this->info("Observation import complete. Skipped: $skipped");
    }

    protected function importPhotos(array $records): void
    {
        $this->info("Importing photos...");

        $photoBatch = [];
        $batchSize = 2500;
        $inserted = 0;

        // Create a mapping from inat_id to internal observation ID
        $observationIds = Observation::pluck('id', 'inat_id')->toArray();

        foreach ($records as $record) {
            $inatId = $record['id'] ?? null;
            $url = $record['image_url'] ?? null;

            if (!$inatId || !$url || !isset($observationIds[$inatId])) {
                continue;
            }

            $photoBatch[] = [
                'observation_id' => $observationIds[$inatId],
                'photo_id' => null,
                'url' => $url,
                'license' => $record['license'] ?? null,
                'attribution' => $record['user_login'] ?? null,
                'is_primary' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (count($photoBatch) === $batchSize) {
                Photo::insert($photoBatch);
                $inserted += $batchSize;
                $this->info("Inserted $inserted photos...");
                $photoBatch = [];
            }
        }

        if (count($photoBatch)) {
            Photo::insert($photoBatch);
            $inserted += count($photoBatch);
        }

        $this->info("Photos imported: $inserted");
    }



    protected function parseDate($value)
    {
        return empty($value) ? null : Carbon::parse($value);
    }
}
