<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderSource;
use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Enums\SalesChannel;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ManualSaleRequest;
use App\Http\Requests\Admin\OrderReturnRequest;
use App\Http\Requests\Admin\UpdateOrderStatusRequest;
use App\Http\Resources\Admin\OrderResource;
use App\Models\Order;
use App\Services\OrderService;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    private const DETAIL_RELATIONS = ['items', 'payments', 'statusHistories.user:id,name', 'notes.user:id,name', 'creator:id,name'];

    public function __construct(private OrderService $orders) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::enum(OrderStatus::class)],
            'payment_status' => ['nullable', Rule::enum(PaymentStatus::class)],
            'channel' => ['nullable', Rule::enum(SalesChannel::class)],
            'source' => ['nullable', Rule::enum(OrderSource::class)],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $orders = Order::query()
            ->withCount('items')
            ->when($filters['q'] ?? null, function (Builder $query, string $term) {
                $like = '%'.addcslashes(trim($term), '%_\\').'%';
                $query->where(fn (Builder $q) => $q
                    ->where('order_number', 'like', $like)
                    ->orWhere('customer_phone', 'like', $like)
                    ->orWhere('customer_name', 'like', $like));
            })
            ->when($filters['status'] ?? null, fn (Builder $q, string $v) => $q->where('status', $v))
            ->when($filters['payment_status'] ?? null, fn (Builder $q, string $v) => $q->where('payment_status', $v))
            ->when($filters['channel'] ?? null, fn (Builder $q, string $v) => $q->where('channel', $v))
            ->when($filters['source'] ?? null, fn (Builder $q, string $v) => $q->where('source', $v))
            ->when($filters['from'] ?? null, fn (Builder $q, string $v) => $q->where('placed_at', '>=', $v.' 00:00:00'))
            ->when($filters['to'] ?? null, fn (Builder $q, string $v) => $q->where('placed_at', '<=', $v.' 23:59:59'))
            ->latest('placed_at')
            ->latest('id')
            ->paginate($filters['per_page'] ?? 25);

        return OrderResource::collection($orders);
    }

    public function show(Order $order): OrderResource
    {
        return new OrderResource($order->load(self::DETAIL_RELATIONS));
    }

    /**
     * Manual / POS sale (Facebook, WhatsApp, Instagram, physical store, other).
     */
    public function storeManual(ManualSaleRequest $request): JsonResponse
    {
        $order = $this->orders->createManualSale($request->validated(), $request->user());

        return (new OrderResource($order->load(self::DETAIL_RELATIONS)))->response()->setStatusCode(201);
    }

    public function updateStatus(UpdateOrderStatusRequest $request, Order $order): OrderResource
    {
        $data = $request->validated();

        $order = $this->orders->transition($order, OrderStatus::from($data['status']), $request->user(), $data);

        return new OrderResource($order->load(self::DETAIL_RELATIONS));
    }

    public function updateShipping(Request $request, Order $order): OrderResource
    {
        $data = $request->validate([
            'shipping_address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'shipping_area' => ['sometimes', 'nullable', 'string', 'max:100'],
            'shipping_city' => ['sometimes', 'nullable', 'string', 'max:100'],
            'courier_name' => ['sometimes', 'nullable', 'string', 'max:50'],
            'tracking_code' => ['sometimes', 'nullable', 'string', 'max:100'],
            'delivery_cost' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999', 'decimal:0,2'],
        ]);

        if (array_key_exists('delivery_cost', $data) && $data['delivery_cost'] !== null) {
            $data['delivery_cost'] = Money::of($data['delivery_cost']);
        }

        $order->update($data);

        return new OrderResource($order->load(self::DETAIL_RELATIONS));
    }

    public function storeNote(Request $request, Order $order): OrderResource
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);

        $order->notes()->create(['body' => $data['body'], 'user_id' => $request->user()->id]);

        return new OrderResource($order->load(self::DETAIL_RELATIONS));
    }

    public function storeReturn(OrderReturnRequest $request, Order $order): OrderResource
    {
        $data = $request->validated();

        $order = $this->orders->processReturn($order, $data['items'], $data['refund'] ?? null, $request->user());

        return new OrderResource($order->load(self::DETAIL_RELATIONS));
    }
}
