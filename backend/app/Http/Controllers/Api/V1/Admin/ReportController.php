<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\ReportService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Owner-only Sales & Profit reports.
 */
class ReportController extends Controller
{
    public function __construct(private ReportService $reports) {}

    public function summary(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json(['data' => [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            ...$this->reports->summary($from, $to),
        ]]);
    }

    public function channels(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json(['data' => $this->reports->byChannel($from, $to)]);
    }

    public function products(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json(['data' => $this->reports->byProduct($from, $to, $request->integer('limit', 50) ?: 50)]);
    }

    public function monthly(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request, defaultDays: 365, maxDays: 1096);

        return response()->json(['data' => $this->reports->monthly($from, $to)]);
    }

    /**
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function range(Request $request, int $defaultDays = 30, int $maxDays = 1096): array
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $to = CarbonImmutable::parse($data['to'] ?? 'today');
        $from = CarbonImmutable::parse($data['from'] ?? $to->subDays($defaultDays - 1));

        abort_if($from->diffInDays($to) > $maxDays, 422, 'Date range is too long.');

        return [$from, $to];
    }
}
