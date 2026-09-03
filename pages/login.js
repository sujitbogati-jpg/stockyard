import { useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client (uses your environment variables)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Please enter your username.");
      return;
    }

    try {
      // 1. Look up the profile by username to get the internal email
      const { data: profile, error: lookupError } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", username.trim())
        .single();

      if (lookupError || !profile) {
        setError("Username not found.");
        return;
      }

      // 2. Construct the internal email (same format used when creating users)
      const internalEmail = `${username.trim()}@stockyard.local`;

      // 3. Sign in with Supabase Auth using email + password
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: password,
      });

      if (signInError) {
        setError("Invalid username or password.");
        return;
      }

      // 4. Successful login – store session info (same as before)
      localStorage.setItem("stockyard_unlocked", "true");
      localStorage.setItem("stockyard_user_name", username.trim());

      // Optional: also store the user's role if you want (for future use)
      // You can fetch the role from the profile after login
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (userProfile?.role) {
        localStorage.setItem("stockyard_user_role", userProfile.role);
      }

      router.push("/");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#23241F" }}
    >
      <form
        onSubmit={handleSubmit}
        className="rounded-lg p-8 w-full max-w-sm"
        style={{ backgroundColor: "#F6F4EF" }}
      >
        <div
          className="text-2xl font-bold mb-1"
          style={{ fontFamily: "'Oswald', sans-serif" }}
        >
          STOCKYARD
        </div>
        <div className="text-sm mb-6" style={{ color: "#8A8A7E" }}>
          Central Warehouse 1117
        </div>

        <input
          type="text"
          autoFocus
          className="w-full rounded-md border px-3 py-2.5 text-[15px] outline-none mb-3"
          style={{ borderColor: "#D8D5C9" }}
          placeholder="Your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          className="w-full rounded-md border px-3 py-2.5 text-[15px] outline-none mb-3"
          style={{ borderColor: "#D8D5C9" }}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <div className="text-sm mb-3" style={{ color: "#B0563A" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-md py-2.5 font-semibold text-sm"
          style={{ backgroundColor: "#3A5A6D", color: "#FFFFFF" }}
        >
          Enter
        </button>
      </form>
    </div>
  );
}
