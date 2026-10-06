import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Pack, Product } from '../types';
import { useAdmin } from '../lib/admin';
import { formatPrice, packOffer, packOffers, priceInfo, type PackOffer } from '../lib/pricing';
import { Icon } from './Icon';
import { AdminIconButton } from './ui';

/** Riquadro offerte nella scheda: elenco pack per il cliente, editor sconto + pack in admin. */
export function Offers({ product }: { product: Product }) {
  return useAdmin() ? <OffersEditor product={product} /> : <PackList product={product} />;
}

function PackList({ product }: { product: Product }) {
  const offers = packOffers(product);
  if (!offers.length) return null;
  return (
    <section className="pack-offers" aria-label="Offerte pack">
      <h4 className="sheet-section-title">Offerte pack</h4>
      <div className="pack-list">
        {offers.map((offer, i) => (
          <div key={i} className="pack-item">
            <div className="pack-qty"><strong>{offer.qty}</strong><span>pezzi</span></div>
            <PackPrices offer={offer} like={product.price} />
            {offer.discount > 0 && <span className="sale-badge">-{offer.discount}%</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function PackPrices({ offer, like }: { offer: PackOffer; like: string }) {
  if (offer.total === null || offer.full === null || offer.perUnit === null) {
    return <div className="pack-prices"><strong>Pack da {offer.qty}</strong></div>;
  }
  return (
    <div className="pack-prices">
      {offer.discount > 0 && <s>{formatPrice(offer.full, like)}</s>}
      <strong>{formatPrice(offer.total, like)}</strong>
      <span>{formatPrice(offer.perUnit, like)} al pezzo</span>
    </div>
  );
}

const toInt = (value: string, max: number) =>
  value.trim() === '' ? 0 : Math.min(max, Math.max(0, Math.round(Number(value)) || 0));

function OffersEditor({ product }: { product: Product }) {
  const admin = useAdmin()!;
  const price = priceInfo(product);
  const packs: Pack[] = Array.isArray(product.packs) ? product.packs : [];
  const set = (patch: Partial<Product>) => admin.updateProduct(product.uid, patch);
  // campi assenti nel JSON quando non usati: i prodotti senza offerte restano identici
  const setPacks = (next: Pack[]) => set({ packs: next.length ? next : undefined });
  const setPack = (i: number, patch: Partial<Pack>) => setPacks(packs.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <section className="pack-offers is-editable" aria-label="Sconto e offerte pack">
      <h4 className="sheet-section-title">Sconto e offerte pack</h4>
      {price.base === null && (
        <div className="offer-warning">Prezzo non riconosciuto: scrivilo come "€ 12,50" per calcolare sconti e pack.</div>
      )}
      <div className="offer-row">
        <label className="offer-field">
          <span>Sconto prodotto</span>
          <input type="number" min={0} max={99} step={1} inputMode="numeric" placeholder="0" value={product.discount || ''}
            onChange={(e) => set({ discount: toInt(e.target.value, 99) || undefined })} />
          <em>%</em>
        </label>
        {price.discount > 0 && <span className="offer-preview"><s>{product.price}</s> <strong>{price.label}</strong></span>}
      </div>
      <div className="pack-list">
        {packs.map((pack, i) => {
          const offer = packOffer(price.final, pack);
          return (
            <div key={i} className="pack-item">
              <label className="pack-qty">
                <input type="number" min={2} max={999} step={1} inputMode="numeric" aria-label="Pezzi nel pack"
                  value={pack.qty || ''} onChange={(e) => setPack(i, { qty: toInt(e.target.value, 999) })} />
                <span>pezzi</span>
              </label>
              {offer.qty >= 2
                ? <PackPrices offer={offer} like={product.price} />
                : <div className="pack-prices"><span>Minimo 2 pezzi</span></div>}
              <label className="offer-field compact">
                <input type="number" min={0} max={99} step={1} inputMode="numeric" placeholder="0" aria-label="Sconto pack"
                  value={pack.discount || ''} onChange={(e) => setPack(i, { discount: toInt(e.target.value, 99) })} />
                <em>%</em>
              </label>
              <AdminIconButton icon={faXmark} title="Elimina pack" danger onClick={() => setPacks(packs.filter((_, j) => j !== i))} />
            </div>
          );
        })}
      </div>
      <div className="sheet-admin-actions">
        <button type="button" className="sheet-admin-btn" onClick={() => setPacks([...packs, { qty: 6, discount: 5 }])}>
          <Icon icon={faPlus} /><span>AGGIUNGI PACK</span>
        </button>
      </div>
    </section>
  );
}
