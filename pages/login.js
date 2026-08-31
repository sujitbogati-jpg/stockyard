import { useState } from "react";
import { useRouter } from "next/router";

export default function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = (e) => {
    e.preventDefault();
    const expected = process.env.NEXT_PUBLIC_APP_PASSWORD;
    if (!expected) {
      setError("App password isn't configured yet — set NEXT_PUBLIC_APP_PASSWORD in your hosting settings.");
      return;
    }
    if (!name.trim()) {
      setError("Enter your name — it's attached to what you post, so the team knows who did what.");
      return;
    }
    if (password === expected) {
      localStorage.setItem("stockyard_unlocked", "true");
      localStorage.setItem("stockyard_user_name", name.trim());
      router.push("/");
    } else {
      setError("Wrong password.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#23241F" }}>
      <form
        onSubmit={handleSubmit}
        className="rounded-lg p-8 w-full max-w-sm"
        style={{ backgroundColor: "#F6F4EF" }}
      >
        <div className="text-2xl font-bold mb-1" style={{ fontFamily: "'Oswald', sans-serif" }}>STOCKYARD</div>
        <div className="text-sm mb-6" style={{ color: "#8A8A7E" }}>Central Warehouse 1117</div>
        <input
          type="text"
          autoFocus
          className="w-full rounded-md border px-3 py-2.5 text-[15px] outline-none mb-3"
          style={{ borderColor: "#D8D5C9" }}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="password"
          className="w-full rounded-md border px-3 py-2.5 text-[15px] outline-none mb-3"
          style={{ borderColor: "#D8D5C9" }}
          placeholder="Team password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="text-sm mb-3" style={{ color: "#B0563A" }}>{error}</div>}
        <button type="submit" className="w-full rounded-md py-2.5 font-semibold text-sm" style={{ backgroundColor: "#3A5A6D", color: "#FFFFFF" }}>
          Enter
        </button>
      </form>
    </div>
  );
}
