import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (router.pathname === "/login") {
      setReady(true);
      return;
    }
    const unlocked = typeof window !== "undefined" && localStorage.getItem("stockyard_unlocked") === "true";
    const hasName = typeof window !== "undefined" && !!localStorage.getItem("stockyard_user_name");
    if (!unlocked || !hasName) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router.pathname]);

  if (!ready) return null;
  return <Component {...pageProps} />;
}
