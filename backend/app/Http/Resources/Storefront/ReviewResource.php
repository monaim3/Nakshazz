<?php

namespace App\Http\Resources\Storefront;

use App\Models\Review;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Review
 */
class ReviewResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'customer_name' => $this->customer_name,
            'rating' => $this->rating,
            'comment' => $this->comment,
            'source' => $this->source,
            'is_verified_purchase' => $this->order_id !== null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
