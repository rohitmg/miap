<?php

namespace Database\Factories;

use App\Models\Photo;
use App\Models\Observation;
use Illuminate\Database\Eloquent\Factories\Factory;

class PhotoFactory extends Factory
{
    protected $model = Photo::class;

    public function definition(): array
    {
        return [
            'observation_id' => Observation::factory(),
            'photo_id' => $this->faker->unique()->numberBetween(10000, 999999),
            'url' => $this->faker->imageUrl(),
            'license' => 'CC-BY',
            'attribution' => $this->faker->name,
            'is_primary' => $this->faker->boolean,
        ];
    }
}
