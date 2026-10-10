import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, serializeCatalog, indexCatalog, searchCatalog, macroFileName, isBlankHtml, slugify, keyFacts, productFromParam } from './catalog.ts';

const config = {
  title: "SICILIA D'ASSAPURARI",
  macroCategories: [
    { id: 'cat-vini', name: 'Vini', color: '#4ade80', file: 'vini.json', bgImage: '', heroImage: '', heroTag: '', heroTitle: '', heroDesc: '' },
  ],
};
const vini = {
  subcategories: [{ id: 'cat-0', name: "ROSSI DELL'ETNA", color: '#facc15' }],
  products: [
    {
      categoryId: 'cat-0', brand: 'TRAVAGLIANTI', name: 'ETNA ROSÉ', price: '€ 35.00',
      images: ['data:image/webp;base64,AAAA'], tech: [{ k: 'UVAGGIO', v: 'Nerello Mascalese' }],
      desc: '<p>x</p>', pair: '', infoLine: '', imagesMode: ['full'], extraField: 42,
    },
    { categoryId: 'cat-0', brand: 'TRAVAGLIANTI', name: 'ETNA ROSÉ', price: '€ 30', images: [], tech: [], desc: '', pair: '' },
  ],
};

test('serializzazione: i JSON salvati mantengono la struttura originale', () => {
  const files = serializeCatalog(buildCatalog(config, [vini]));
  assert.deepEqual(JSON.parse(files.get('config.json')!), config);
  const saved = JSON.parse(files.get('vini.json')!);
  assert.deepEqual(saved.subcategories, vini.subcategories);
  const { id, ...rest } = saved.products[0];
  assert.match(id, /^[a-z0-9]+$/); // unica aggiunta: il codice prodotto
  assert.deepEqual(rest, vini.products[0]); // chiavi sconosciute preservate, nessun uid
  assert.equal(saved.products[1].infoLine, '');
});

test('tagline e numero WhatsApp: salvati solo se impostati', () => {
  const catalog = buildCatalog({ ...config, tagline: 'Eccellenze siciliane', whatsapp: '+39 333 1234567' }, [vini]);
  const saved = JSON.parse(serializeCatalog(catalog).get('config.json')!);
  assert.equal(saved.tagline, 'Eccellenze siciliane');
  assert.equal(saved.whatsapp, '+39 333 1234567');
  assert.deepEqual(Object.keys(JSON.parse(serializeCatalog(buildCatalog(config, [vini])).get('config.json')!)), ['title', 'macroCategories']);
});

test('la risposta di /api/catalog (dati incorporati) produce lo stesso catalogo', () => {
  const embedded = { ...config, macroCategories: [{ ...config.macroCategories[0], ...vini }] };
  const a = serializeCatalog(buildCatalog(embedded));
  const b = serializeCatalog(buildCatalog(config, [vini]));
  assert.deepEqual([...a], [...b]);
});

test('slug univoci e ricerca senza accenti, multi-parola, anche nella scheda tecnica', () => {
  const catalog = buildCatalog(config, [vini]);
  const index = indexCatalog(catalog);
  assert.deepEqual([...index.byLegacySlug.keys()], ['travaglianti-etna-rose', 'travaglianti-etna-rose-2']);
  assert.equal(index.macroSlug.get('cat-vini'), 'vini');
  assert.equal(searchCatalog(index, 'etna rose')[0].items.length, 2);
  assert.equal(searchCatalog(index, 'nerello')[0].items.length, 1);
  assert.equal(searchCatalog(index, 'rose bianco').length, 0);
  assert.equal(slugify("VINI ROSè"), 'vini-rose');
});

test('codice prodotto: stabile, univoco e salvato; i link restano validi dopo una rinomina', () => {
  const [a, b] = buildCatalog(config, [vini]).macros[0].products;
  assert.deepEqual([a.id, b.id], buildCatalog(config, [vini]).macros[0].products.map((p) => p.id)); // uguale a ogni caricamento
  assert.notEqual(a.id, b.id); // stesso brand e nome, codici diversi

  // rinomina in admin + salvataggio: il codice resta quello calcolato prima della rinomina
  const catalog = buildCatalog(config, [vini]);
  const before = indexCatalog(catalog).productSlug.get(catalog.macros[0].products[0].uid)!;
  assert.equal(before, `etna-rose-${a.id}`);
  const renamed = { ...catalog, macros: [{ ...catalog.macros[0], products: [{ ...catalog.macros[0].products[0], name: 'ETNA ROSATO' }, catalog.macros[0].products[1]] }] };
  const reloaded = buildCatalog(config, [JSON.parse(serializeCatalog(renamed).get('vini.json')!)]);
  const index = indexCatalog(reloaded);
  assert.equal(reloaded.macros[0].products[0].id, a.id);
  assert.equal(productFromParam(index, before)?.product.name, 'ETNA ROSATO'); // link condiviso prima della rinomina
  assert.equal(index.productSlug.get(reloaded.macros[0].products[0].uid), `etna-rosato-${a.id}`);
  assert.equal(productFromParam(index, a.id)?.product.name, 'ETNA ROSATO'); // anche solo il codice
  assert.equal(productFromParam(indexCatalog(catalog), 'travaglianti-etna-rose-2')?.product.price, '€ 30'); // vecchi link "brand-nome"

  // codici doppi o non validi nel JSON: il primo resta, gli altri ne ricevono uno nuovo
  const dup = buildCatalog(config, [{ ...vini, products: vini.products.map((p) => ({ ...p, id: 'abc123' })) }]).macros[0].products;
  assert.equal(dup[0].id, 'abc123');
  assert.notEqual(dup[1].id, 'abc123');
  assert.match(buildCatalog(config, [{ ...vini, products: [{ ...vini.products[0], id: 'Non Valido!' }] }]).macros[0].products[0].id, /^[a-z0-9]+$/);
});

test('nome file univoco per nuove macro categorie', () => {
  const catalog = buildCatalog({ ...config, macroCategories: [{ ...config.macroCategories[0], file: 'birre.json' }] }, [{}]);
  assert.equal(macroFileName(catalog, 'Birre'), 'birre_2.json');
  assert.equal(macroFileName(catalog, 'Le Conserve'), 'le_conserve.json');
});

test('sezioni vuote o con testo segnaposto', () => {
  assert.equal(isBlankHtml('<p>Abbinamenti consigliati...</p>'), true);
  assert.equal(isBlankHtml('<p>&nbsp;</p>'), true);
  assert.equal(isBlankHtml('<p>Pesce crudo</p>'), false);
});

test('dati chiave: riconosciuti dal nome della voce, in ordine di importanza', () => {
  const tech = [
    { k: 'PRODUTTORE', v: 'Feudo' }, { k: 'ZONA DI PRODUZIONE', v: 'Etna' }, { k: 'UVAGGIO', v: 'Nerello' },
    { k: 'GRADAZIONE', v: '14°' }, { k: 'FORMATO', v: '75 cl' }, { k: 'DENOMINAZIONE', v: 'DOC' }, { k: 'COLORE', v: '' },
  ];
  assert.deepEqual(keyFacts(tech).map((r) => r.k), ['GRADAZIONE', 'FORMATO', 'UVAGGIO', 'DENOMINAZIONE']);
  assert.deepEqual(keyFacts([{ k: 'INGREDIENTE PRINCIPALE', v: 'Fico d\u2019India' }]).map((r) => r.k), ['INGREDIENTE PRINCIPALE']);
  assert.deepEqual(keyFacts([{ k: 'COLORE', v: 'Rosso' }]), []);
});
