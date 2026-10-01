"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { signIn, signUp, type FormState } from "@/app/actions";
import { Button, inputClass } from "./ui";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const action = mode === "login" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const isSignup = mode === "signup";

  return (
    <div>
      <h1 className="font-display text-5xl leading-none tracking-tight">{isSignup ? "Create account" : "Welcome back"}</h1>
      <p className="mt-3 text-muted">
        {isSignup ? "Start keeping track in under a minute." : "Sign in to pick up where you left off."}
      </p>

      <form action={formAction} className="mt-8 space-y-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {isSignup ? (
          <Field label="Name">
            <input name="name" autoComplete="name" required defaultValue={state?.fields?.name} className={inputClass} />
          </Field>
        ) : null}
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state?.fields?.email}
            className={inputClass}
          />
        </Field>
        <Field label="Password" hint={isSignup ? "At least 8 characters." : undefined}>
          <input
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={8}
            className={inputClass}
          />
        </Field>

        {state?.error ? (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSignup ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link
          href={isSignup ? "/login" : next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="font-medium text-accent hover:text-accent-strong"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        {hint ? <span className="text-xs text-faint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
