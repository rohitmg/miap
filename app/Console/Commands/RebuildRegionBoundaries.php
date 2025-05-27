<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class RebuildRegionBoundaries extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'regions:rebuild';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Command description';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        app(\App\Services\RegionBoundaryRebuildService::class)->rebuildBoundaries();
    }
}
