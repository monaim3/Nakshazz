<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CouponType;
use App\Http\Controllers\Controller;
use App\Models\Coupon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CouponController extends Controller
{
    public function index(): JsonResponse
    {
        return JsonResource::collection(Coupon::query()->latest()->latest('id')->paginate(50))->response();
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => Coupon::query()->create($this->validated($request))], 201);
    }

    public function update(Request $request, Coupon $coupon): JsonResponse
    {
        $coupon->update($this->validated($request, $coupon));

        return response()->json(['data' => $coupon]);
    }

    /**
     * Used coupons are deactivated instead of deleted, keeping order history intact.
     */
    public function destroy(Coupon $coupon): JsonResponse
    {
        if ($coupon->usages()->exists()) {
            $coupon->update(['is_active' => false]);

            return response()->json(['message' => 'Coupon has been used, so it was deactivated.']);
        }

        $coupon->delete();

        return response()->json(['message' => 'Coupon deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Coupon $coupon = null): array
    {
        $required = $coupon ? 'sometimes' : 'required';
        if ($request->has('code')) {
            $request->merge(['code' => $request->filled('code') ? Str::upper(trim((string) $request->input('code'))) : $request->input('code')]);
        }

        return $request->validate([
            'code' => [$required, 'string', 'max:40', 'regex:/^[A-Z0-9_-]+$/', Rule::unique('coupons', 'code')->ignore($coupon?->id)],
            'type' => [$required, Rule::enum(CouponType::class)],
            'value' => [$required, 'numeric', 'min:0.01', 'decimal:0,2', Rule::when($request->input('type', $coupon?->type?->value) === CouponType::Percent->value, ['max:100'])],
            'max_discount' => ['nullable', 'numeric', 'min:0', 'decimal:0,2'],
            'min_order_amount' => ['nullable', 'numeric', 'min:0', 'decimal:0,2'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', 'after:starts_at'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'per_phone_limit' => ['nullable', 'integer', 'min:1'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
