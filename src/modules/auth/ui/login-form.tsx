'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/modules/shared/ui/button';
import { Input } from '@/modules/shared/ui/input';
import { FormField } from '@/modules/shared/ui/form-field';
import { signIn } from '../auth-client';
import { loginSchema, type LoginInput } from '../login.schema';

// The single admin's sign-in form. Better Auth's client owns the credential exchange and sets the
// httpOnly session cookie itself; this component only wires the form, surfaces the server's error
// message, and redirects on success. The admin layout's server-side `requireAdmin()` check is the
// actual gate — this form is UX, not the security boundary.
export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
    });

    if (error) {
      const message = error.message ?? 'Could not sign in. Check your credentials and try again.';
      setFormError(message);
      toast.error(message);
      return;
    }

    toast.success('Signed in.');
    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {formError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </div>
      )}

      <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            {...register('email')}
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
          />
        )}
      </FormField>

      <FormField label="Password" htmlFor="password" error={errors.password?.message} required>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            {...register('password')}
            type="password"
            autoComplete="current-password"
          />
        )}
      </FormField>

      <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
        Sign in
      </Button>
    </form>
  );
}
