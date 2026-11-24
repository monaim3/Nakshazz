<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\OrderResource;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $customers = Customer::query()
            ->when($filters['q'] ?? null, function (Builder $query, string $term) {
                $like = '%'.addcslashes(trim($term), '%_\\').'%';
                $query->where(fn (Builder $q) => $q->where('name', 'like', $like)->orWhere('phone', 'like', $like)->orWhere('email', 'like', $like));
            })
            ->withCount([
                'orders' => fn (Builder $q) => $q->where('status', '!=', OrderStatus::Cancelled),
                'orders as purchases_count' => fn (Builder $q) => $q->whereIn('status', [OrderStatus::Delivered, OrderStatus::Shipped]),
            ])
            ->withSum(['orders as total_purchases' => fn (Builder $q) => $q->whereIn('status', [OrderStatus::Delivered, OrderStatus::Shipped])], 'grand_total')
            ->withMax('orders as last_order_at', 'placed_at')
            ->orderByDesc('last_order_at')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 25);

        return JsonResource::collection($customers->through(fn (Customer $customer) => $this->payload($customer)))->response();
    }

    public function show(Customer $customer): JsonResponse
    {
        $customer->load(['addresses', 'orders' => fn ($q) => $q->latest('placed_at')->latest('id')->limit(50)]);
        $customer->loadCount([
            'orders' => fn (Builder $q) => $q->where('status', '!=', OrderStatus::Cancelled),
            'orders as purchases_count' => fn (Builder $q) => $q->whereIn('status', [OrderStatus::Delivered, OrderStatus::Shipped]),
        ]);
        $customer->loadSum(['orders as total_purchases' => fn (Builder $q) => $q->whereIn('status', [OrderStatus::Delivered, OrderStatus::Shipped])], 'grand_total');

        return response()->json(['data' => [
            ...$this->payload($customer),
            'addresses' => $customer->addresses,
            'orders' => OrderResource::collection($customer->orders),
        ]]);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $customer->update($request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'email' => ['sometimes', 'nullable', 'email:rfc', 'max:150'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]));

        return response()->json(['data' => $this->payload($customer)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Customer $customer): array
    {
        return [
            'id' => $customer->id,
            'name' => $customer->name,
            'phone' => $customer->phone,
            'email' => $customer->email,
            'notes' => $customer->notes,
            'orders_count' => $customer->orders_count ?? null,
            // same orders as total_purchases (shipped + delivered): use these two for the average
            'purchases_count' => $customer->purchases_count ?? null,
            'total_purchases' => number_format((float) ($customer->total_purchases ?? 0), 2, '.', ''),
            'last_order_at' => $customer->last_order_at ?? null,
            'created_at' => $customer->created_at?->toIso8601String(),
        ];
    }
}
