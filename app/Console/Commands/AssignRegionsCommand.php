<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\AssignRegionService;

class AssignRegionsCommand extends Command
{
    protected $signature = 'regions:assign';
    protected $description = 'Assign district and state to each observation using spatial joins';

    public function handle()
    {
        $this->info("Starting spatial assignment of regions...");

        app(AssignRegionService::class)->assignRegions();

        $this->info("Region assignment completed.");
    }
}
