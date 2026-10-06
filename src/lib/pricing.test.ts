import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, packOffers, parsePrice, priceInfo } from './pricing.ts';
import type { Product } from '../types';

const product = (fields: Partial<Product>): Product => ({
  uid: 'u1', categoryId: 's', brand: '', name: '', infoLine: '', price: '€ 40.00',
  images: [], imagesMode: [], tech: [], desc: '', pair: '', ...fields,
});

test('lettura dei prezzi nei formati usati nel catalogo', () => {
  assert.equal(parsePrice('€ 35.00'), 35);
  assert.equal(parsePrice('€ 7,50'), 7.5);
  assert.equal(parsePrice('€99,99'), 99.99);
  assert.equal(parsePrice('€ 1.234,50'), 1234.5);
  assert.equal(parsePrice('€ 1.500'), 1500);
  assert.equal(parsePrice('su richiesta'), null);
});

test('formattazione coerente con il prezzo originale', () => {
  assert.equal(formatPrice(31.5, '€ 35.00'), '€ 31.50');
  assert.equal(formatPrice(6.75, '€ 7,50'), '€ 6,75');
  assert.equal(formatPrice(1188, '€ 99.00'), '€ 1,188.00');
});

test('prodotto scontato', () => {
  const info = priceInfo(product({ discount: 20 }));
  assert.deepEqual([info.base, info.final, info.discount, info.label], [40, 32, 20, '€ 32.00']);
  assert.equal(priceInfo(product({})).label, '€ 40.00');
  assert.equal(priceInfo(product({ price: 'su richiesta', discount: 20 })).discount, 0);
});

test('pack: somma dei pezzi, poi sconto del pack (sul prezzo gia\' scontato)', () => {
  const [six, ten] = packOffers(product({ packs: [{ qty: 10, discount: 10 }, { qty: 6, discount: 0 }, { qty: 1, discount: 5 }] }));
  assert.deepEqual(ten, { qty: 10, discount: 10, full: 400, total: 360, perUnit: 36 });
  assert.deepEqual(six, { qty: 6, discount: 0, full: 240, total: 240, perUnit: 40 });
  const [onSale] = packOffers(product({ discount: 20, packs: [{ qty: 10, discount: 10 }] }));
  assert.equal(onSale.total, 288);
});
