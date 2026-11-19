<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;

/**
 * Re-encodes every upload to WebP. Re-encoding drops EXIF data (incl. GPS) and any
 * payload hidden in the original file, and gives the storefront small, fast images.
 */
class ImageProcessor
{
    /** @var array<string, int> filename suffix => max width */
    private const SIZES = ['' => 1600, '_md' => 800, '_sm' => 400];

    private const QUALITY = 82;

    /**
     * Store the image in all sizes. Returns the main path plus its dimensions.
     *
     * @return array{path: string, width: int, height: int}
     */
    public function storeResponsive(UploadedFile $file, string $directory): array
    {
        $manager = new ImageManager(new Driver);
        $image = $manager->decodePath($file->getRealPath())->orient();
        $base = trim($directory, '/').'/'.Str::ulid()->toBase32();
        $main = ['path' => "{$base}.webp", 'width' => 0, 'height' => 0];

        foreach (self::SIZES as $suffix => $maxWidth) {
            $resized = (clone $image)->scaleDown(width: $maxWidth);
            Storage::disk('public')->put("{$base}{$suffix}.webp", $resized->encode(new WebpEncoder(self::QUALITY, strip: true))->toString());

            if ($suffix === '') {
                $main['width'] = $resized->width();
                $main['height'] = $resized->height();
            }
        }

        return $main;
    }

    /**
     * Single-size image (banners, category images, logo).
     */
    public function storeSingle(UploadedFile $file, string $directory, int $maxWidth = 2000): string
    {
        $manager = new ImageManager(new Driver);
        $path = trim($directory, '/').'/'.Str::ulid()->toBase32().'.webp';
        $encoded = $manager->decodePath($file->getRealPath())->orient()->scaleDown(width: $maxWidth)->encode(new WebpEncoder(self::QUALITY, strip: true));

        Storage::disk('public')->put($path, $encoded->toString());

        return $path;
    }

    public function deleteResponsive(string $path): void
    {
        $base = preg_replace('/\.webp$/', '', $path);

        Storage::disk('public')->delete(array_map(fn (string $suffix) => "{$base}{$suffix}.webp", array_keys(self::SIZES)));
    }

    public function delete(?string $path): void
    {
        if ($path !== null) {
            Storage::disk('public')->delete([$path, $this->thumbnailPath($path)]);
        }
    }

    /**
     * Small copy of a single-size image, stored next to it as "<name>_sm.webp"
     * (category circles on the home page). Safe to call again.
     */
    public function storeThumbnail(string $path, int $maxWidth = 240): void
    {
        $disk = Storage::disk('public');

        if (! $disk->exists($path)) {
            return;
        }

        $encoded = (new ImageManager(new Driver))->decodePath($disk->path($path))->scaleDown(width: $maxWidth)->encode(new WebpEncoder(80, strip: true));
        $disk->put($this->thumbnailPath($path), $encoded->toString());
    }

    public function thumbnailPath(string $path): string
    {
        return preg_replace('/\.webp$/', '', $path).'_sm.webp';
    }
}
