<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Enums\PaymentRecordStatus;
use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;

/**
 * Small, cheap counts for the admin sidebar badges. The panel asks every minute, so it must
 * stay three COUNT queries. `latest_order_id` lets the panel tell a brand new order apart.
 */
class AlertsController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(['data' => [
            'pending_orders' => Order::query()->where('status', OrderStatus::Pending)->count(),
            'bkash_to_verify' => Payment::query()->where('status', PaymentRecordStatus::Pending)->count(),
            'unread_messages' => ContactMessage::query()->where('is_read', false)->count(),
            'latest_order_id' => (int) Order::query()->max('id'),
        ]]);
    }
}
