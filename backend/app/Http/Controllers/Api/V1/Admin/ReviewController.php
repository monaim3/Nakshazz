<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Models\Review;
use App\Services\StorefrontRevalidator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ReviewController extends Controller
{
    public function __construct(private StorefrontRevalidator $revalidator) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate(['status' => ['nullable', Rule::enum(ReviewStatus::class)]]);

        return JsonResource::collection(
            Review::query()
                ->with('product:id,name,slug')
                // same text already posted in another review: likely a copy or a fake
                ->select('reviews.*')
                ->selectRaw('EXISTS (SELECT 1 FROM reviews AS other WHERE other.id <> reviews.id AND LOWER(TRIM(other.comment)) = LOWER(TRIM(reviews.comment))) AS possible_duplicate')
                ->when($filters['status'] ?? null, fn (Builder $q, string $v) => $q->where('status', $v))
                ->latest()
                ->latest('id')
                ->paginate(30)
        )->response();
    }

    /**
     * Import an existing review, e.g. from Facebook or Instagram. Approved immediately.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['nullable', 'integer', Rule::exists('products', 'id')],
            'customer_name' => ['required', 'string', 'max:100'],
            'rating' => ['required', 'integer', 'between:1,5'],
            'comment' => ['required', 'string', 'max:1000'],
            'source' => ['required', Rule::in(['website', 'facebook', 'instagram', 'whatsapp'])],
            'is_featured' => ['sometimes', 'boolean'],
            'confirm_duplicate' => ['sometimes', 'boolean'],
        ], attributes: ['comment' => 'review']);

        // the same review imported twice (my call 13): ask first
        $copy = Review::query()->whereRaw('LOWER(TRIM(comment)) = ?', [mb_strtolower(trim($data['comment']))])->exists();
        if ($copy && ! $request->boolean('confirm_duplicate')) {
            throw ValidationException::withMessages(['duplicate' => ['A review with exactly this text is already saved. Save anyway?']]);
        }
        unset($data['confirm_duplicate']);

        $review = Review::query()->create([...$data, 'status' => ReviewStatus::Approved]);
        $this->revalidator->revalidate(['home', 'products']);

        return response()->json(['data' => $review], 201);
    }

    public function update(Request $request, Review $review): JsonResponse
    {
        $review->update($request->validate([
            'status' => ['sometimes', Rule::enum(ReviewStatus::class)],
            'is_featured' => ['sometimes', 'boolean'],
        ]));

        $this->revalidator->revalidate(['home', 'products']);

        return response()->json(['data' => $review]);
    }

    public function destroy(Review $review): JsonResponse
    {
        $review->delete();
        $this->revalidator->revalidate(['home', 'products']);

        return response()->json(['message' => 'Review deleted.']);
    }
}
