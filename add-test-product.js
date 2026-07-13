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

  // Avoid appending multiple times if run twice
  if (csvText.includes('produto-teste-001')) {
    console.log('Test product already exists.');
    return;
  }

  // Create a proper CSV row with 43 columns
  // Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,Option1 Name,Option1 Value,...
  // Variant Price is column 23 (0-indexed). Image Src is column 32.
  
  // Let's just generate a row of commas.
  const headerCount = 43;
  let cols = new Array(headerCount).fill('');
  cols[0] = 'produto-teste-001'; // Handle
  cols[1] = 'Produto de Teste'; // Title
  cols[3] = 'Parada de Ouro'; // Vendor
  cols[5] = 'Outros'; // Type
  cols[6] = 'teste'; // Tags
  cols[7] = 'TRUE'; // Published
  cols[8] = 'Title'; // Option1 Name
  cols[9] = 'Default Title'; // Option1 Value
  cols[23] = '0.01'; // Variant Price
  cols[25] = 'TRUE'; // Variant Requires Shipping
  cols[32] = 'https://picsum.photos/400/400'; // Image Src
  cols[42] = 'active'; // Status
  
  const testRow = cols.map(c => c.includes(',') ? `"${c}"` : c).join(',');
  
  csvText += (csvText.endsWith('\n') ? '' : '\n') + testRow + '\n';
  
  console.log('Uploading modified CSV...');
  
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(CSV_PATH, csvText, {
      upsert: true,
      contentType: 'text/csv'
    });
    
  if (uploadError) {
    console.error('Upload error:', uploadError);
  } else {
    console.log('Successfully added test product to CSV.');
  }
}

run();
