"use client";

import { authClient } from "@epilove/auth/client";
import { parseSchoolEmail } from "@epilove/core";
import { Button, OtpInput, TextField } from "@epilove/ui";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

/** Staff sign-in: school address and one-time code, or a passkey. No sign-up here. */
export function StaffSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSchoolEmail(email);
    if (!parsed.ok) {
      setError("Adresse d'école requise.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: parsed.canonicalEmail,
      type: "sign-in",
    });
    setPending(false);
    if (sendError) {
      setError("Impossible d'envoyer le code. Réessaie dans un moment.");
      return;
    }
    setSentTo(parsed.canonicalEmail);
  }

  async function verify(value: string) {
    if (!sentTo || value.length !== 6 || pending) {
      return;
    }
    setPending(true);
    const { error: signInError } = await authClient.signIn.emailOtp({ email: sentTo, otp: value });
    if (signInError) {
      setPending(false);
      setCode("");
      setError("Code incorrect, expiré, ou compte sans accès à la modération.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function passkey() {
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setError("La passkey n'a pas fonctionné.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (sentTo) {
    return (
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
      >
        <p className="text-paper/70">Code envoyé à {sentTo}.</p>
        <OtpInput
          label="Code à 6 chiffres"
          value={code}
          onChange={setCode}
          onComplete={(value) => void verify(value)}
          error={error}
          disabled={pending}
        />
        <Button type="submit" size="lg" block loading={pending} disabled={code.length !== 6}>
          Valider
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={(event) => void send(event)} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email d'école"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
        />
        <Button type="submit" size="lg" block loading={pending}>
          Recevoir un code
        </Button>
      </form>
      <Button
        variant="outline"
        size="lg"
        block
        onClick={() => void passkey()}
        leadingIcon={<Fingerprint className="size-5" aria-hidden="true" />}
      >
        Se connecter avec une passkey
      </Button>
    </div>
  );
}
