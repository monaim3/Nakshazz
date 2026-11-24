"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Checkbox, Input, PasswordInput } from "@/components/admin/ui";
import { useLoginMutation } from "@/store/admin/api";
import { ensureCsrfCookie } from "@/lib/admin-api-client";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  remember: z.boolean().optional(),
});

/** Only same-site admin paths are allowed as a post-login destination (no open redirect). */
function safeNext() {
  if (typeof window === "undefined") return "/admin";
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

export default function LoginForm() {
  const router = useRouter();
  const [login, { isLoading }] = useLoginMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { remember: false } });

  async function onSubmit(values) {
    try {
      await ensureCsrfCookie(true);
      await login(values).unwrap();
      router.replace(safeNext());
    } catch (error) {
      if (error?.status === 429) {
        setError("root", { message: "Too many attempts. Please wait a minute and try again." });
      } else {
        setError("root", { message: error?.errors?.email?.[0] || error?.message || "Could not sign in." });
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Input label="Email" type="email" autoComplete="username" autoFocus error={errors.email?.message} {...register("email")} />
      <PasswordInput label="Password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
      <Checkbox label="Keep me signed in on this device" {...register("remember")} />

      {errors.root && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" loading={isLoading} className="w-full" size="lg">
        Sign in
      </Button>
    </form>
  );
}
