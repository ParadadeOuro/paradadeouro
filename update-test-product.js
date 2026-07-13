const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://pknolfzgkqrohiwrszga.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbm9sZnpna3Fyb2hpd3JzemdhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjg3MDU0NiwiZXhwIjoyMDk4NDQ2NTQ2fQ.1VzDPlWVR9YK_HPGN6T2tvIUUFN_LmrPaYICS-0F-lI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BUCKET = 'CSV File';
const CSV_PATH = 'produtos parada de ouro (1).csv';

async function run() {
  console.log('Downloading CSV...');
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(CSV_PATH);

  if (downloadError) {
    console.error('Download error:', downloadError);
    return;
  }

  let csvText = await fileData.text();
  console.log('Downloaded. Size:', csvText.length);

  // We find the existing test row and replace the 0.01 with 1.00
  // Or we can just rebuild it. Let's filter out the old test row and append a new one.
  const lines = csvText.split('\n');
  const filteredLines = lines.filter(line => !line.startsWith('"produto-teste-001"') && !line.startsWith('produto-teste-001'));
  
  const headerCount = 43;
  let cols = new Array(headerCount).fill('');
  cols[0] = 'produto-teste-001'; 
  cols[1] = 'Produto de Teste'; 
  cols[3] = 'Parada de Ouro'; 
  cols[5] = 'Outros'; 
  cols[6] = 'teste'; 
  cols[7] = 'TRUE'; 
  cols[8] = 'Title'; 
  cols[9] = 'Default Title'; 
  cols[23] = '1.00'; // CHANGED TO 1.00
  cols[25] = 'TRUE'; 
  cols[32] = 'https://picsum.photos/400/400'; 
  cols[42] = 'active'; 
  
  const testRow = cols.map(c => c.includes(',') ? `"${c}"` : c).join(',');
  filteredLines.push(testRow);
  
  const newCsvText = filteredLines.join('\n');
  
  console.log('Uploading modified CSV...');
  
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(CSV_PATH, newCsvText, {
      upsert: true,
      contentType: 'text/csv'
    });
    
  if (uploadError) {
    console.error('Upload error:', uploadError);
  } else {
    console.log('Successfully updated test product to 1.00 in CSV.');
  }
}

run();
