<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class RegionBoundaryRebuildService
{
    /**
     * Build dissolved polygons for every state and for the country.
     * If any district record looks problematic (missing geometry /
     * invalid geometry / missing parent id) the service will dd()
     * those rows so you can inspect and fix them before the dissolve.
     */
    public function rebuildBoundaries(): void
    {
        /* ------------------------------------------------------------
         | 1.  Sanity-check districts before we touch the geometry
         |-------------------------------------------------------------*/
        $badDistricts = collect(DB::select(
            /** @lang PostgreSQL */
            "
            SELECT  id,
                    name,
                    parent_id,
                    CASE
                        WHEN boundary IS NULL              THEN 'NULL geometry'
                        WHEN NOT ST_IsValid(boundary)      THEN 'INVALID geometry'
                        WHEN parent_id IS NULL             THEN 'NO parent'
                    END AS issue
            FROM    regions
            WHERE   level = 'district'
              AND   (
                     boundary IS NULL
                     OR NOT ST_IsValid(boundary)
                     OR parent_id IS NULL
                   )
            "
        ));

        /* If we found any suspect rows → dump & exit so the dev can fix them */
        if ($badDistricts->isNotEmpty()) {
            dd($badDistricts->toArray());
        }

        /* ------------------------------------------------------------
         | 2.  Re-build state & country boundaries
         |-------------------------------------------------------------*/
        DB::beginTransaction();
        try {
            /* 2a. STATES  ──────────────────────────────────────────── */
            // Robust dissolve:  ST_UnaryUnion(ST_Collect()) is faster /
            //                   safer than chained ST_Union.
            DB::statement(
                /** @lang PostgreSQL */
                "
                UPDATE regions AS st
                SET    boundary = sub.geom
                FROM (
                    SELECT parent_id AS state_id,
                           ST_Multi(
                               ST_UnaryUnion(
                                   ST_Collect(boundary)
                               )
                           ) AS geom
                    FROM   regions
                    WHERE  level = 'district'
                    GROUP  BY parent_id
                ) AS sub
                WHERE st.id    = sub.state_id
                  AND st.level = 'state'
                "
            );

            /* 2b. COUNTRY ─────────────────────────────────────────── */
            DB::statement(
                /** @lang PostgreSQL */
                "
                WITH country_geom AS (
                    SELECT ST_Multi(
                               ST_UnaryUnion(
                                   ST_Collect(boundary)
                               )
                           ) AS geom
                    FROM   regions
                    WHERE  level = 'state'
                )
                UPDATE regions
                SET    boundary = (SELECT geom FROM country_geom)
                WHERE  level    = 'country'
                "
            );

            DB::commit();
            $this->info('✅ Boundaries rebuilt for all states and country.');
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('❌ Boundary rebuild failed: ' . $e->getMessage());
        }
    }

    /* -- tiny console helpers --------------------------------------- */
    protected function info(string $msg): void
    {
        if (app()->runningInConsole()) echo "[INFO]  $msg\n";
    }

    protected function error(string $msg): void
    {
        if (app()->runningInConsole()) echo "[ERROR] $msg\n";
    }
}
