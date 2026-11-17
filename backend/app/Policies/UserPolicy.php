<?php

namespace App\Policies;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class UserPolicy
{
    /**
     * Owners manage accounts, but nobody can lock themselves out or remove the last active owner.
     */
    public function update(User $actor, User $target): Response
    {
        if (! $actor->isOwner()) {
            return Response::deny('Only the owner can manage accounts.');
        }

        $request = request();
        $demoting = $request->has('role') && $request->input('role') !== UserRole::Owner->value;
        $deactivating = $request->has('is_active') && ! $request->boolean('is_active');

        if ($actor->is($target) && ($demoting || $deactivating)) {
            return Response::deny('You cannot remove your own owner access.');
        }

        $isLastOwner = $target->isOwner()
            && User::query()->where('role', UserRole::Owner)->where('is_active', true)->count() <= 1;

        if ($isLastOwner && ($demoting || $deactivating)) {
            return Response::deny('The store must keep at least one active owner.');
        }

        return Response::allow();
    }
}
