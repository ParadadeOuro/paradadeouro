// ─── Shared CSV parsing for catalogue products ───────────────────────────────

export interface CatalogueProduct {
  handle: string;
  title: string;
  type: string;
  vendor: string;
  price: string;
  compareAtPrice: string;
  image: string;
  tags: string;
}

/**
 * Minimal RFC-4180 CSV row parser that respects quoted fields.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const nextCh = csvText[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = "";
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && nextCh === '\n') {
        i++;
      }
      currentRow.push(currentVal.trim());
      rows.push(currentRow);
      currentRow = [];
      currentVal = "";
    } else {
      currentVal += ch;
    }
  }

  if (currentRow.length > 0 || currentVal) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }

  return rows;
}

export function parseCatalogueProducts(text: string): CatalogueProduct[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());

  const iHandle = header.findIndex((h) => h === "");
  const iTitle = header.indexOf("title");
  const iType = header.indexOf("type");
  const iVendor = header.indexOf("vendor");
  const iTags = header.indexOf("tags");
  const iPrice = header.indexOf("variant price");
  const iCompare = header.indexOf("variant compare at price");
  const iImage = header.indexOf("image src");

  const productMap = new Map<string, CatalogueProduct>();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < 5) continue;

    const handle = cols[iHandle >= 0 ? iHandle : 0]?.trim();
    if (!handle) continue;

    const title = cols[iTitle]?.trim();
    const image = cols[iImage]?.trim();
    const price = cols[iPrice]?.trim();
    const compareAtPrice = cols[iCompare]?.trim();

    const parsedPrice = price ? parseFloat(price.replace(",", ".")) : NaN;
    const hasValidPrice = !isNaN(parsedPrice) && parsedPrice > 0;

    if (productMap.has(handle)) {
      const existing = productMap.get(handle)!;
      if (!existing.image && image) {
        existing.image = image;
      }
      if (hasValidPrice) {
        const existingPrice = existing.price ? parseFloat(existing.price.replace(",", ".")) : NaN;
        if (isNaN(existingPrice) || existingPrice <= 0 || parsedPrice < existingPrice) {
          existing.price = price;
          existing.compareAtPrice = compareAtPrice || existing.compareAtPrice;
        }
      }
    } else {
      productMap.set(handle, {
        handle,
        title: title || handle,
        type: cols[iType]?.trim() || "",
        vendor: cols[iVendor]?.trim() || "",
        tags: cols[iTags]?.trim() || "",
        price: hasValidPrice ? price : "",
        compareAtPrice: hasValidPrice ? (compareAtPrice || "") : "",
        image: image || "",
      });
    }
  }

  return Array.from(productMap.values()).filter((p) => p.title && p.image);
}

export function buildCsvUrl(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET;
  const csvPath = process.env.NEXT_PUBLIC_SUPABASE_CSV_PATH;
  if (!supabaseUrl || !bucket || !csvPath) return null;
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = csvPath.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

export function formatPrice(value: string) {
  const num = parseFloat(value.replace(",", "."));
  if (isNaN(num)) return value;
  return `R$ ${num.toFixed(2).replace(".", ",")}`;
}
