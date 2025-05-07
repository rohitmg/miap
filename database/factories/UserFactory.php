<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class UserFactory extends Factory
{
    protected $model = User::class;

    public function definition()
    {
        return [
            'user_id' => $this->faker->unique()->randomNumber(),
            'username' => $this->faker->unique()->userName,
            'user_icon_url' => $this->faker->imageUrl(),
            'observations_count' => $this->faker->numberBetween(0, 500),
            'identifications_count' => $this->faker->numberBetween(0, 300),
            'reputation_score' => $this->faker->randomFloat(2, 0, 5),
        ];
    }
}
