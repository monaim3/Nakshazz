<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\DeliveryZone;
use App\Services\ActivityLogger;
use App\Services\ImageProcessor;
use App\Services\StorefrontRevalidator;
use App\Services\StoreSettings;
use App\Support\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;

/**
 * Owner-only store settings and delivery zones.
 */
class SettingsController extends Controller
{
    public function __construct(
        private StoreSettings $settings,
        private StorefrontRevalidator $revalidator,
    ) {}

    public function show(): JsonResponse
    {
        return response()->json(['data' => [
            'settings' => collect($this->settings->all())->map(fn (array $setting) => $setting['value']),
            'delivery_zones' => DeliveryZone::query()->orderBy('sort_order')->orderBy('id')->get(),
        ]]);
    }

    public function update(Request $request, ImageProcessor $images, ActivityLogger $log): JsonResponse
    {
        $phone = ['nullable', 'string', 'max:20'];

        $data = $request->validate([
            'store_name' => ['sometimes', 'string', 'max:100'],
            'tagline' => ['sometimes', 'nullable', 'string', 'max:150'],
            'phone' => $phone,
            'whatsapp_number' => $phone,
            'email' => ['nullable', 'email:rfc', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'facebook_url' => ['nullable', 'url:https', 'max:255'],
            'instagram_url' => ['nullable', 'url:https', 'max:255'],
            'cod_enabled' => ['sometimes', 'boolean'],
            'bkash_enabled' => ['sometimes', 'boolean'],
            'bkash_number' => ['nullable', 'string', 'max:20'],
            'bkash_account_type' => ['sometimes', Rule::in(['personal', 'merchant'])],
            'bkash_instructions' => ['nullable', 'string', 'max:500'],
            'low_stock_threshold' => ['sometimes', 'integer', 'min:0', 'max:1000'],
            'order_notification_email' => ['nullable', 'email:rfc', 'max:150'],
            'staff_max_discount_percent' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'reorder_cover_days' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'sms_enabled' => ['sometimes', 'boolean'],
            'sms_on_confirmed' => ['sometimes', 'boolean'],
            'sms_on_shipped' => ['sometimes', 'boolean'],
            'sms_on_delivered' => ['sometimes', 'boolean'],
            'logo' => ['nullable', 'file', 'image', 'mimes:png,jpg,jpeg,webp', 'max:4096'],
        ]);

        if (! empty($data['bkash_number'])) {
            $data['bkash_number'] = PhoneNumber::normalize($data['bkash_number']) ?? $data['bkash_number'];
        }

        $values = Arr::except($data, ['logo']);

        if ($request->hasFile('logo')) {
            $images->delete($this->settings->get('logo_path'));
            $values['logo_path'] = $images->storeSingle($request->file('logo'), 'branding', 800);
        }

        $before = collect($this->settings->all())->map(fn (array $setting) => $setting['value'])->all();
        $this->settings->update($values);
        $log->settingsChanged($before, Arr::except($values, ['logo_path']) + (isset($values['logo_path']) ? ['logo' => 'new logo'] : []));
        $this->revalidator->revalidate(['settings', 'home']);

        return $this->show();
    }

    public function storeZone(Request $request): JsonResponse
    {
        $zone = DeliveryZone::query()->create($this->validateZone($request, true));
        $this->revalidator->revalidate(['settings']);

        return response()->json(['data' => $zone], 201);
    }

    public function updateZone(Request $request, DeliveryZone $zone): JsonResponse
    {
        $zone->update($this->validateZone($request, false));
        $this->revalidator->revalidate(['settings']);

        return response()->json(['data' => $zone]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateZone(Request $request, bool $isNew): array
    {
        return $request->validate([
            'name' => [$isNew ? 'required' : 'sometimes', 'string', 'max:50'],
            'charge' => [$isNew ? 'required' : 'sometimes', 'numeric', 'min:0', 'max:99999', 'decimal:0,2'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100'],
        ]);
    }
}
