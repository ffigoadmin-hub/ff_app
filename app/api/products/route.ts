import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse, PaginatedResponse, Product } from '@/types';

export const revalidate = 0;

const SB  = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const KEY = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

function formatProduct(p: any): Product {
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description ?? null,
    imageUrls: (() => { try { return JSON.parse(p.image_urls); } catch { return p.image_urls ? [p.image_urls] : []; } })(),
    blurDataUrls: (() => { try { return JSON.parse(p.blur_data_urls ?? '[]'); } catch { return []; } })(),
    categoryId:   p.category_id ?? null,
    categoryName: p.category ?? p.category_slug ?? null,
    categorySlug: p.category_slug ?? null,
    brandId: null, brandName: null,
    sku: p.sku, mrp: p.mrp, price: p.price, unit: p.unit,
    tags: (() => { try { return JSON.parse(p.tags ?? '[]'); } catch { return []; } })(),
    isFeatured: p.is_featured, inStock: p.in_stock,
    averageRating: p.average_rating, reviewCount: p.review_count,
    metaTitle: null, metaDescription: null,
  };
}

function dedupe(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((p) => {
    const key = `${p.name.trim().toLowerCase()}||${p.unit.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const categorySlug = searchParams.get('category') ?? '';
    const search   = searchParams.get('search') ?? '';
    const sort     = searchParams.get('sort') ?? 'relevance';
    const featured = searchParams.get('filter') === 'featured';
    const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit    = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10));
    const offset   = (page - 1) * limit;

    // Resolve category slug → id using product_categories table
    let categoryId = '';
    if (categorySlug) {
      const catRes = await fetch(
        `${SB}/rest/v1/product_categories?slug=eq.${encodeURIComponent(categorySlug)}&select=id&limit=1`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: 'no-store' }
      );
      const cats: any[] = await catRes.json();
      categoryId = cats[0]?.id ?? '';
      if (!categoryId) {
        // Fallback: filter by category_slug column directly
        // Don't return empty — let the slug filter below handle it
      }
    }

    const filters: string[] = ['is_active=eq.true', 'is_published=eq.true'];
    if (!search) filters.push('in_stock=eq.true');
    if (featured) filters.push('is_featured=eq.true');
    if (categoryId) {
      filters.push(`category_id=eq.${categoryId}`);
    } else if (categorySlug) {
      filters.push(`category_slug=eq.${encodeURIComponent(categorySlug)}`);
    }
    if (search) filters.push(`name=ilike.*${encodeURIComponent(search)}*`);

    let order = 'sort_order.asc,created_at.desc';
    if (sort === 'price-asc')  order = 'price.asc';
    if (sort === 'price-desc') order = 'price.desc';
    if (sort === 'name-asc')   order = 'name.asc';
    if (sort === 'newest')     order = 'created_at.desc';

    const filterStr  = filters.join('&');
    const fetchLimit = limit * 2;

    const [dataRes, countRes] = await Promise.all([
      fetch(
        `${SB}/rest/v1/products?${filterStr}&order=${order}&limit=${fetchLimit}&offset=${offset}&select=*`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: 'no-store' }
      ),
      fetch(
        `${SB}/rest/v1/products?${filterStr}&select=id`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' }, cache: 'no-store' }
      ),
    ]);

    const rows: any[] = await dataRes.json();
    const range = countRes.headers.get('content-range');
    const total = range ? parseInt(range.split('/')[1] ?? '0', 10) : rows.length;

    if (!Array.isArray(rows)) {
      console.error('Products API unexpected response:', rows);
      throw new Error('Bad response from Supabase');
    }

    const formatted = dedupe(rows.map(formatProduct)).slice(0, limit);

    return NextResponse.json<ApiResponse<PaginatedResponse<Product>>>({
      data: { data: formatted, total, page, limit, hasMore: offset + formatted.length < total },
      error: null,
    });
  } catch (err) {
    console.error('Products API error:', err);
    return NextResponse.json<ApiResponse<PaginatedResponse<Product>>>({
      data: { data: [], total: 0, page: 1, limit: 20, hasMore: false },
      error: 'Failed to load products',
    }, { status: 500 });
  }
}
