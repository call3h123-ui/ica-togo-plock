const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://eeliflczeyflozrokfpf.supabase.co';
const supabaseAdminKey = 'sb_secret_YY4vO-wkQuIm23eDsVIlVw_UiKdltNe';

const supabase = createClient(supabaseUrl, supabaseAdminKey);

async function runMigration() {
  try {
    console.log('Kör migration 010: Seed stores data...\n');
    
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '010_seed_stores.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('SQL:');
    console.log(sql);
    console.log('\n---\n');
    
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
      console.log('❌ RPC not available. Kör SQL manuellt i Supabase Studio:');
      console.log('1. Gå till https://app.supabase.com/project/eeliflczeyflozrokfpf/sql');
      console.log('2. Klistra in SQL från: supabase/migrations/010_seed_stores.sql');
      console.log('3. Kör SQL\n');
      console.log('Error:', error.message);
      return;
    }

    console.log('✅ Migration lyckades!');
    console.log('Butiker (Agunnaryd, Horda) och admin har lagts till.');
  } catch (err) {
    console.error('❌ Fel:', err.message);
  }
}

runMigration();
