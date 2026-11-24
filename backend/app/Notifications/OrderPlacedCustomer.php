<?php

namespace App\Notifications;

use App\Models\Order;
use App\Services\StoreSettings;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Confirmation to the customer (only when they typed an email at checkout): the order number
 * and a private link to the order page, so they can find the order again from any device.
 */
class OrderPlacedCustomer extends Notification
{
    use Queueable;

    public function __construct(public Order $order) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('items');
        $settings = app(StoreSettings::class);
        $store = (string) $settings->get('store_name', 'Nakshazz');
        $site = rtrim((string) config('store.frontend_url'), '/');
        $money = fn (string $amount): string => '৳'.number_format((float) $amount, 0);

        $mail = (new MailMessage)
            ->subject("{$store}: order {$order->order_number} received / অর্ডার পেয়েছি")
            ->greeting("ধন্যবাদ, {$order->customer_name}!")
            ->line("আপনার অর্ডার আমরা পেয়েছি। Order number: **{$order->order_number}**")
            ->line('Thank you, we have received your order. Keep this email: the button below opens your order any time, from any device.');

        foreach ($order->items as $item) {
            $variant = $item->variant_title ? " ({$item->variant_title})" : '';
            $mail->line("{$item->quantity} × {$item->product_name}{$variant} — {$money($item->line_total)}");
        }

        $mail->line("Delivery {$money($order->delivery_charge)} · **Total {$money($order->grand_total)}** · {$order->payment_method->label()}")
            ->action('অর্ডার দেখুন / View your order', "{$site}/order/{$order->uuid}")
            ->line("পরে Track Order page-এ order number আর phone number দিয়েও দেখতে পারবেন: {$site}/track-order")
            ->line('আমরা শীঘ্রই ফোন করে অর্ডারটি নিশ্চিত করব। / We will call you shortly to confirm.')
            ->salutation($store);

        $replyTo = $settings->get('email');
        if (filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
            $mail->replyTo($replyTo, $store);
        }

        return $mail;
    }
}
