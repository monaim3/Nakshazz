<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Thrown when a variant cannot cover the requested quantity. Rendered as HTTP 409.
 */
class InsufficientStockException extends RuntimeException
{
    /**
     * @param  array<string, list<string>>  $errors  field => messages
     */
    public function __construct(public readonly array $errors)
    {
        parent::__construct('Some items are no longer available in the requested quantity.');
    }

    public static function forItem(int $index, string $productName, int $available): self
    {
        $message = $available > 0
            ? "Only {$available} of {$productName} left."
            : "{$productName} is out of stock.";

        return new self(["items.{$index}.quantity" => [$message]]);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'errors' => $this->errors], 409);
    }
}
