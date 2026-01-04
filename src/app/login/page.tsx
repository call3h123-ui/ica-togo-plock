"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function signIn() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setMsg(error.message);
    else setMsg("Kolla mailen för inloggningslänk.");
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1>Logga in</h1>
      <p>Magic link till din e-post.</p>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="din@mail.se"
        style={{ width: "100%", padding: 10, fontSize: 16 }}
      />

      <button onClick={signIn} style={{ marginTop: 12, width: "100%", padding: 12, fontSize: 16 }}>
        Skicka länk
      </button>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
