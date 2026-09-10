"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { identifyUser, resetIdentity, trackSignupCompletedOnce } from "@/lib/heycatch";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
      // HeyCatch: this is where the app first sees a signed-in session
      // client-side (sign-in itself is a Supabase OAuth / magic-link redirect
      // the browser SDK cannot observe).
      if (user) {
        identifyUser(user);
        trackSignupCompletedOnce(user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) identifyUser(session.user);
        else if (event === "SIGNED_OUT") resetIdentity();
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    // Explicit reset before the hard navigation: the SIGNED_OUT listener above
    // may not get a turn before the page unloads.
    resetIdentity();
    window.location.href = "/login";
  }

  return { user, loading, signOut };
}
