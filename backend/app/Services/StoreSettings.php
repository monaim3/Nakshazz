<?php

namespace App\Services;

use App\Models\StoreSetting;
use Illuminate\Support\Facades\Cache;

/**
 * Cached key/value store settings. The cache is cleared whenever a setting is saved.
 */
class StoreSettings
{
    public const CACHE_KEY = 'store_settings.all';

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->all()[$key]['value'] ?? $default;
    }

    public function bool(string $key, bool $default = false): bool
    {
        return (bool) $this->get($key, $default);
    }

    /**
     * Only settings flagged public, safe for the storefront.
     *
     * @return array<string, mixed>
     */
    public function publicValues(): array
    {
        return collect($this->all())
            ->filter(fn (array $setting) => $setting['is_public'])
            ->map(fn (array $setting) => $setting['value'])
            ->all();
    }

    /**
     * @param  array<string, mixed>  $values
     */
    public function update(array $values): void
    {
        foreach ($values as $key => $value) {
            // settings added after the first install have no row yet: create them (private)
            $updated = StoreSetting::query()->whereKey($key)->update(['value' => json_encode($value)]);
            if ($updated === 0 && ! StoreSetting::query()->whereKey($key)->exists()) {
                StoreSetting::query()->create(['key' => $key, 'value' => $value, 'is_public' => false]);
            }
        }

        $this->flush();
    }

    public function flush(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * @return array<string, array{value: mixed, is_public: bool}>
     */
    public function all(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, fn () => StoreSetting::query()
            ->get()
            ->mapWithKeys(fn (StoreSetting $setting) => [$setting->key => ['value' => $setting->value, 'is_public' => $setting->is_public]])
            ->all());
    }
}
