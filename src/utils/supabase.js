import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bwtpvaujadscpbjnaxfn.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dHB2YXVqYWRzY3Biam5heGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3MjQyOTUsImV4cCI6MjA3NTMwMDI5NX0.k9VWaqHscNPnKqKbaAQ06_ugMULOLMnL7CbQbTV-zR8'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
