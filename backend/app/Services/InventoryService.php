<?php

namespace App\Services;

use App\Enums\MovementType;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use LogicException;

/**
 * The single place where stock changes. Every change writes an InventoryMovement row.
 *
 * Callers must pass variants loaded through lockVariants() inside a DB transaction,
 * so concurrent orders cannot oversell.
 */
class InventoryService
{
    /**
     * Load and row-lock variants. Locks are taken in ascending id order to avoid deadlocks.
     *
     * @param  iterable<int>  $variantIds
     * @return Collection<int, ProductVariant> keyed by id
     */
    public function lockVariants(iterable $variantIds): Collection
    {
        $this->assertInTransaction();

        $ids = collect($variantIds)->map(fn ($id) => (int) $id)->unique()->sort()->values();

        return ProductVariant::query()
            ->with('product')
            ->whereIn('id', $ids)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');
    }

    /**
     * Hold stock for an order that has not shipped yet.
     */
    public function reserve(ProductVariant $variant, int $quantity, OrderItem $item): void
    {
        $this->assertCanFulfil($variant, $quantity);

        $this->apply($variant, MovementType::Reserve, 0, $quantity, item: $item);
    }

    /**
     * Give back stock held for an order that was cancelled before shipping.
     */
    public function release(ProductVariant $variant, int $quantity, OrderItem $item, ?User $user = null): void
    {
        $this->apply($variant, MovementType::Release, 0, -$quantity, item: $item, user: $user);
    }

    /**
     * Previously reserved stock physically leaves the shop (order shipped / handed over).
     */
    public function sellReserved(ProductVariant $variant, int $quantity, OrderItem $item, ?User $user = null): void
    {
        $this->apply($variant, MovementType::Sale, -$quantity, -$quantity, item: $item, user: $user);
    }

    /**
     * Sale handed over immediately (POS / walk-in) with no reservation step.
     */
    public function sellDirect(ProductVariant $variant, int $quantity, OrderItem $item, ?User $user = null): void
    {
        $this->assertCanFulfil($variant, $quantity);

        $this->apply($variant, MovementType::Sale, -$quantity, 0, item: $item, user: $user);
    }

    /**
     * Returned items. Sellable units go back on hand; damaged units are only logged.
     */
    public function receiveReturn(ProductVariant $variant, int $sellableQuantity, int $damagedQuantity, OrderItem $item, ?User $user = null): void
    {
        if ($sellableQuantity > 0) {
            $this->apply($variant, MovementType::Return, $sellableQuantity, 0, item: $item, user: $user);
        }

        if ($damagedQuantity > 0) {
            $this->apply($variant, MovementType::ReturnDamaged, 0, 0, item: $item, user: $user, reason: "{$damagedQuantity} unit(s) returned damaged");
        }
    }

    /**
     * Manual stock change from the admin panel: new batch, recount, breakage, etc.
     */
    public function adjust(ProductVariant $variant, MovementType $type, int $quantity, string $reason, User $user): InventoryMovement
    {
        if ($quantity <= 0) {
            throw new InvalidArgumentException('Quantity must be positive.');
        }

        return match ($type) {
            MovementType::Purchase, MovementType::AdjustmentIn => $this->apply($variant, $type, $quantity, 0, user: $user, reason: $reason),
            MovementType::AdjustmentOut => $this->adjustOut($variant, $quantity, $reason, $user),
            default => throw new InvalidArgumentException("{$type->value} is not a manual adjustment type."),
        };
    }

    private function adjustOut(ProductVariant $variant, int $quantity, string $reason, User $user): InventoryMovement
    {
        if (! $variant->allow_backorder && $variant->availableStock() < $quantity) {
            throw new InvalidArgumentException("Cannot remove {$quantity}: only {$variant->availableStock()} unreserved in stock.");
        }

        return $this->apply($variant, MovementType::AdjustmentOut, -$quantity, 0, user: $user, reason: $reason);
    }

    private function assertCanFulfil(ProductVariant $variant, int $quantity): void
    {
        if (! $variant->canFulfil($quantity)) {
            throw new LogicException("Variant {$variant->sku} cannot fulfil {$quantity}; check availability before calling.");
        }
    }

    private function apply(
        ProductVariant $variant,
        MovementType $type,
        int $onHandDelta,
        int $reservedDelta,
        ?OrderItem $item = null,
        ?User $user = null,
        ?string $reason = null,
    ): InventoryMovement {
        $this->assertInTransaction();

        $variant->stock_on_hand += $onHandDelta;
        $variant->stock_reserved = max(0, $variant->stock_reserved + $reservedDelta);
        $variant->save();

        return InventoryMovement::query()->create([
            'variant_id' => $variant->id,
            'type' => $type,
            'on_hand_delta' => $onHandDelta,
            'reserved_delta' => $reservedDelta,
            'on_hand_after' => $variant->stock_on_hand,
            'reserved_after' => $variant->stock_reserved,
            'order_id' => $item?->order_id,
            'order_item_id' => $item?->id,
            'reason' => $reason,
            'user_id' => $user?->id,
        ]);
    }

    private function assertInTransaction(): void
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('Stock changes must run inside a database transaction.');
        }
    }
}
