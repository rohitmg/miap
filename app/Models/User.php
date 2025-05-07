<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Authenticatable
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'username',
        'user_icon_url',
        'observations_count',
        'identifications_count',
        'reputation_score',
    ];

    public function observations()
    {
        return $this->hasMany(Observation::class);
    }
}
