<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\SmsLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Tells the customer about their order by SMS (confirmed, shipped, delivered), when the
 * owner has switched it on in Settings. Every attempt is written to `sms_logs`. Also builds
 * the ready-made WhatsApp text the admin can send with one tap.
 */
class CustomerMessenger
{
    /** @var list<string> */
    public const EVENTS = ['confirmed', 'shipped', 'delivered'];

    public function __construct(private StoreSettings $settings) {}

    public function orderStatusChanged(Order $order, OrderStatus $status): void
    {
        $event = $status->value;

        if (! in_array($event, self::EVENTS, true)
            || ! $this->settings->bool('sms_enabled')
            || ! $this->settings->bool("sms_on_{$event}", $event !== 'delivered')
            || blank($order->customer_phone)) {
            return;
        }

        // one SMS per order per event, even if the status goes back and forth
        if (SmsLog::query()->where('order_id', $order->id)->where('event', $event)->where('status', 'sent')->exists()) {
            return;
        }

        $this->send($order, $event, $this->message($order, $event));
    }

    public function message(Order $order, string $event): string
    {
        $store = (string) $this->settings->get('store_name', config('app.name'));
        $number = $order->order_number;

        return match ($event) {
            'confirmed' => "{$store}: আপনার অর্ডার #{$number} কনফার্ম হয়েছে। মোট ৳{$order->grand_total}। ধন্যবাদ!",
            'shipped' => "{$store}: আপনার অর্ডার #{$number} পাঠানো হয়েছে".($order->courier_name ? " ({$order->courier_name}".($order->tracking_code ? ", ট্র্যাকিং {$order->tracking_code}" : '').')' : '').'। শীঘ্রই পৌঁছে যাবে।',
            'delivered' => "{$store}: অর্ডার #{$number} ডেলিভারি হয়েছে। আমাদের সাথে থাকার জন্য ধন্যবাদ!",
            default => "{$store}: অর্ডার #{$number} আপডেট হয়েছে।",
        };
    }

    /**
     * wa.me link that opens WhatsApp with the customer and the message already typed.
     */
    public function whatsappLink(Order $order, string $event): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $order->customer_phone);
        if ($digits === '') {
            return null;
        }
        if (str_starts_with($digits, '01')) {
            $digits = '88'.$digits;
        }

        return 'https://wa.me/'.$digits.'?text='.rawurlencode($this->message($order, $event));
    }

    private function send(Order $order, string $event, string $message): void
    {
        $driver = (string) config('services.sms.driver', 'log');
        $status = 'sent';
        $response = null;

        try {
            if ($driver === 'http') {
                $url = config('services.sms.url');
                if (blank($url) || blank(config('services.sms.api_key'))) {
                    throw new \RuntimeException('SMS gateway is not set up (SMS_API_URL / SMS_API_KEY).');
                }
                $result = Http::timeout(8)->asForm()->post($url, [
                    'api_key' => config('services.sms.api_key'),
                    'senderid' => config('services.sms.sender_id'),
                    'number' => $order->customer_phone,
                    'message' => $message,
                    'type' => 'text',
                ]);
                $response = Str::limit($result->body(), 250);
                if (! $result->successful()) {
                    $status = 'failed';
                }
            } else {
                Log::info("SMS to {$order->customer_phone}: {$message}");
                $response = 'logged (SMS_DRIVER=log)';
            }
        } catch (Throwable $exception) {
            $status = 'failed';
            $response = Str::limit($exception->getMessage(), 250);
            report($exception);
        }

        SmsLog::query()->create([
            'order_id' => $order->id,
            'phone' => Str::limit((string) $order->customer_phone, 14, ''),
            'event' => $event,
            'message' => $message,
            'status' => $status,
            'gateway' => $driver,
            'response' => $response,
        ]);
    }
}
