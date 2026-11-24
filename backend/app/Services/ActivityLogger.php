<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Coupon;
use App\Models\DeliveryZone;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use BackedEnum;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Throwable;

/**
 * Staff activity log: who changed prices, costs, coupons, expenses, payments, refunds,
 * order status, delivery zones, settings and staff accounts — and from what to what.
 * Only changes made by a logged-in admin are recorded (not customers, seeders or jobs).
 */
class ActivityLogger
{
    /**
     * Watched models and the fields worth recording. `null` = every fillable field.
     *
     * @var array<class-string<Model>, array{label: string, fields: list<string>|null}>
     */
    public const WATCHED = [
        Product::class => ['label' => 'product', 'fields' => ['name', 'status', 'category_id', 'is_featured']],
        ProductVariant::class => ['label' => 'variant', 'fields' => ['sku', 'price', 'compare_at_price', 'raw_material_cost', 'labour_cost', 'packaging_cost', 'other_cost', 'is_active', 'allow_backorder']],
        Coupon::class => ['label' => 'coupon', 'fields' => null],
        Expense::class => ['label' => 'expense', 'fields' => ['expense_category_id', 'title', 'amount', 'expense_date']],
        DeliveryZone::class => ['label' => 'delivery_zone', 'fields' => ['name', 'charge', 'is_active']],
        Order::class => ['label' => 'order', 'fields' => ['status', 'delivery_charge', 'delivery_cost', 'courier_name', 'tracking_code', 'manual_discount']],
        Payment::class => ['label' => 'payment', 'fields' => ['status', 'amount', 'fee', 'transaction_id']],
        User::class => ['label' => 'user', 'fields' => ['name', 'email', 'role', 'is_active']],
    ];

    public static function register(): void
    {
        foreach (array_keys(self::WATCHED) as $class) {
            $class::created(fn (Model $model) => app(self::class)->modelEvent('created', $model));
            $class::updated(fn (Model $model) => app(self::class)->modelEvent('updated', $model));
            $class::deleted(fn (Model $model) => app(self::class)->modelEvent('deleted', $model));
        }
    }

    public function modelEvent(string $event, Model $model): void
    {
        if (! Auth::check()) {
            return;
        }

        $config = self::WATCHED[$model::class];
        $fields = $config['fields'] ?? $model->getFillable();

        $changes = [];
        if ($event === 'updated') {
            foreach (array_intersect(array_keys($model->getChanges()), $fields) as $field) {
                $changes[$field] = ['from' => $this->plain($model->getOriginal($field)), 'to' => $this->plain($model->getAttribute($field))];
            }
            if ($changes === []) {
                return;
            }
        } elseif ($event === 'created') {
            foreach ($fields as $field) {
                if ($model->getAttribute($field) !== null) {
                    $changes[$field] = ['from' => null, 'to' => $this->plain($model->getAttribute($field))];
                }
            }
        }

        $this->record($this->action($event, $model, $config['label']), $config['label'], $model->getKey(), $this->summary($event, $model, $config['label'], $changes), $changes);
    }

    /**
     * @param  array<string, array{from: mixed, to: mixed}>  $changes
     */
    public function record(string $action, string $subjectType, int|string|null $subjectId, string $summary, array $changes = []): void
    {
        try {
            $user = Auth::user();

            ActivityLog::query()->create([
                'user_id' => $user?->getAuthIdentifier(),
                'action' => Str::limit($action, 40, ''),
                'subject_type' => $subjectType,
                'subject_id' => is_numeric($subjectId) ? (int) $subjectId : null,
                'summary' => Str::limit($summary, 250),
                'changes' => $changes ?: null,
                'ip_address' => request()?->ip(),
                'created_at' => now(),
            ]);
        } catch (Throwable $exception) {
            // the log must never break the action being logged
            report($exception);
        }
    }

    /**
     * Settings are saved with plain queries, so the controller hands over before/after.
     *
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     */
    public function settingsChanged(array $before, array $after): void
    {
        $changes = [];
        foreach ($after as $key => $value) {
            if (($before[$key] ?? null) != $value) {
                $changes[$key] = ['from' => $this->plain($before[$key] ?? null), 'to' => $this->plain($value)];
            }
        }

        if ($changes !== []) {
            $this->record('settings.updated', 'settings', null, 'Changed settings: '.implode(', ', array_keys($changes)), $changes);
        }
    }

    private function action(string $event, Model $model, string $label): string
    {
        if ($model instanceof Order && $event === 'updated' && $model->wasChanged('status')) {
            return 'order.status';
        }
        if ($model instanceof Payment) {
            $type = $model->type?->value ?? 'payment';
            if ($event === 'updated' && $model->wasChanged('status')) {
                return "{$type}.".$model->status->value;
            }

            return "{$type}.{$event}";
        }
        if ($model instanceof ProductVariant && $event === 'updated' && $model->wasChanged(['price', 'raw_material_cost', 'labour_cost', 'packaging_cost', 'other_cost'])) {
            return 'variant.price';
        }

        return "{$label}.{$event}";
    }

    /**
     * @param  array<string, array{from: mixed, to: mixed}>  $changes
     */
    private function summary(string $event, Model $model, string $label, array $changes): string
    {
        $name = match (true) {
            $model instanceof Order => $model->order_number,
            $model instanceof Payment => ($model->type?->value === 'refund' ? 'Refund ' : 'Payment ').'৳'.$model->amount.' on order #'.$model->order_id,
            $model instanceof ProductVariant => $model->sku,
            $model instanceof Coupon => $model->code,
            $model instanceof Expense => $model->title.' ৳'.$model->amount,
            default => $model->getAttribute('name') ?? $label.' #'.$model->getKey(),
        };

        if ($event !== 'updated') {
            return ucfirst($event).' '.str_replace('_', ' ', $label).': '.$name;
        }

        $parts = collect($changes)->map(fn (array $change, string $field) => str_replace('_', ' ', $field).' '.$this->text($change['from']).' → '.$this->text($change['to']));

        return $name.': '.$parts->implode('; ');
    }

    private function plain(mixed $value): mixed
    {
        return match (true) {
            $value instanceof BackedEnum => $value->value,
            $value instanceof DateTimeInterface => $value->format('Y-m-d H:i'),
            is_array($value) || is_scalar($value) || $value === null => $value,
            default => (string) $value,
        };
    }

    private function text(mixed $value): string
    {
        return match (true) {
            $value === null || $value === '' => '—',
            is_bool($value) => $value ? 'yes' : 'no',
            is_array($value) => json_encode($value, JSON_UNESCAPED_UNICODE),
            default => (string) $value,
        };
    }
}
