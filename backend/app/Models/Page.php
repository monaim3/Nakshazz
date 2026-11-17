<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['slug', 'title', 'body', 'seo_title', 'seo_description', 'updated_by'])]
class Page extends Model
{
    public function getRouteKeyName(): string
    {
        return 'slug';
    }
}
