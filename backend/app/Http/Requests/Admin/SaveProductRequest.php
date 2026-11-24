<?php

namespace App\Http\Requests\Admin;

use App\Enums\ProductStatus;
use App\Enums\TryOnType;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Product|null $product */
        $product = $this->route('product');
        $isCreate = $product === null;
        $money = ['numeric', 'min:0', 'max:9999999', 'decimal:0,2'];

        return [
            'category_id' => [$isCreate ? 'required' : 'sometimes', 'integer', Rule::exists('categories', 'id')],
            'name' => [$isCreate ? 'required' : 'sometimes', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:170', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'short_description' => ['nullable', 'string', 'max:300'],
            'description' => ['nullable', 'string', 'max:20000'],
            'status' => ['sometimes', Rule::enum(ProductStatus::class)],
            'is_featured' => ['sometimes', 'boolean'],
            'is_made_to_order' => ['sometimes', 'boolean'],
            'preparation_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'seo_title' => ['nullable', 'string', 'max:70'],
            'seo_description' => ['nullable', 'string', 'max:170'],
            'tryon_type' => ['nullable', Rule::enum(TryOnType::class)],
            'tryon_size_mm' => ['nullable', 'integer', 'min:2', 'max:600'],
            'allow_free_price' => ['sometimes', 'boolean'],

            'variants' => [$isCreate ? 'required' : 'sometimes', 'array', 'min:1', 'max:50'],
            'variants.*.id' => ['nullable', 'integer', Rule::exists('product_variants', 'id')->where('product_id', $product?->id ?? 0)],
            'variants.*.sku' => ['required', 'string', 'max:60', 'distinct:ignore_case', 'regex:/^[A-Za-z0-9\-_.]+$/'],
            'variants.*.title' => ['nullable', 'string', 'max:150'],
            'variants.*.options' => ['nullable', 'array', 'max:5'],
            'variants.*.options.*' => ['string', 'max:50'],
            'variants.*.price' => ['required', ...$money],
            'variants.*.compare_at_price' => ['nullable', ...$money],
            'variants.*.raw_material_cost' => ['nullable', ...$money],
            'variants.*.labour_cost' => ['nullable', ...$money],
            'variants.*.packaging_cost' => ['nullable', ...$money],
            'variants.*.other_cost' => ['nullable', ...$money],
            'variants.*.low_stock_threshold' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'variants.*.allow_backorder' => ['nullable', 'boolean'],
            'variants.*.is_active' => ['nullable', 'boolean'],
            'variants.*.sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'variants.*.initial_stock' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ];
    }

    /**
     * SKUs must be unique across all products, ignoring the variant being edited.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function ($validator): void {
            if ($validator->errors()->has('variants.*')) {
                return;
            }

            // a ৳0 price gives the piece away: only when the owner confirms it is meant to be free
            if (! $this->boolean('allow_free_price')) {
                foreach ($this->input('variants', []) as $index => $variant) {
                    if (isset($variant['price']) && is_numeric($variant['price']) && (float) $variant['price'] === 0.0) {
                        $validator->errors()->add("variants.{$index}.price", 'A price of ৳0 gives this piece away. Confirm "Free item" if that is intended.');
                    }
                }
            }

            // two variants with the same options (e.g. two "Red / Small") would show twice in the shop
            $seen = [];
            foreach ($this->input('variants', []) as $index => $variant) {
                $options = collect($variant['options'] ?? [])->mapWithKeys(fn ($value, $name) => [mb_strtolower(trim((string) $name)) => mb_strtolower(trim((string) $value))])->sortKeys()->all();
                $signature = json_encode($options);
                if (isset($seen[$signature])) {
                    $validator->errors()->add("variants.{$index}.options", $options === []
                        ? 'Only one variant can be without options. Give each variant its colour / size.'
                        : 'Another variant already has exactly these options (row '.($seen[$signature] + 1).').');
                }
                $seen[$signature] = $index;
            }

            foreach ($this->input('variants', []) as $index => $variant) {
                $taken = ProductVariant::query()
                    ->where('sku', $variant['sku'] ?? '')
                    ->when(! empty($variant['id']), fn ($q) => $q->whereKeyNot($variant['id']))
                    ->exists();

                if ($taken) {
                    $validator->errors()->add("variants.{$index}.sku", 'This SKU is already used by another product.');
                }
            }
        }];
    }
}
