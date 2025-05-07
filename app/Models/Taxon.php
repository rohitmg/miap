<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Taxon extends Model
{
    use HasFactory;

    protected $fillable = [
        'taxon_id',
        'name',
        'common_name',
        'rank',
        'rank_level',
        'ancestry',
        'is_invasive',
        'invasive_status',
        'impact_level',
        'first_india_report',
        'native_range',
        'parent_id',
    ];

    public function observations()
    {
        return $this->hasMany(Observation::class);
    }

    public function parent()
    {
        return $this->belongsTo(Taxon::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(Taxon::class, 'parent_id');
    }
}
