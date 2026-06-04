import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse, Category } from '@/types';

export const revalidate = 0;

const SB  = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const KEY = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Read from product_categories (categories table is empty)
    const catRes = await fetch(
      `${SB}/rest/v1/product_categories?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: 'no-store' }
    );
    const rows: any[] = await catRes.json();
    if (!rows.length)
      return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Category not found' }, { status: 404 });

    const c = rows[0];

    // Count products in this category
    const countRes = await fetch(
      `${SB}/rest/v1/products?category_id=eq.${c.id}&is_active=eq.true&is_published=eq.true&select=id`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' }, cache: 'no-store' }
    );
    const range = countRes.headers.get('content-range');
    const productCount = range ? parseInt(range.split('/')[1] ?? '0', 10) : 0;

    const category: Category & { _count?: { products: number } } = {
      id:              c.id,
      name:            c.name,
      slug:            c.slug,
      description:     c.description ?? null,
      imageUrl:        c.image_url ?? '',
      iconUrl:         c.icon ?? null,
      parentId:        null,
      sortOrder:       c.sort_order,
      metaTitle:       null,
      metaDescription: null,
      _count: { products: productCount },
    };

    return NextResponse.json({ data: category, error: null });
  } catch (err) {
    console.error('Category slug API error:', err);
    return NextResponse.json<ApiResponse<null>>({ data: null, error: 'Failed to fetch category' }, { status: 500 });
  }
}
