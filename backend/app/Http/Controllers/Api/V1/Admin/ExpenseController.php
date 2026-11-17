<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Owner-only. Attachments are stored on the private disk and served through this controller.
 */
class ExpenseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'category_id' => ['nullable', 'integer'],
            'q' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Expense::query()
            ->with(['category:id,name', 'creator:id,name'])
            ->when($filters['from'] ?? null, fn (Builder $q, string $v) => $q->where('expense_date', '>=', $v))
            ->when($filters['to'] ?? null, fn (Builder $q, string $v) => $q->where('expense_date', '<=', $v))
            ->when($filters['category_id'] ?? null, fn (Builder $q, int $v) => $q->where('expense_category_id', $v))
            ->when($filters['q'] ?? null, fn (Builder $q, string $v) => $q->where('title', 'like', '%'.addcslashes($v, '%_\\').'%'));

        $total = (clone $query)->sum('amount');
        $expenses = $query->latest('expense_date')->latest('id')->paginate($filters['per_page'] ?? 25);

        return JsonResource::collection($expenses->through(fn (Expense $expense) => $this->payload($expense)))
            ->additional(['total_amount' => number_format((float) $total, 2, '.', '')])
            ->response();
    }

    public function store(Request $request): JsonResponse
    {
        $expense = new Expense(['created_by' => $request->user()->id]);

        return response()->json(['data' => $this->payload($this->save($request, $expense))], 201);
    }

    public function update(Request $request, Expense $expense): JsonResponse
    {
        return response()->json(['data' => $this->payload($this->save($request, $expense))]);
    }

    public function destroy(Expense $expense): JsonResponse
    {
        if ($expense->attachment_path) {
            Storage::disk('local')->delete($expense->attachment_path);
        }
        $expense->delete();

        return response()->json(['message' => 'Expense deleted.']);
    }

    public function attachment(Expense $expense): StreamedResponse
    {
        abort_if($expense->attachment_path === null || ! Storage::disk('local')->exists($expense->attachment_path), 404);

        return Storage::disk('local')->download($expense->attachment_path, 'expense-'.$expense->id.'.'.pathinfo($expense->attachment_path, PATHINFO_EXTENSION));
    }

    public function categories(): JsonResponse
    {
        return response()->json(['data' => ExpenseCategory::query()->orderBy('name')->get()]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'hint' => ['nullable', 'string', 'max:255'],
        ]);

        $category = ExpenseCategory::query()->create([...$data, 'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(4))]);

        return response()->json(['data' => $category], 201);
    }

    public function updateCategory(Request $request, ExpenseCategory $category): JsonResponse
    {
        $category->update($request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'hint' => ['sometimes', 'nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ]));

        return response()->json(['data' => $category]);
    }

    private function save(Request $request, Expense $expense): Expense
    {
        $required = $expense->exists ? 'sometimes' : 'required';

        $data = $request->validate([
            'expense_category_id' => [$required, 'integer', Rule::exists('expense_categories', 'id')],
            'title' => [$required, 'string', 'max:150'],
            'amount' => [$required, 'numeric', 'min:0.01', 'max:99999999', 'decimal:0,2'],
            'expense_date' => [$required, 'date', 'before_or_equal:today'],
            'description' => ['nullable', 'string', 'max:2000'],
            'attachment' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $expense->fill(Arr::except($data, ['attachment']));

        if ($request->hasFile('attachment')) {
            if ($expense->attachment_path) {
                Storage::disk('local')->delete($expense->attachment_path);
            }
            $expense->attachment_path = $request->file('attachment')->store('expenses', 'local');
        }

        $expense->save();

        return $expense->load(['category:id,name', 'creator:id,name']);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Expense $expense): array
    {
        return [
            'id' => $expense->id,
            'title' => $expense->title,
            'amount' => $expense->amount,
            'expense_date' => $expense->expense_date?->toDateString(),
            'description' => $expense->description,
            'category' => $expense->category?->only(['id', 'name']),
            'has_attachment' => $expense->attachment_path !== null,
            'created_by' => $expense->creator?->only(['id', 'name']),
        ];
    }
}
