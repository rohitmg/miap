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
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('user_id')->unique();
            $table->string('username')->unique();
            $table->string('user_icon_url')->nullable();
            $table->unsignedInteger('observations_count')->default(0);
            $table->unsignedInteger('identifications_count')->default(0);
            $table->float('reputation_score')->default(0);
            $table->timestamps();
        });
        
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');

    }
};
