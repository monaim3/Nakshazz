<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Services\ActivityLogger;
use App\Services\OperationsService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Owner-only: daily closing, money still owed, stock value and restock suggestions.
 */
class OperationsController extends Controller
{
    public function __construct(private OperationsService $operations) {}

    public function closing(Request $request): JsonResponse
    {
        $data = $request->validate(['date' => ['nullable', 'date', 'before_or_equal:today']]);
        $date = CarbonImmutable::parse($data['date'] ?? 'today');

        return response()->json(['data' => [
            ...$this->operations->dailyClosing($date),
            'receivables' => $this->operations->receivables(),
        ]]);
    }

    public function saveClosing(Request $request, ActivityLogger $log): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date', 'before_or_equal:today'],
            'method' => ['required', Rule::enum(PaymentMethod::class)],
            'counted' => ['required', 'numeric', 'min:-9999999', 'max:9999999', 'decimal:0,2'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $date = CarbonImmutable::parse($data['date']);
        $closing = $this->operations->saveClosing($date, PaymentMethod::from($data['method']), (string) $data['counted'], $data['note'] ?? null, $request->user()->id);

        $log->record('closing.saved', 'cash_closing', $closing->id, "Closed {$closing->method->label()} for {$date->toDateString()}: expected ৳{$closing->expected}, counted ৳{$closing->counted}, difference ৳{$closing->difference}");

        return response()->json(['data' => $this->operations->dailyClosing($date)]);
    }

    public function restock(): JsonResponse
    {
        return response()->json(['data' => [
            'items' => $this->operations->reorderSuggestions(),
            'stock_value' => $this->operations->stockValue(),
        ]]);
    }
}
