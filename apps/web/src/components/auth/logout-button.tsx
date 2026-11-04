'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { redirectToLogin } from '@/lib/csrf';
import { postAuth } from './auth-client';
import { useSession } from './session-provider';

/** Ends the session on the server (and expires the cookie), then returns to the login screen. */
export function LogoutButton() {
  const { authenticated } = useSession();
  const [pending, setPending] = useState(false);
  if (!authenticated) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await postAuth('logout');
        // Even if the call failed the user wants out: the login screen verifies the real state.
        redirectToLogin();
      }}
    >
      <LogOut aria-hidden />
      Sair
    </Button>
  );
}
