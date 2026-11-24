<?php

namespace Tests\Feature\Qa;

use App\Models\ActivityLog;
use App\Models\User;
use Database\Seeders\StoreSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\Group;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Security audit, phase 19 (24 Nov 2026): the admin dashboard's login and sessions, driven the
 * way the real admin site does it (cookie session + CSRF token from the admin's own origin).
 */
#[Group('qa')]
class Phase19AdminSessionTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:3000';

    private const PASSWORD = 'Correct-Horse-42';

    private User $owner;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(StoreSettingSeeder::class);
        config(['sanctum.stateful' => ['localhost:3000'], 'session.driver' => 'database']);
        $this->owner = User::factory()->owner()->create(['email' => 'owner@example.com', 'password' => self::PASSWORD]);
        $this->staff = User::factory()->create(['email' => 'staff@example.com', 'password' => self::PASSWORD]);
    }

    #[Test]
    public function a1_login_gives_a_new_session_id_and_logout_kills_the_old_cookie(): void
    {
        $this->get('/sanctum/csrf-cookie', ['Origin' => self::ORIGIN]);
        $before = $this->sessionCookie();

        $this->spa('post', '/api/v1/admin/login', ['email' => 'staff@example.com', 'password' => self::PASSWORD])->assertOk();
        $after = $this->sessionCookie();
        $this->assertNotSame($before, $after, 'session id changes at login (no session fixation)');

        $this->spa('post', '/api/v1/admin/logout')->assertOk();
        $this->flushHeaders();
        $this->forgetUser();
        // replaying the cookie captured while logged in no longer works
        $this->withUnencryptedCookie(config('session.cookie'), $after)
            ->withHeaders(['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/admin', 'Accept' => 'application/json'])
            ->getJson('/api/v1/admin/me')->assertUnauthorized();
    }

    #[Test]
    public function a2_admin_writes_from_the_browser_need_the_csrf_token(): void
    {
        $this->get('/sanctum/csrf-cookie', ['Origin' => self::ORIGIN]);
        $this->spa('post', '/api/v1/admin/login', ['email' => 'owner@example.com', 'password' => self::PASSWORD])->assertOk();

        // a forged form on another tab: right cookie, no token (Laravel skips this check in the
        // "testing" environment, so leave it for this one request)
        $this->app['env'] = 'local';
        $this->withHeaders(['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/admin', 'Accept' => 'application/json', 'X-XSRF-TOKEN' => 'forged'])
            ->postJson('/api/v1/admin/users', ['name' => 'Evil', 'email' => 'evil@example.com', 'password' => 'Evil-password-1', 'role' => 'owner'])
            ->assertStatus(419);
        $this->app['env'] = 'testing';
        $this->assertDatabaseMissing('users', ['email' => 'evil@example.com']);
    }

    #[Test]
    public function a3_changing_a_staff_password_signs_that_staff_out_everywhere(): void
    {
        // the staff member is signed in on a phone that was then lost
        $this->get('/sanctum/csrf-cookie', ['Origin' => self::ORIGIN]);
        $this->spa('post', '/api/v1/admin/login', ['email' => 'staff@example.com', 'password' => self::PASSWORD, 'remember' => true])->assertOk();
        $this->spa('get', '/api/v1/admin/me')->assertOk();
        $phone = [$this->sessionCookie(), $this->rememberCookie()];

        // the owner changes that staff member's password
        $this->forgetUser();
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$this->staff->id}", ['password' => 'Brand-new-pass-77'])->assertOk();
        $this->forgetUser();

        // the lost phone is signed out — neither the session nor the "keep me signed in" cookie works
        $this->withUnencryptedCookie(config('session.cookie'), $phone[0])
            ->withHeaders(['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/admin', 'Accept' => 'application/json'])
            ->getJson('/api/v1/admin/me')->assertUnauthorized();
        $this->forgetUser();
        if ($phone[1]) {
            $this->withUnencryptedCookie(Auth::guard('web')->getRecallerName(), $phone[1])
                ->withHeaders(['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/admin', 'Accept' => 'application/json'])
                ->getJson('/api/v1/admin/me')->assertUnauthorized();
        }
    }

    #[Test]
    public function a4_an_owner_changing_their_own_password_must_give_the_current_one(): void
    {
        // a stolen, still-open owner session must not be enough to take the account over
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$this->owner->id}", ['password' => 'Taken-over-pass-1'])->assertJsonValidationErrors('current_password');
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$this->owner->id}", ['email' => 'attacker@example.com'])->assertJsonValidationErrors('current_password');
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$this->owner->id}", ['password' => 'New-owner-pass-1', 'current_password' => self::PASSWORD])->assertOk();
    }

    #[Test]
    public function a5_keep_me_signed_in_lasts_30_days_not_years(): void
    {
        $this->get('/sanctum/csrf-cookie', ['Origin' => self::ORIGIN]);
        $response = $this->spa('post', '/api/v1/admin/login', ['email' => 'staff@example.com', 'password' => self::PASSWORD, 'remember' => true])->assertOk();
        $cookie = collect($response->headers->getCookies())->first(fn ($c) => str_starts_with($c->getName(), 'remember_web_'));

        $this->assertNotNull($cookie);
        $this->assertLessThanOrEqual(now()->addDays(31)->getTimestamp(), $cookie->getExpiresTime());
        $this->assertTrue($cookie->isHttpOnly());
    }

    #[Test]
    public function a6_logins_password_changes_and_failed_logins_are_in_the_activity_log_without_secrets(): void
    {
        $this->get('/sanctum/csrf-cookie', ['Origin' => self::ORIGIN]);
        $this->spa('post', '/api/v1/admin/login', ['email' => 'staff@example.com', 'password' => 'wrong-guess-1'])->assertUnprocessable();
        $this->spa('post', '/api/v1/admin/login', ['email' => 'staff@example.com', 'password' => self::PASSWORD])->assertOk();
        $this->forgetUser();
        $this->session = $this->xsrf = $this->remember = null;
        $this->unencryptedCookies = [];
        $this->defaultHeaders = [];
        $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$this->staff->id}", ['password' => 'Brand-new-pass-77'])->assertOk();

        $actions = ActivityLog::query()->pluck('action')->all();
        $this->assertContains('auth.failed', $actions);
        $this->assertContains('auth.login', $actions);
        $this->assertContains('user.password', $actions);
        $all = ActivityLog::query()->get()->toJson();
        foreach (['wrong-guess-1', self::PASSWORD, 'Brand-new-pass-77', '$2y$'] as $secret) {
            $this->assertStringNotContainsString($secret, $all);
        }
    }

    #[Test]
    public function a7_user_lists_and_profile_never_return_password_hashes_or_tokens(): void
    {
        $text = $this->actingAs($this->owner)->getJson('/api/v1/admin/users')->getContent().$this->getJson('/api/v1/admin/me')->getContent();
        foreach (['password', 'remember_token', '$2y$'] as $secret) {
            $this->assertStringNotContainsString($secret, $text);
        }
    }

    private function spa(string $method, string $uri, array $data = []): TestResponse
    {
        $token = $this->xsrf ?? null;

        return $this->withHeaders(array_filter(['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/admin', 'Accept' => 'application/json', 'X-XSRF-TOKEN' => $token]))->json($method, $uri, $data);
    }

    private ?string $xsrf = null;

    private ?string $session = null;

    private ?string $remember = null;

    /**
     * Keep the cookies between requests like a browser does.
     */
    public function json($method, $uri, array $data = [], array $headers = [], $options = 0): TestResponse
    {
        if ($this->session) {
            $this->withUnencryptedCookie(config('session.cookie'), $this->session);
        }
        if ($this->xsrf) {
            $this->withUnencryptedCookie('XSRF-TOKEN', $this->xsrf);
        }
        $response = parent::json($method, $uri, $data, $headers, $options);
        $this->capture($response);

        return $response;
    }

    public function get($uri, array $headers = []): TestResponse
    {
        $response = parent::get($uri, $headers);
        $this->capture($response);

        return $response;
    }

    private function capture(TestResponse $response): void
    {
        foreach ($response->headers->getCookies() as $cookie) {
            match (true) {
                $cookie->getName() === config('session.cookie') => $this->session = $cookie->getValue(),
                $cookie->getName() === 'XSRF-TOKEN' => $this->xsrf = $cookie->getValue(),
                str_starts_with($cookie->getName(), 'remember_web_') => $this->remember = $cookie->getValue(),
                default => null,
            };
        }
    }

    private function sessionCookie(): ?string
    {
        return $this->session;
    }

    private function rememberCookie(): ?string
    {
        return $this->remember;
    }

    private function forgetUser(): void
    {
        app('auth')->forgetGuards();
    }
}
