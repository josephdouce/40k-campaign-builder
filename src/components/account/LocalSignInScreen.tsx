import { useState } from "react";
import type { FormEvent } from "react";
import { setLocalUser } from "../../store/localMode.ts";

const QUICK = [
  { email: "organiser@local.test", isOrganiser: true, label: "Organiser" },
  { email: "player1@local.test", isOrganiser: false, label: "Player 1" },
  { email: "player2@local.test", isOrganiser: false, label: "Player 2" },
];

/** Local dev mode only: pick who to be. No password. Each tab can be someone different. */
export function LocalSignInScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [isOrganiser, setIsOrganiser] = useState(false);
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+$/.test(email.trim())) {
      setError("Enter an email address.");
      return;
    }
    setLocalUser({ email: email.trim(), isOrganiser });
  };

  return (
    <div className="ac-screen">
      <button className="ac-back" onClick={onBack}>
        ← Rules &amp; factions
      </button>
      <h1 className="ac-brand">
        The Varkesh <span>Reach</span>
      </h1>
      <p className="ac-sub">Local dev mode: no AWS. Campaigns are saved in this browser only.</p>
      <div className="ac-panel">
        <div className="ac-actions">
          {QUICK.map((q) => (
            <button key={q.email} className="btn" type="button" onClick={() => setLocalUser(q)}>
              {q.label}
            </button>
          ))}
        </div>
        <form className="ac-form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="ls-email">Or sign in as</label>
            <input
              id="ls-email"
              type="email"
              value={email}
              className={error ? "ac-bad" : undefined}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <label className="row">
            <input type="checkbox" checked={isOrganiser} onChange={(e) => setIsOrganiser(e.target.checked)} /> Organiser
          </label>
          {error ? (
            <p className="ac-err" role="alert">
              {error}
            </p>
          ) : null}
          <div className="ac-actions">
            <button className="btn primary" type="submit">
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
