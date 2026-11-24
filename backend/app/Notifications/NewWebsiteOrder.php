<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Email to the shop team when a customer places an order on the website, so nobody has to
 * keep the admin panel open to notice it. COD orders still need a confirmation call.
 */
class NewWebsiteOrder extends Notification
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
        $money = fn (string $amount): string => '৳'.number_format((float) $amount, 0);

        $mail = (new MailMessage)
            ->subject("New order {$order->order_number} · {$money($order->grand_total)} · {$order->payment_method->label()}")
            ->greeting('New website order')
            ->line("**{$order->customer_name}** · {$order->customer_phone}")
            ->line(trim("{$order->shipping_address}, {$order->shipping_area}, {$order->shipping_city}", ', ').' ('.$order->delivery_zone_name.')');

        foreach ($order->items as $item) {
            $variant = $item->variant_title ? " ({$item->variant_title})" : '';
            $mail->line("{$item->quantity} × {$item->product_name}{$variant} — {$money($item->line_total)}");
        }

        return $mail
            ->line("Delivery {$money($order->delivery_charge)} · **Total {$money($order->grand_total)}** · {$order->payment_method->label()}")
            ->action('Open the order', rtrim(config('store.frontend_url'), '/')."/admin/orders/{$order->id}")
            ->line('Call the customer to confirm before packing.')
            ->salutation('Nakshazz shop');
    }
}
