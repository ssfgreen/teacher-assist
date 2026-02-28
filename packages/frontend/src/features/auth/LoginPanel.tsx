import { type FormEvent, useState } from "react";

import { useAuthStore } from "../../stores/authStore";

export default function LoginPanel() {
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("teacher@example.com");
  const [password, setPassword] = useState("password123");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await login(email, password);
    } catch {
      // Error is already stored in auth state.
    }
  };

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-paper-100 bg-white p-6 shadow-sm">
      <h1 className="font-display text-3xl">Teacher Assist</h1>
      <p className="mt-2 text-sm text-ink-800">Sign in to continue.</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded-lg border border-paper-100 px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded-lg border border-paper-100 px-3 py-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          className="w-full rounded-lg bg-accent-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
