<?php

namespace App\Http\Controllers\Api\V1\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\ContactRequest;
use App\Models\ContactMessage;
use App\Support\PhoneNumber;
use Illuminate\Http\JsonResponse;

class ContactController extends Controller
{
    public function __invoke(ContactRequest $request): JsonResponse
    {
        $data = $request->validated();

        ContactMessage::query()->create([
            'name' => strip_tags($data['name']),
            'phone' => PhoneNumber::normalize($data['phone'] ?? null),
            'email' => $data['email'] ?? null,
            'message' => strip_tags($data['message']),
            'ip_address' => $request->ip(),
        ]);

        return response()->json(['message' => 'Thanks for reaching out — we will get back to you soon.'], 201);
    }
}
