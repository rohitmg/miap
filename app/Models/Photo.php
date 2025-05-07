<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Photo extends Model
{
    use HasFactory;

    protected $fillable = [
        'observation_id',
        'photo_id',
        'url',
        'license',
        'attribution',
        'is_primary',
    ];

    public function observation()
    {
        return $this->belongsTo(Observation::class);
    }
}
