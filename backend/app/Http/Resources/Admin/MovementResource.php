<?php

namespace App\Http\Resources\Admin;

use App\Models\InventoryMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin InventoryMovement
 */
class MovementResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'on_hand_delta' => $this->on_hand_delta,
            'reserved_delta' => $this->reserved_delta,
            'on_hand_after' => $this->on_hand_after,
            'reserved_after' => $this->reserved_after,
            'reason' => $this->reason,
            'order' => $this->whenLoaded('order', fn () => $this->order?->only(['id', 'order_number'])),
            'user' => $this->whenLoaded('user', fn () => $this->user?->only(['id', 'name'])),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
