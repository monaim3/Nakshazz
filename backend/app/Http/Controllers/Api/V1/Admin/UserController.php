<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Owner-only staff account management.
 */
class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => User::query()->orderBy('name')->get(['id', 'name', 'email', 'role', 'is_active', 'last_login_at'])]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:150', Rule::unique('users', 'email')],
            'password' => ['required', Password::min(10)->letters()->numbers()],
            'role' => ['required', Rule::enum(UserRole::class)],
        ]);

        $user = User::query()->create([...$data, 'is_active' => true]);

        return response()->json(['data' => $user->only(['id', 'name', 'email', 'role', 'is_active'])], 201);
    }

    public function update(Request $request, User $user, ActivityLogger $log): JsonResponse
    {
        Gate::authorize('update', $user);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'email' => ['sometimes', 'email:rfc', 'max:150', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', Password::min(10)->letters()->numbers()],
            'role' => ['sometimes', Rule::enum(UserRole::class)],
            'is_active' => ['sometimes', 'boolean'],
            // changing your own password or email needs your current password, so an
            // unattended or stolen open session cannot take the account over
            'current_password' => [Rule::requiredIf(fn () => $request->user()->is($user) && ($request->has('password') || ($request->has('email') && $request->input('email') !== $user->email))), 'nullable', 'current_password:web'],
        ]);
        unset($data['current_password']);

        $passwordChanged = isset($data['password']);
        if ($passwordChanged) {
            // the old "keep me signed in" cookies stop working too
            $user->setRememberToken(Str::random(60));
        }

        $user->update($data);

        if ($passwordChanged) {
            $log->record('user.password', 'user', $user->id, "Password changed for {$user->name}");
        }

        return response()->json(['data' => $user->only(['id', 'name', 'email', 'role', 'is_active'])]);
    }
}
