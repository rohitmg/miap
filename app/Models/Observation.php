<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Observation extends Model
{
    use HasFactory;

    protected $fillable = [
        'inat_id',
        'user_id',
        'taxon_id',
        'latitude',
        'longitude',
        'observed_on',
        'positional_accuracy',
        'place_guess',
        'quality_grade',
        'license',
        'is_captive',
        'num_identification_agreements',
        'num_identification_disagreements',
        'geoprivacy',
        'location_is_exact',
        'time_zone',
        'inat_created_at',
        'inat_updated_at',
        'district_id',
        'state_id'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function taxon()
    {
        return $this->belongsTo(Taxon::class);
    }
}
