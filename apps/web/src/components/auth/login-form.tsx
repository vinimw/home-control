'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { House, LoaderCircle } from 'lucide-react';
import { MIN_PASSWORD_LENGTH } from '@home-control/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { postAuth } from './auth-client';

/** First run: create the password with the one-time code. Afterwards: plain login. */
export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const ids = { code: useId(), password: useId(), confirm: useId(), error: useId() };
  const [setupCode, setSetupCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!configured) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
        return;
      }
      if (password !== confirm) {
        setError('As senhas não conferem.');
        return;
      }
    }

    setPending(true);
    const result = configured
      ? await postAuth('login', { password })
      : await postAuth('setup', { setupCode, password });
    if (result.ok) {
      router.replace('/');
      router.refresh();
      return; // keep the button busy until the navigation finishes
    }
    setPending(false);
    setPassword('');
    setConfirm('');
    setError(result.message);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-center gap-2 text-lg font-semibold">
        <House aria-hidden className="size-6 text-primary" />
        Home Control
      </div>

      <Card>
        <CardHeader>
          <h1 className="leading-none font-semibold tracking-tight">
            {configured ? 'Entrar' : 'Criar a senha'}
          </h1>
          <CardDescription>
            {configured
              ? 'Digite a senha para controlar sua casa.'
              : 'Primeiro acesso. Crie a senha única deste sistema.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {!configured ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.code} className="text-sm font-medium">
                  Código de configuração
                </label>
                <Input
                  id={ids.code}
                  value={setupCode}
                  onChange={(event) => setSetupCode(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="XXXX-XXXX"
                  aria-describedby={`${ids.code}-help`}
                  required
                />
                <p id={`${ids.code}-help`} className="text-sm text-muted-foreground">
                  Aparece no log da API: <code>docker compose logs api</code>.
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.password} className="text-sm font-medium">
                {configured ? 'Senha' : 'Nova senha'}
              </label>
              <Input
                id={ids.password}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={configured ? 'current-password' : 'new-password'}
                aria-describedby={error ? ids.error : undefined}
                required
              />
              {!configured ? (
                <p className="text-sm text-muted-foreground">
                  Pelo menos {MIN_PASSWORD_LENGTH} caracteres. Uma frase longa funciona bem.
                </p>
              ) : null}
            </div>

            {!configured ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.confirm} className="text-sm font-medium">
                  Repita a senha
                </label>
                <Input
                  id={ids.confirm}
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            ) : null}

            {error ? (
              <Alert variant="danger" id={ids.error}>
                <AlertDescription className="text-foreground">{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
              {configured ? 'Entrar' : 'Criar senha e entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
