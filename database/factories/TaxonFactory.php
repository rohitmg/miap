<?php

namespace Database\Factories;

use App\Models\Taxon;
use Illuminate\Database\Eloquent\Factories\Factory;

class TaxonFactory extends Factory
{
    protected $model = Taxon::class;

    public function definition()
    {
        return [
            'taxon_id' => $this->faker->unique()->randomNumber(),
            'name' => $this->faker->unique()->word,
            'common_name' => $this->faker->word,
            'rank' => $this->faker->randomElement(['species', 'genus', 'family']),
            'rank_level' => $this->faker->numberBetween(10, 100),
            'ancestry' => '1,2,3',
            'is_invasive' => $this->faker->boolean,
            'invasive_status' => $this->faker->randomElement(['confirmed', 'suspected']),
            'impact_level' => $this->faker->randomElement(['high', 'medium', 'low']),
            'first_india_report' => $this->faker->date(),
            'native_range' => $this->faker->country,
            'parent_id' => null,
        ];
    }
}
