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
        Schema::create('observations', function (Blueprint $table) {
            $table->id();
            $table->string('inat_id')->unique();
            $table->unsignedBigInteger('user_id');
            $table->foreign('user_id')->references('user_id')->on('users')->onDelete('cascade');

            $table->unsignedBigInteger('taxon_id');
            $table->foreign('taxon_id')->references('taxon_id')->on('taxa')->onDelete('cascade');

            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->date('observed_on')->nullable();
            $table->integer('positional_accuracy')->nullable();
            $table->string('place_guess')->nullable();
            $table->string('quality_grade')->nullable();
            $table->string('license')->nullable();
            $table->boolean('is_captive')->default(false);
            $table->unsignedInteger('num_identification_agreements')->default(0);
            $table->unsignedInteger('num_identification_disagreements')->default(0);
            $table->string('geoprivacy')->nullable();
            $table->boolean('location_is_exact')->default(true);
            $table->string('time_zone')->nullable();
            $table->timestamp('inat_created_at')->nullable();
            $table->timestamp('inat_updated_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('observations');
    }
};
