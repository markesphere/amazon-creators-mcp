import { describe, expect, it } from 'vitest';
import {
  buildDiscoverProductsPayload,
  normalizeCandidate,
} from '../src/tools/discover-products.js';

describe('discover_products', () => {
  it('builds an Associates SearchItems payload from Juvalytics criteria', () => {
    const payload = buildDiscoverProductsPayload(
      {
        intervention: 'creatine monohydrate',
        productQuery: 'creatine monohydrate powder',
        minReviewsRating: 4,
        maxResults: 5,
      },
      'juvalytics-20',
      'www.amazon.com',
    );

    expect(payload).toMatchObject({
      keywords: 'creatine monohydrate powder',
      searchIndex: 'All',
      minReviewsRating: 4,
      itemCount: 5,
      availability: 'Available',
      sortBy: 'Relevance',
      partnerTag: 'juvalytics-20',
      partnerType: 'Associates',
      marketplace: 'www.amazon.com',
    });
  });

  it('preserves Amazon detailPageURL as the referral link', () => {
    const candidate = normalizeCandidate({
      asin: 'B012345678',
      detailPageURL: 'https://www.amazon.com/dp/B012345678?tag=juvalytics-20&linkCode=osi',
      itemInfo: {
        title: { displayValue: 'Creatine Monohydrate' },
        byLineInfo: { brand: { displayValue: 'Example' } },
      },
      customerReviews: { starRating: { value: 4.7 }, count: 1234 },
      offersV2: {
        listings: [{
          isBuyBoxWinner: true,
          price: { money: { amount: 24.99, currency: 'USD', displayAmount: '$24.99' } },
        }],
      },
    });

    expect(candidate.affiliateUrl).toContain('tag=juvalytics-20');
    expect(candidate.affiliateUrlSource).toBe('amazon-detailPageURL');
    expect(candidate.price?.displayAmount).toBe('$24.99');
  });
});
