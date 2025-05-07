<?php

namespace Database\Factories;

use App\Models\Observation;
use App\Models\User;
use App\Models\Taxon;
use Illuminate\Database\Eloquent\Factories\Factory;

class ObservationFactory extends Factory
{
    protected $model = Observation::class;

    public function definition()
    {
        return [
            'inat_id' => $this->faker->unique()->uuid,
            'user_id' => User::factory(),
            'taxon_id' => Taxon::factory(),
            'latitude' => $this->faker->latitude,
            'longitude' => $this->faker->longitude,
            'observed_on' => $this->faker->date(),
            'positional_accuracy' => $this->faker->numberBetween(1, 100),
            'place_guess' => $this->faker->city,
            'quality_grade' => $this->faker->randomElement(['research', 'needs_id', 'casual']),
            'license' => 'CC-BY-NC',
            'is_captive' => $this->faker->boolean,
            'num_identification_agreements' => $this->faker->numberBetween(0, 10),
            'num_identification_disagreements' => $this->faker->numberBetween(0, 5),
            'geoprivacy' => null,
            'location_is_exact' => true,
            'time_zone' => 'Asia/Kolkata',
            'inat_created_at' => now()->subDays(rand(1, 100)),
            'inat_updated_at' => now(),
        ];
    }
}
