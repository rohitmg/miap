<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('taxa', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('taxon_id')->unique();
            $table->string('name');
            $table->string('common_name')->nullable();
            $table->string('rank')->nullable();
            $table->integer('rank_level')->nullable();
            $table->string('ancestry')->nullable();
            $table->boolean('is_invasive')->default(false);
            $table->string('invasive_status')->nullable();
            $table->string('impact_level')->nullable();
            $table->date('first_india_report')->nullable();
            $table->string('native_range')->nullable();
            $table->foreignId('parent_id')->nullable()->constrained('taxa');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('taxa');
    }
};
