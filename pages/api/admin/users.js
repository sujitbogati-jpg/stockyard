import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Verify the caller is authenticated and is an admin
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if this user is admin
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // --- Handle different HTTP methods ---
  if (req.method === 'GET') {
    // Fetch all users from auth + profiles
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) return res.status(500).json({ error: authError.message });

    // Fetch all profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, role');

    // Merge
    const merged = users.map(u => ({
      id: u.id,
      email: u.email,
      username: profiles?.find(p => p.id === u.id)?.username || 'N/A',
      full_name: profiles?.find(p => p.id === u.id)?.full_name || 'N/A',
      role: profiles?.find(p => p.id === u.id)?.role || 'staff',
      created_at: u.created_at,
    }));

    return res.status(200).json(merged);
  }

  if (req.method === 'POST') {
    // Create a new user with username, full_name, password, role
    const { username, full_name, password, role } = req.body;

    // Check if username already taken
    const { data: existing } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .single();
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Internal email
    const internalEmail = `${username}@stockyard.local`;

    // Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: internalEmail,
      password: password,
      email_confirm: true,
    });
    if (authError) {
      return res.status(500).json({ error: authError.message });
    }

    // Insert profile
    const { error: profileError2 } = await supabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        username: username,
        full_name: full_name,
        role: role || 'staff',
      });

    if (profileError2) {
      // Rollback: delete the auth user
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(500).json({ error: profileError2.message });
    }

    return res.status(200).json({ success: true, user: authUser.user });
  }

  if (req.method === 'PATCH') {
    // Update user role (admin/staff)
    const { userId, newRole } = req.body;

    // Prevent self-demotion
    if (userId === user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }
    return res.status(200).json({ success: true });
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}
