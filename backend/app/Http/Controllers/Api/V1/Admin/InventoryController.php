<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MovementType;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MovementResource;
use App\Http\Resources\Admin\VariantResource;
use App\Models\ProductVariant;
use App\Services\InventoryService;
use App\Services\StorefrontRevalidator;
use App\Services\StoreSettings;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

class InventoryController extends Controller
{
    public function index(Request $request, StoreSettings $settings): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'low_stock' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $variants = ProductVariant::query()
            ->with('product:id,name,slug,status')
            ->where('is_active', true)
            ->when($filters['q'] ?? null, function (Builder $query, string $term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $query->where(fn (Builder $q) => $q->where('sku', 'like', $like)->orWhereHas('product', fn (Builder $p) => $p->where('name', 'like', $like)));
            })
            ->when(! empty($filters['low_stock']), fn (Builder $query) => $query
                ->where('allow_backorder', false)
                ->whereRaw('stock_on_hand - stock_reserved <= COALESCE(low_stock_threshold, ?)', [(int) $settings->get('low_stock_threshold', 3)]))
            ->orderByRaw('stock_on_hand - stock_reserved')
            ->orderBy('id')
            ->paginate($filters['per_page'] ?? 50);

        return VariantResource::collection($variants);
    }

    public function movements(ProductVariant $variant): AnonymousResourceCollection
    {
        return MovementResource::collection(
            $variant->movements()->with(['order:id,order_number', 'user:id,name'])->latest('created_at')->latest('id')->paginate(50)
        );
    }

    public function adjust(Request $request, InventoryService $inventory, StorefrontRevalidator $revalidator): JsonResponse
    {
        $data = $request->validate([
            'variant_id' => ['required', 'integer', Rule::exists('product_variants', 'id')],
            'type' => ['required', Rule::in([MovementType::Purchase->value, MovementType::AdjustmentIn->value, MovementType::AdjustmentOut->value])],
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        try {
            $variant = DB::transaction(function () use ($data, $inventory, $request) {
                $variant = $inventory->lockVariants([$data['variant_id']])->first();
                $inventory->adjust($variant, MovementType::from($data['type']), $data['quantity'], $data['reason'], $request->user());

                return $variant;
            });
        } catch (InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage(), 'errors' => ['quantity' => [$exception->getMessage()]]], 422);
        }

        $revalidator->revalidate(['products', "product:{$variant->product->slug}"]);

        return (new VariantResource($variant))->response();
    }
}
