<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    // database/migrations/xxxx_xx_xx_create_regions_table.php

    public function up(): void
    {
        Schema::create('regions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('state_name')->nullable();
            $table->enum('level', ['country', 'state', 'district']);
            $table->foreignId('parent_id')->nullable()->constrained('regions')->nullOnDelete();
            $table->unsignedBigInteger('original_id')->nullable();
            $table->double('shape_length')->nullable();
            $table->double('shape_area')->nullable();
            $table->geometry('boundary', 'MULTIPOLYGON', 4326); // EPSG:4326 standard for lat/lon
            $table->timestamps();

            $table->unique(['level', 'name', 'state_name'], 'regions_level_name_state_idx');
        });
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('regions');
    }
};
