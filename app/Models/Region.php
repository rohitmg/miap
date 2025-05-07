<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use MStaack\LaravelPostgis\Eloquent\PostgisTrait;


class Region extends Model
{
    /** @use HasFactory<\Database\Factories\RegionFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'level',
        'parent_id',
        'original_id',
        'shape_length',
        'shape_area',
        'boundary'
    ];

    public function parent()
    {
        return $this->belongsTo(Region::class, 'parent_id');
    }
}
