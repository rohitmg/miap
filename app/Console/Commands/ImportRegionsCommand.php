<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ImportRegionsCommand extends Command
{
    protected $signature   = 'regions:import {--file= : path to districts geojson}';
    protected $description = 'Bulk-import districts and dissolve states & country';

    private const SRID       = 4326;
    private const BATCH      = 400;
    private const GRID_TOLER = 0.0001;   // ≈ 11 m

    /* -------------------------------------------------------------- */
    public function handle(): int
    {
        $path = $this->option('file') ?? public_path('data/regions.geojson');
        if (!is_readable($path)) {
            $this->error("File not found: $path");
            return self::FAILURE;
        }

        $json = json_decode(file_get_contents($path), true);
        if (!isset($json['features'])) {
            $this->error('Invalid GeoJSON');
            return self::FAILURE;
        }

        /* -------- build PHP row buffer -------- */
        $bar  = $this->output->createProgressBar(count($json['features']));
        $rows = [];
        foreach ($json['features'] as $f) {
            $p = $f['properties'] ?? [];
            if (empty($p['dtname'])) {
                $bar->advance();
                continue;
            }

            $rows[] = [
                'name'         => ucwords(strtolower(trim($p['dtname']))),
                'state_name'   => ucwords(strtolower(trim($p['stname']))),
                'level'        => 'district',
                'original_id'  => $p['id'] ?? null,
                'shape_length' => $p['SHAPE_Length'] ?? null,
                'shape_area'   => $p['SHAPE_Area']  ?? null,
                'geom_json'    => json_encode($f['geometry']),
                'ts'           => now(),
            ];
            $bar->advance();
        }
        $bar->finish();
        $this->newLine();
        if (!$rows) {
            $this->info('Nothing to import');
            return self::SUCCESS;
        }

        /* ---------------------------------------------------------- */
        DB::transaction(function () use ($rows) {

            /* 1. districts -------------------------------------------------- */
            foreach (array_chunk($rows, self::BATCH) as $chunk) {
                $vals = implode(',', array_fill(
                    0,
                    count($chunk),
                    "(?,?,?,?,?,?, ST_SetSRID(ST_GeomFromGeoJSON(?)," . self::SRID . "),?,?)"
                ));

                $bind = [];
                foreach ($chunk as $r) {
                    array_push(
                        $bind,
                        $r['name'],
                        $r['state_name'],
                        $r['level'],
                        $r['original_id'],
                        $r['shape_length'],
                        $r['shape_area'],
                        $r['geom_json'],
                        $r['ts'],
                        $r['ts']
                    );
                }
                DB::insert("
                    INSERT INTO regions
                      (name,state_name,level,original_id,shape_length,shape_area,boundary,created_at,updated_at)
                    VALUES $vals
                    ON CONFLICT (level,name,state_name) DO NOTHING
                ", $bind);
            }
            $this->info('✓ districts inserted');

            /* 2. dissolve states ------------------------------------------- */
            DB::statement("
              INSERT INTO regions (name,state_name,level,boundary,created_at,updated_at)
              SELECT  state_name,               -- name
                      state_name,               -- state_name (not NULL)
                      'state',
                      ST_Multi(
                        ST_UnaryUnion(
                          ST_Collect(
                            ST_SnapToGrid(boundary, ?)
                          )
                        )
                      )::geometry(MultiPolygon," . self::SRID . "),
                      NOW(),NOW()
              FROM   regions
              WHERE  level = 'district'
              GROUP  BY state_name
              ON CONFLICT (level,name,state_name) DO NOTHING
            ", [self::GRID_TOLER]);
            $this->info('✓ states dissolved');

            /* 3. link districts → states ----------------------------------- */
            DB::update("
              UPDATE regions d
              SET    parent_id = s.id
              FROM   regions s
              WHERE  d.level       = 'district'
                AND  s.level       = 'state'
                AND  d.state_name  = s.name
            ");

            /* 4. dissolve country ------------------------------------------ */
            DB::statement("
              INSERT INTO regions (name,state_name,level,boundary,created_at,updated_at)
              SELECT 'India','India','country',
                     ST_Multi(
                       ST_UnaryUnion(
                         ST_Collect(boundary)
                       )
                     )::geometry(MultiPolygon," . self::SRID . "),
                     NOW(),NOW()
              FROM regions
              WHERE level = 'state'
              ON CONFLICT (level,name,state_name) DO NOTHING
            ");
            $this->info('✓ country dissolved');
        });

        $this->info('🎉 import finished');
        return self::SUCCESS;
    }
}
