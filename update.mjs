import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split(/\r?\n/).forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"|"$/g, '').trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);

async function run() {
  // Limpiar y formatear los números (quitando espacios y paréntesis)
  const numbers = [
    '+17174717498',
    '+919004729860',
    '+573058094689',
    '+573214209857',
    '+573006357428',
    '+917303708030'
  ];

  const { error } = await supabase.from('whatsapp_settings').upsert({
    id: true,
    provider: 'twilio',
    bot_phone_number: '+15707554592',
    webhook_url: 'https://shuubonsatzqnhiazrdv.supabase.co/functions/v1/twilio-bot',
    status: 'connected',
    authorized_numbers: numbers
  });
  
  if (error) console.error("Error:", error);
  else console.log("¡Configuración guardada en la base de datos!");
}

run();
