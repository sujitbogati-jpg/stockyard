import "../styles/globals.css";

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

export default MyApp;
// Add these imports at the top (if not already there)
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/router';

// Inside your MyApp component, add this:
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function MyApp({ Component, pageProps }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        setIsAdmin(profile?.role === 'admin');
      }
    };
    checkAdmin();
  }, [router.pathname]);

  // Now in your sidebar/navigation JSX, add:
  return (
    <>
      {/* Your existing layout */}
      <div className="flex">
        {/* Sidebar */}
        <nav className="w-64 bg-gray-100 min-h-screen p-4">
          {/* Your existing navigation links */}
          <Link href="/" className="block py-2 px-4 hover:bg-gray-200 rounded">
            📊 Dashboard
          </Link>
          {/* ... other links ... */}

          {/* Admin Panel link - only show if admin */}
          {isAdmin && (
            <Link 
              href="/dashboard/admin" 
              className="block py-2 px-4 hover:bg-gray-200 rounded mt-4 border-t border-gray-300 pt-4"
            >
              ⚙️ Admin Panel
            </Link>
          )}
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6">
          <Component {...pageProps} />
        </main>
      </div>
    </>
  );
}

export default MyApp;
