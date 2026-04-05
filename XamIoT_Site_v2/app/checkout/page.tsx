'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getCart, clearCart, cartTotal, CartItem } from '@/lib/cart';
import { getToken, getUser, isAuthenticated } from '@/lib/auth';
import { getCountries, checkoutCalculate, checkoutCreateIntent, getMyAddresses, createAddress, getStripeConfig, Country } from '@/lib/api';

const fmtEur = (c: number) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const inputCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';

interface Address {
  first_name: string; last_name: string; company: string;
  line1: string; line2: string; postal_code: string;
  city: string; region: string; country_code: string; phone: string;
}

const emptyAddr = (): Address => ({
  first_name: '', last_name: '', company: '', line1: '', line2: '',
  postal_code: '', city: '', region: '', country_code: 'FR', phone: '',
});

/* ── Composant formulaire paiement Stripe ── */
function PaymentForm({
  clientSecret,
  orderId,
  total,
  onSuccess,
  onError,
}: {
  clientSecret: string;
  orderId: string;
  total: number;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (error) {
      onError(error.message || 'Paiement refusé.');
      setPaying(false);
    } else {
      clearCart();
      onSuccess();
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={paying || !stripe}
        className="w-full py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition disabled:opacity-50 mt-4"
      >
        {paying ? 'Traitement…' : `Payer ${fmtEur(total)}`}
      </button>
    </form>
  );
}

/* ── Page principale ── */
export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);

  const [shipping, setShipping] = useState<Address>(emptyAddr());
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<Address>(emptyAddr());

  const [fees, setFees] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'address' | 'review' | 'payment' | 'done'>('address');

  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState('');
  const [orderId, setOrderId] = useState('');

  const user = getUser();
  const token = getToken();

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/compte'); return; }
    localStorage.removeItem('xamiot_checkout_pending');
    setItems(getCart());
    getCountries('fr').then(setCountries);
    if (token) {
      getMyAddresses(token).then(addrs => {
        setSavedAddresses(addrs);
        const def = addrs.find((a: any) => a.is_default && a.type === 'shipping');
        if (def) {
          setShipping({
            first_name: def.first_name, last_name: def.last_name, company: def.company || '',
            line1: def.line1, line2: def.line2 || '', postal_code: def.postal_code,
            city: def.city, region: def.region || '', country_code: def.country_code, phone: def.phone || '',
          });
        }
      });
    }
    if (user) {
      setShipping(prev => ({
        ...prev,
        first_name: prev.first_name || user.first_name || '',
        last_name: prev.last_name || user.last_name || '',
      }));
    }
  }, []);

  async function calculateFees() {
    if (!shipping.line1 || !shipping.city || !shipping.postal_code || !shipping.country_code) {
      setError('Veuillez remplir l\'adresse de livraison.');
      return;
    }
    setLoading(true); setError('');
    try {
      const cartItems = items.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
      const result = await checkoutCalculate(cartItems, shipping.country_code);
      setFees(result);
      setStep('review');
    } catch (err: any) {
      if (err?.error === 'country_blocked') setError(err.message || 'Livraison non disponible dans ce pays.');
      else if (err?.error === 'country_not_available') setError('Ce pays n\'est pas disponible pour la livraison.');
      else setError(err?.message || 'Erreur lors du calcul des frais.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOrder() {
    if (!user?.email) return;
    setLoading(true); setError('');
    try {
      // 1. Charger la clé publique Stripe
      const stripeConfig = await getStripeConfig();
      if (!stripeConfig.publishable_key) {
        setError('Le paiement n\'est pas encore configuré. Contactez le support.');
        setLoading(false);
        return;
      }

      // 2. Créer le PaymentIntent côté API
      const cartItems = items.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
      const result = await checkoutCreateIntent({
        items: cartItems,
        email: user.email,
        shipping_address: shipping,
        billing_address: billingSame ? undefined : billing,
        billing_same_as_shipping: billingSame,
      });

      // 3. Auto-sauvegarder les adresses sur le compte si pas déjà présentes
      if (token) {
        const existingAddrs = savedAddresses;
        const shippingExists = existingAddrs.some(
          (a: any) => a.type === 'shipping' && a.line1 === shipping.line1 && a.postal_code === shipping.postal_code
        );
        if (!shippingExists && shipping.line1) {
          getMyAddresses(token).then(currentAddrs => {
            const stillExists = currentAddrs.some(
              (a: any) => a.type === 'shipping' && a.line1 === shipping.line1 && a.postal_code === shipping.postal_code
            );
            if (!stillExists) {
              createAddress(token, {
                type: 'shipping',
                is_default: currentAddrs.filter((a: any) => a.type === 'shipping').length === 0,
                ...shipping,
                company: shipping.company || null,
                line2: shipping.line2 || null,
                region: shipping.region || null,
                phone: shipping.phone || null,
              }).catch(() => {});
            }
          }).catch(() => {});
        }
        if (!billingSame && billing.line1) {
          const billingExists = existingAddrs.some(
            (a: any) => a.type === 'billing' && a.line1 === billing.line1 && a.postal_code === billing.postal_code
          );
          if (!billingExists) {
            createAddress(token, {
              type: 'billing',
              is_default: existingAddrs.filter((a: any) => a.type === 'billing').length === 0,
              ...billing,
              company: billing.company || null,
              line2: billing.line2 || null,
              region: billing.region || null,
              phone: billing.phone || null,
            }).catch(() => {});
          }
        }
      }

      // 4. Initialiser Stripe et afficher le formulaire de paiement
      setStripePromise(loadStripe(stripeConfig.publishable_key));
      setClientSecret(result.client_secret);
      setOrderId(result.order_id);
      setStep('payment');
    } catch (err: any) {
      setError(err?.message || err?.error || 'Erreur lors de la création de la commande.');
    } finally {
      setLoading(false);
    }
  }

  function applyAddress(addr: any) {
    setShipping({
      first_name: addr.first_name, last_name: addr.last_name, company: addr.company || '',
      line1: addr.line1, line2: addr.line2 || '', postal_code: addr.postal_code,
      city: addr.city, region: addr.region || '', country_code: addr.country_code, phone: addr.phone || '',
    });
  }

  const subtotal = cartTotal(items);

  if (!items.length && step !== 'done') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Votre panier est vide</h1>
        <a href="/boutique" className="text-blue-600 hover:underline">Retour à la boutique</a>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">✓</div>
        <h1 className="text-2xl font-bold mb-2">Paiement confirmé !</h1>
        <p className="text-gray-600 mb-6">Votre commande a bien été enregistrée. Vous recevrez un email de confirmation.</p>
        <a href="/boutique" className="text-blue-600 hover:underline">Retour à la boutique</a>
      </div>
    );
  }

  function AddressForm({ addr, setAddr, label }: { addr: Address; setAddr: (a: Address) => void; label: string }) {
    const upd = (field: keyof Address, val: string) => setAddr({ ...addr, [field]: val });
    return (
      <div>
        <h3 className="font-medium text-sm mb-3">{label}</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input placeholder="Prénom *" value={addr.first_name} onChange={e => upd('first_name', e.target.value)} className={inputCls} required />
          <input placeholder="Nom *" value={addr.last_name} onChange={e => upd('last_name', e.target.value)} className={inputCls} required />
        </div>
        <input placeholder="Société (optionnel)" value={addr.company} onChange={e => upd('company', e.target.value)} className={`${inputCls} mb-3`} />
        <input placeholder="Adresse ligne 1 *" value={addr.line1} onChange={e => upd('line1', e.target.value)} className={`${inputCls} mb-3`} required />
        <input placeholder="Adresse ligne 2" value={addr.line2} onChange={e => upd('line2', e.target.value)} className={`${inputCls} mb-3`} />
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input placeholder="Code postal *" value={addr.postal_code} onChange={e => upd('postal_code', e.target.value)} className={inputCls} required />
          <input placeholder="Ville *" value={addr.city} onChange={e => upd('city', e.target.value)} className={inputCls} required />
        </div>
        <input placeholder="Région / État" value={addr.region} onChange={e => upd('region', e.target.value)} className={`${inputCls} mb-3`} />
        <select value={addr.country_code} onChange={e => upd('country_code', e.target.value)} className={`${inputCls} mb-3`} required>
          <option value="">— Pays * —</option>
          {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <input placeholder="Téléphone" value={addr.phone} onChange={e => upd('phone', e.target.value)} className={inputCls} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Finaliser la commande</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{error}</div>
      )}

      <div className="grid md:grid-cols-5 gap-8">
        {/* Colonne gauche */}
        <div className="md:col-span-3 space-y-6">
          {/* Adresses enregistrées */}
          {savedAddresses.length > 0 && step === 'address' && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <h3 className="text-sm font-medium mb-2">Adresses enregistrées</h3>
              <div className="space-y-2">
                {savedAddresses.filter((a: any) => a.type === 'shipping').map((a: any) => (
                  <button key={a.id} onClick={() => applyAddress(a)}
                    className="w-full text-left p-3 bg-white rounded border border-gray-200 hover:border-blue-300 text-xs transition">
                    <span className="font-medium">{a.label || `${a.first_name} ${a.last_name}`}</span>
                    <span className="text-gray-500 ml-2">— {a.line1}, {a.postal_code} {a.city}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'address' && (
            <>
              <AddressForm addr={shipping} setAddr={setShipping} label="Adresse de livraison" />

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={billingSame} onChange={e => setBillingSame(e.target.checked)} />
                Adresse de facturation identique
              </label>

              {!billingSame && (
                <AddressForm addr={billing} setAddr={setBilling} label="Adresse de facturation" />
              )}

              <button onClick={calculateFees} disabled={loading}
                className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-50">
                {loading ? 'Calcul en cours…' : 'Calculer les frais et continuer'}
              </button>
            </>
          )}

          {step === 'review' && fees && (
            <div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 mb-4">
                <h3 className="font-medium text-sm mb-2">Livraison à :</h3>
                <p className="text-sm text-gray-700">
                  {shipping.first_name} {shipping.last_name}<br />
                  {shipping.company && <>{shipping.company}<br /></>}
                  {shipping.line1}{shipping.line2 && `, ${shipping.line2}`}<br />
                  {shipping.postal_code} {shipping.city}
                  {shipping.region && `, ${shipping.region}`}<br />
                  {countries.find(c => c.code === shipping.country_code)?.name}
                </p>
                <button onClick={() => setStep('address')} className="text-blue-600 text-xs mt-2 hover:underline">
                  Modifier l'adresse
                </button>
              </div>

              {fees.message && (
                <div className="mb-4 p-3 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-200 text-sm">
                  {fees.message}
                </div>
              )}

              <button onClick={handleOrder} disabled={loading}
                className="w-full py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition disabled:opacity-50">
                {loading ? 'Traitement…' : `Continuer vers le paiement ${fmtEur(fees.total_cents)}`}
              </button>
            </div>
          )}

          {step === 'payment' && clientSecret && stripePromise && (
            <div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 mb-4">
                <h3 className="font-medium text-sm mb-1">Paiement sécurisé</h3>
                <p className="text-xs text-gray-500">Vos informations de paiement sont chiffrées par Stripe.</p>
              </div>
              <Elements stripe={stripePromise} options={{ clientSecret, locale: 'fr' }}>
                <PaymentForm
                  clientSecret={clientSecret}
                  orderId={orderId}
                  total={fees?.total_cents ?? 0}
                  onSuccess={() => {
                    setStep('done');
                    router.push(`/checkout/confirmation?order=${orderId}`);
                  }}
                  onError={(msg) => setError(msg)}
                />
              </Elements>
              <button onClick={() => setStep('review')} className="text-gray-500 text-xs mt-3 hover:underline block">
                ← Retour au récapitulatif
              </button>
            </div>
          )}
        </div>

        {/* Colonne droite — récapitulatif */}
        <div className="md:col-span-2">
          <div className="sticky top-24 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <h3 className="font-medium text-sm mb-4">Récapitulatif</h3>
            <div className="space-y-3 mb-4">
              {items.map(item => (
                <div key={item.product_id} className="flex justify-between text-sm">
                  <span className="truncate pr-2">{item.name} × {item.quantity}</span>
                  <span className="whitespace-nowrap font-medium">{fmtEur(item.price_cents * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Sous-total</span>
                <span>{fmtEur(fees?.subtotal_cents ?? subtotal)}</span>
              </div>
              {fees && (
                <>
                  <div className="flex justify-between">
                    <span>Livraison</span>
                    <span>{fees.shipping_cents ? fmtEur(fees.shipping_cents) : 'Gratuit'}</span>
                  </div>
                  {fees.tax_cents > 0 && (
                    <div className="flex justify-between">
                      <span>TVA ({fees.tax_rate_pct}%)</span>
                      <span>{fmtEur(fees.tax_cents)}</span>
                    </div>
                  )}
                  {fees.customs_cents > 0 && (
                    <div className="flex justify-between">
                      <span>Douane</span>
                      <span>{fmtEur(fees.customs_cents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
                    <span>Total</span>
                    <span>{fmtEur(fees.total_cents)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
