<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\BannerPlacement;
use App\Http\Controllers\Controller;
use App\Http\Resources\Storefront\BannerResource;
use App\Http\Resources\Storefront\PageResource;
use App\Models\Banner;
use App\Models\Page;
use App\Services\ImageProcessor;
use App\Services\StorefrontRevalidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;

/**
 * Homepage banners and editable pages (about, policies).
 */
class ContentController extends Controller
{
    public function __construct(
        private ImageProcessor $images,
        private StorefrontRevalidator $revalidator,
    ) {}

    public function banners(): JsonResponse
    {
        $banners = Banner::query()->orderBy('placement')->orderBy('sort_order')->orderBy('id')->get();

        return response()->json(['data' => $banners->map(fn (Banner $banner) => [
            ...(new BannerResource($banner))->resolve(),
            'is_active' => $banner->is_active,
            'sort_order' => $banner->sort_order,
            'starts_at' => $banner->starts_at?->toIso8601String(),
            'ends_at' => $banner->ends_at?->toIso8601String(),
        ])]);
    }

    public function storeBanner(Request $request): JsonResponse
    {
        return response()->json(['data' => new BannerResource($this->saveBanner($request, new Banner))], 201);
    }

    public function updateBanner(Request $request, Banner $banner): BannerResource
    {
        return new BannerResource($this->saveBanner($request, $banner));
    }

    public function destroyBanner(Banner $banner): JsonResponse
    {
        $this->images->delete($banner->image_path);
        $this->images->delete($banner->mobile_image_path);
        $banner->delete();
        $this->revalidator->revalidate(['home']);

        return response()->json(['message' => 'Banner deleted.']);
    }

    public function pages(): AnonymousResourceCollection
    {
        return PageResource::collection(Page::query()->orderBy('title')->get());
    }

    public function updatePage(Request $request, Page $page): PageResource
    {
        $page->fill($request->validate([
            'title' => ['sometimes', 'string', 'max:150'],
            'body' => ['sometimes', 'string', 'max:100000'],
            'seo_title' => ['nullable', 'string', 'max:70'],
            'seo_description' => ['nullable', 'string', 'max:170'],
        ]));
        $page->updated_by = $request->user()->id;
        $page->save();

        $this->revalidator->revalidate(["page:{$page->slug}"]);

        return new PageResource($page);
    }

    private function saveBanner(Request $request, Banner $banner): Banner
    {
        $isNew = ! $banner->exists;
        $image = ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192', 'dimensions:max_width=8000,max_height=8000'];

        $data = $request->validate([
            'title' => [$isNew ? 'required' : 'sometimes', 'string', 'max:150'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'link_url' => ['nullable', 'string', 'max:255', 'regex:#^(/(?!/)|https://)#'],
            'button_text' => ['nullable', 'string', 'max:40'],
            'placement' => [$isNew ? 'required' : 'sometimes', Rule::enum(BannerPlacement::class)],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'image' => [$isNew ? 'required' : 'nullable', ...$image],
            'mobile_image' => ['nullable', ...$image],
        ]);

        $banner->fill(Arr::except($data, ['image', 'mobile_image']));

        if ($request->hasFile('image')) {
            $this->images->delete($banner->image_path);
            $banner->image_path = $this->images->storeSingle($request->file('image'), 'banners', 2400);
        }

        if ($request->hasFile('mobile_image')) {
            $this->images->delete($banner->mobile_image_path);
            $banner->mobile_image_path = $this->images->storeSingle($request->file('mobile_image'), 'banners', 1080);
        }

        $banner->save();
        $this->revalidator->revalidate(['home']);

        return $banner;
    }
}
