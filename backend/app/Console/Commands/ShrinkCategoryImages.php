<?php

namespace App\Console\Commands;

use App\Models\Category;
use App\Services\ImageProcessor;
use App\Services\StorefrontRevalidator;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;

/**
 * One-off clean-up: category pictures were stored up to 1200px wide (100 KB+) although the
 * shop shows them as small circles. Re-encodes each one in place at 640px and adds a 240px
 * thumbnail next to it. Safe to run again.
 */
class ShrinkCategoryImages extends Command
{
    protected $signature = 'images:shrink-categories {--width=640}';

    protected $description = 'Re-encode existing category images at a smaller width';

    public function handle(StorefrontRevalidator $revalidator, ImageProcessor $images): int
    {
        $width = max(200, (int) $this->option('width'));
        $disk = Storage::disk('public');
        $manager = new ImageManager(new Driver);
        $saved = 0;

        foreach (Category::query()->whereNotNull('image_path')->get() as $category) {
            if (! $disk->exists($category->image_path)) {
                continue;
            }

            $before = $disk->size($category->image_path);
            $image = $manager->decodePath($disk->path($category->image_path));

            if ($image->width() <= $width) {
                $images->storeThumbnail($category->image_path);

                continue;
            }

            $disk->put($category->image_path, $image->scaleDown(width: $width)->encode(new WebpEncoder(80, strip: true))->toString());
            $images->storeThumbnail($category->image_path);
            clearstatcache();
            $after = $disk->size($category->image_path);
            $saved += $before - $after;
            $this->line(sprintf('%s: %d KB -> %d KB', $category->name, $before / 1024, $after / 1024));
        }

        $revalidator->revalidate(['categories', 'home']);
        $this->info(sprintf('Saved %d KB.', $saved / 1024));

        return self::SUCCESS;
    }
}
