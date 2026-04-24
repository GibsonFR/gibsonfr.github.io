const SUPABASE_URL = "https://kturlmcgsaitwvqgevnj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0dXJsbWNnc2FpdHd2cWdldm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzUyNDYsImV4cCI6MjA5MjU1MTI0Nn0.exdRK9SQb7E7PkPrvUO0T6LYUj8CbkpvrYyxPD8ipH8";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.supabaseClient = supabaseClient;
