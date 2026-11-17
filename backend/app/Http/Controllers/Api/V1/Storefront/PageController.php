<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\PageResource;
use App\Models\Page;

class PageController extends Controller
{
    public function show(Page $page): PageResource
    {
        return new PageResource($page);
    }
}
