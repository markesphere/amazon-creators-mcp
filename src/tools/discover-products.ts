import { z } from 'zod';
import type { Item, SearchItemsResponse } from '../types/creators.js';
import {
  DEFAULT_ITEM_RESOURCES,
  type ToolDeps,
} from './shared.js';

export const DISCOVER_PRODUCTS_TOOL_NAME = 'discover_products';

export const DISCOVER_PRODUCTS_DESCRIPTION =
  'Discover Amazon products for a Juvalytics intervention or product category. This tool is for commerce retrieval, not medical decision-making: callers should determine the intervention from Juvalytics evidence first, then use this tool to find purchasable products. Returns normalized candidates with Amazon-provided affiliate detailPageURL values that already include the configured Associates partner tag.';

const criteriaSchema = z.object({
  intervention: z.string().min(1).describe('Evidence-backed intervention name, e.g. "creatine monohydrate".'),
  productQuery: z.string().min(1).optional().describe('Amazon search query override. Defaults to intervention.'),
  searchIndex: z.string().optional().describe('Amazon search index/category. Defaults to All.'),
  brand: z.string().optional(),
  browseNodeId: z.string().optional(),
  minPrice: z.number().int().optional().describe('Minimum price in smallest currency unit.'),
  maxPrice: z.number().int().optional().describe('Maximum price in smallest currency unit.'),
  minReviewsRating: z.number().min(1).max(5).optional(),
  merchant: z.enum(['All', 'Amazon']).optional(),
  availability: z.enum(['Available', 'IncludeOutOfStock']).optional(),
  sortBy: z
    .enum(['Featured', 'NewestArrivals', 'Price:HighToLow', 'Price:LowToHigh', 'Relevance', 'AvgCustomerReviews'])
    .optional(),
  maxResults: z.number().int().min(1).max(10).default(10),
});

export const discoverProductsShape = criteriaSchema.shape;
export const discoverProductsInput = criteriaSchema;
export type DiscoverProductsInput = z.infer<typeof discoverProductsInput>;

export interface JuvalyticsProductCandidate {
  asin: string;
  title?: string;
  brand?: string;
  features?: string[];
  imageUrl?: string;
  price?: {
    amount?: number;
    currency?: string;
    displayAmount?: string;
  };
  rating?: number;
  reviewCount?: number;
  availability?: string;
  affiliateUrl?: string;
  affiliateUrlSource: 'amazon-detailPageURL' | 'missing';
}

function displayString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined;
}

function primaryListing(item: Item) {
  const listings = item.offersV2?.listings ?? [];
  return listings.find((l) => l.isBuyBoxWinner) ?? listings[0];
}

export function normalizeCandidate(item: Item): JuvalyticsProductCandidate {
  const listing = primaryListing(item);
  const price = listing?.price?.money;
  const features = item.itemInfo?.features?.displayValues?.map(displayString).filter((v): v is string => Boolean(v));

  return {
    asin: item.asin,
    title: displayString(item.itemInfo?.title?.displayValue),
    brand: displayString(item.itemInfo?.byLineInfo?.brand?.displayValue),
    features,
    imageUrl:
      item.images?.primary?.large?.url ??
      item.images?.primary?.medium?.url ??
      item.images?.primary?.small?.url,
    price: price
      ? {
          amount: price.amount,
          currency: price.currency,
          displayAmount: price.displayAmount,
        }
      : undefined,
    rating: item.customerReviews?.starRating?.value,
    reviewCount: item.customerReviews?.count,
    availability: listing?.availability?.message ?? listing?.availability?.type,
    affiliateUrl: item.detailPageURL,
    affiliateUrlSource: item.detailPageURL ? 'amazon-detailPageURL' : 'missing',
  };
}

export function buildDiscoverProductsPayload(
  input: DiscoverProductsInput,
  partnerTag: string,
  marketplace: string,
): Record<string, unknown> {
  return {
    keywords: input.productQuery ?? input.intervention,
    searchIndex: input.searchIndex ?? 'All',
    brand: input.brand,
    browseNodeId: input.browseNodeId,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
    minReviewsRating: input.minReviewsRating,
    merchant: input.merchant,
    availability: input.availability ?? 'Available',
    sortBy: input.sortBy ?? 'Relevance',
    itemCount: input.maxResults,
    resources: DEFAULT_ITEM_RESOURCES,
    partnerTag,
    partnerType: 'Associates',
    marketplace,
  };
}

export async function runDiscoverProducts(deps: ToolDeps, input: DiscoverProductsInput) {
  const payload = buildDiscoverProductsPayload(input, deps.config.partnerTag, deps.config.marketplace);
  const response = await deps.client.call<SearchItemsResponse>('searchItems', payload);
  const candidates = (response.searchResult?.items ?? []).map(normalizeCandidate);

  const structuredContent = {
    intervention: input.intervention,
    productQuery: input.productQuery ?? input.intervention,
    marketplace: deps.config.marketplace,
    totalResultCount: response.searchResult?.totalResultCount,
    searchAffiliateUrl: response.searchResult?.searchURL,
    candidates,
    errors: response.errors ?? [],
    retrievedAt: new Date().toISOString(),
    guidance: {
      evidenceBoundary:
        'Use Juvalytics evidence to choose the intervention and product requirements. Amazon search results are commerce candidates, not evidence of efficacy or safety.',
      referralLink:
        'affiliateUrl is Amazon\'s detailPageURL returned for the configured Associates partnerTag; preserve it unchanged.',
    },
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}
