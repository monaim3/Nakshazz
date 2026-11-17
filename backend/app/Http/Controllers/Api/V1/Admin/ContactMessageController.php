<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContactMessageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return JsonResource::collection(
            ContactMessage::query()
                ->when($request->boolean('unread'), fn ($q) => $q->where('is_read', false))
                ->latest()
                ->latest('id')
                ->paginate(30)
        )->response();
    }

    public function markRead(ContactMessage $message): JsonResponse
    {
        $message->update(['is_read' => true]);

        return response()->json(['data' => $message]);
    }
}
