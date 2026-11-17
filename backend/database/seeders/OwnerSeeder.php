<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class OwnerSeeder extends Seeder
{
    /**
     * Create the first owner account from SEED_OWNER_* env values.
     * Without a password in env a random one is generated and printed once.
     */
    public function run(): void
    {
        $email = config('store.seed_owner.email');

        if (User::query()->where('email', $email)->exists()) {
            return;
        }

        $configuredPassword = config('store.seed_owner.password');
        $password = $configuredPassword ?: Str::password(16);

        User::query()->create([
            'name' => config('store.seed_owner.name'),
            'email' => $email,
            'password' => $password,
            'role' => UserRole::Owner,
            'is_active' => true,
        ]);

        if (! $configuredPassword) {
            $this->command?->warn("Owner created: {$email} / {$password} — change this password after first login.");
        }
    }
}
