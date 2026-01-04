const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://eeliflczeyflozrokfpf.supabase.co';
const supabaseAdminKey = 'sb_secret_YY4vO-wkQuIm23eDsVIlVw_UiKdltNe';

const supabase = createClient(supabaseUrl, supabaseAdminKey);

async function runMigration() {
  try {
    console.log('Kör migrationen för att lägga till weight och brand kolumner...');
    
    // Använd rpc_exec_sql om det finns, annars försök med raw client
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE products ADD COLUMN IF NOT EXISTS weight text;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
      `
    });

    if (error) {
      // Om RPC inte finns, försök ett annat sätt
      console.log('RPC not available, trying alternative method...');
      console.log('Error:', error.message);
      console.log('\nKöra SQL i Supabase Studio istället:');
      console.log('1. Gå till https://app.supabase.com');
      console.log('2. SQL Editor');
      console.log('3. Klistra in:');
      console.log('ALTER TABLE products ADD COLUMN IF NOT EXISTS weight text;');
      console.log('ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;');
      return;
    }

    console.log('✓ Migration lyckades!');
    console.log('Kolumner weight och brand har lagts till.');
  } catch (err) {
    console.error('Fel:', err);
  }
}

runMigration();
