<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LoginRequest;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Cookie-session login for the admin SPA (Sanctum stateful). No tokens are stored in the browser.
 */
class AuthController extends Controller
{
    /** "Keep me signed in" lasts 30 days (Laravel's default is 400). */
    private const REMEMBER_MINUTES = 60 * 24 * 30;

    public function login(LoginRequest $request, ActivityLogger $log): JsonResponse
    {
        abort_unless($request->hasSession(), 400, 'Login must come from the admin site.');

        $credentials = $request->safe()->only(['email', 'password']) + ['is_active' => true];
        $guard = Auth::guard('web');
        $guard->setRememberDuration(self::REMEMBER_MINUTES);

        if (! $guard->attempt($credentials, $request->boolean('remember'))) {
            // who tried, never with what password
            $log->record('auth.failed', 'user', null, 'Failed sign-in for '.Str::limit((string) $request->input('email'), 120));
            throw ValidationException::withMessages(['email' => ['These credentials do not match an active account.']]);
        }

        $request->session()->regenerate();
        $user = $request->user();
        $user->forceFill(['last_login_at' => now()])->save();
        $log->record('auth.login', 'user', $user->id, "{$user->name} signed in".($request->boolean('remember') ? ' (keep me signed in)' : ''));

        return response()->json(['data' => $this->userPayload($request)]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->userPayload($request)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function userPayload(Request $request): array
    {
        $user = $request->user();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'permissions' => [
                'view_financials' => $user->can('view-financials'),
                'manage_store' => $user->can('manage-store'),
            ],
        ];
    }
}
