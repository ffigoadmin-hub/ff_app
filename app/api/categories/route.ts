import { NextResponse } from 'next/server';
import type { ApiResponse, Category } from '@/types';

export const revalidate = 0;

const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const SUPABASE_KEY = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/product_categories?is_active=eq.true&order=sort_order.asc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    const rows: any[] = await res.json();

    const data = rows.map((c) => ({
      id:              c.id,
      name:            c.name,
      slug:            c.slug,
      description:     c.description ?? null,
      imageUrl:        c.image_url,
      iconUrl:         c.icon ?? c.icon_url ?? null,
      parentId:        null,
      sortOrder:       c.sort_order,
      metaTitle:       null,
      metaDescription: null,
      _count:          { products: 0 },
    }));

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Categories API error:', err);
    return NextResponse.json<ApiResponse<Category[]>>({ data: [], error: 'Failed to load categories' }, { status: 500 });
  }
}
