'use client';

import { useId, useState, type FormEvent } from 'react';
import { MIN_PASSWORD_LENGTH } from '@home-control/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { postAuth } from './auth-client';
import { useSession } from './session-provider';

export function ChangePasswordForm() {
  const { authenticated } = useSession();
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<{
    kind: 'idle' | 'busy' | 'done' | 'error';
    message?: string;
  }>({ kind: 'idle' });
  if (!authenticated) {
    return (
      <p className="text-sm text-muted-foreground">
        O login está desativado neste ambiente (modo de desenvolvimento).
      </p>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (next.length < MIN_PASSWORD_LENGTH) {
      setState({
        kind: 'error',
        message: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      });
      return;
    }
    if (next !== confirm) {
      setState({ kind: 'error', message: 'As senhas novas não conferem.' });
      return;
    }
    setState({ kind: 'busy' });
    const result = await postAuth('password', { currentPassword: current, newPassword: next });
    setCurrent('');
    setNext('');
    setConfirm('');
    setState(
      result.ok
        ? {
            kind: 'done',
            message: 'Senha alterada. Os outros aparelhos precisarão entrar de novo.',
          }
        : { kind: 'error', message: result.message },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.current} className="text-sm font-medium">
          Senha atual
        </label>
        <Input
          id={ids.current}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.next} className="text-sm font-medium">
          Nova senha
        </label>
        <Input
          id={ids.next}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.confirm} className="text-sm font-medium">
          Repita a nova senha
        </label>
        <Input
          id={ids.confirm}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </div>
      {state.kind === 'error' || state.kind === 'done' ? (
        <Alert variant={state.kind === 'error' ? 'danger' : 'info'}>
          <AlertDescription className="text-foreground">{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={state.kind === 'busy'} className="self-start">
        Alterar senha
      </Button>
    </form>
  );
}
