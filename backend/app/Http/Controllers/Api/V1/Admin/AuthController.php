<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LoginRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

/**
 * Cookie-session login for the admin SPA (Sanctum stateful). No tokens are stored in the browser.
 */
class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        abort_unless($request->hasSession(), 400, 'Login must come from the admin site.');

        $credentials = $request->safe()->only(['email', 'password']) + ['is_active' => true];

        if (! Auth::guard('web')->attempt($credentials, $request->boolean('remember'))) {
            throw ValidationException::withMessages(['email' => ['These credentials do not match an active account.']]);
        }

        $request->session()->regenerate();
        $user = $request->user();
        $user->forceFill(['last_login_at' => now()])->save();

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
