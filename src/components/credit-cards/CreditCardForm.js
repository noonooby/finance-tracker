import React from 'react';
import { useFinanceData } from '../../hooks/useFinanceData';
import RateLookup from '../shared/RateLookup';
import { cardProgram } from '../../utils/cards';
import { CreditCard as CreditCardIcon, Gift, Star } from 'lucide-react';
import ActionButton from '../shared/ActionButton';
import GiftCardForm from './GiftCardForm';
import { paymentSourceOptions, paymentSourceValue } from './cardMath';

/**
 * Add or edit form for a credit or gift card. `mode` is 'add' or 'edit'.
 */
export default function CreditCardForm({
  mode,
  card,
  formData,
  setFormData,
  editingItem,
  recentCardNames = [],
  recentGiftCards,
  onSelectCardName,
  onSelectGiftCard,
  giftCardNameInputRef,
  cardNameInputRef,
  onPaymentSourceChange,
  bankAccounts,
  creditCards,
  onSubmit,
  onCancel,
  submitting
}) {
  const spendCategories = (useFinanceData().categories || []).filter((c) => !c.is_income);
  const isEdit = mode === 'edit';
  const inputClass = `field`;
  const smallLabel = `block text-sm mb-1 text-muted`;
  const mainLabel = `block text-sm font-medium mb-2 text-fg`;
  const typeButton = (active, activeClass) => `flex-1 px-3 py-2 rounded-xl border-2 transition-colors font-medium flex items-center justify-center gap-2 ${
    active
      ? activeClass
      : 'border-line hover:border-accent text-fg'
  }`;

  return (
    <>
      {isEdit && (
        <h3 className="font-semibold text-lg mb-3">Edit {card.is_gift_card ? 'Gift card' : 'Credit card'}</h3>
      )}

      {!isEdit && recentCardNames.length > 0 && !editingItem && (
        <div>
          <label className={mainLabel}>Recent cards</label>
          <div className="flex gap-2 flex-wrap">
            {recentCardNames.map(cardEntity => (
              <button
                key={cardEntity.id}
                type="button"
                onClick={() => onSelectCardName(cardEntity)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  formData.name === cardEntity.name
                    ? 'bg-accent text-accent-contrast'
                    : 'bg-accent-soft text-accent hover:bg-accent-soft border border-accent/30'
                }`}
              >
                {cardEntity.name}
                {cardEntity.usage_count > 10 && <Star size={12} className="inline ml-1" aria-label="Frequently used" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2 text-fg">
          {isEdit ? 'Name' : recentCardNames.length > 0 ? 'Or type a new name' : 'Name'}
        </label>
        <input
          ref={isEdit ? undefined : cardNameInputRef}
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Rogers Mastercard"
          className="field"
          required={!isEdit}
          autoFocus={isEdit || (!editingItem && recentCardNames.length === 0)}
        />
      </div>

      <div>
        <label className={smallLabel}>Card type</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, isGiftCard: false })}
            className={typeButton(!formData.isGiftCard, 'border-accent bg-accent text-accent-contrast')}
          >
            <CreditCardIcon size={18} />
            Credit card
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, isGiftCard: true })}
            className={typeButton(formData.isGiftCard, 'border-positive/40 press bg-accent text-accent-contrast')}
          >
            <Gift size={18} />
            Gift card
          </button>
        </div>
      </div>

      <input
        type="number"
        step="0.01"
        placeholder="Current balance"
        value={formData.balance}
        onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
        className={inputClass}
      />

      {!formData.isGiftCard ? (
        <>
          <input
            type="number"
            step="0.01"
            placeholder="Credit limit (optional)"
            value={formData.creditLimit}
            onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
            className={inputClass}
          />
          <div>
            <label className={smallLabel}>Payment due date</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={smallLabel}>
              {isEdit ? 'Statement day (optional)' : 'Statement day of the month (optional)'}
            </label>
            <input
              type="number"
              placeholder="15"
              value={formData.statementDay}
              onChange={(e) => setFormData({ ...formData, statementDay: e.target.value })}
              className={inputClass}
            />
          </div>
          <input
            type="number"
            step="0.01"
            placeholder="Interest rate % (optional)"
            value={formData.interestRate}
            onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
            className={inputClass}
          />
          <div>
            <label className={smallLabel}>{isEdit ? 'Remind me, days before' : 'Remind me, days before'}</label>
            <input
              type="number"
              value={formData.alertDays}
              onChange={(e) => setFormData({ ...formData, alertDays: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="p-3 rounded-xl bg-accent-soft">
            <label className={mainLabel}>Pay it automatically from (optional)</label>
            <select
              value={paymentSourceValue(formData)}
              onChange={(e) => onPaymentSourceChange(e.target.value)}
              className="field"
            >
              {paymentSourceOptions(bankAccounts).map(source => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1 text-muted">
              With an account chosen, the card is paid from it on the due date. Leave it on none if you pay it yourself.
            </p>
            {formData.connectedPaymentSource && (
              <div className="grid grid-cols-2 gap-3 items-end mt-2">
                <label className={smallLabel}>Autopay pays
                  <select value={formData.autopayMode || 'statement'} onChange={(e) => setFormData({ ...formData, autopayMode: e.target.value })} className={inputClass}>
                    <option value="statement">The full balance</option>
                    <option value="minimum">The minimum payment</option>
                    <option value="fixed">A fixed amount</option>
                  </select>
                </label>
                {formData.autopayMode === 'fixed' && (
                  <label className={smallLabel}>Amount
                    <input type="number" step="0.01" inputMode="decimal" value={formData.autopayFixed} onChange={(e) => setFormData({ ...formData, autopayFixed: e.target.value })} className={inputClass} />
                  </label>
                )}
              </div>
            )}
          </div>

          <RateLookup kind="credit_card" name={formData.name} onUse={(r) => setFormData({ ...formData,
            interestRate: r.purchase_rate != null ? String(r.purchase_rate) : formData.interestRate,
            cashRate: r.cash_rate != null ? String(r.cash_rate) : formData.cashRate,
            annualFee: r.annual_fee != null ? String(r.annual_fee) : formData.annualFee,
            ratesSource: r.source_url || '', ratesChecked: r.checked })} />
          {formData.ratesChecked && <p className="text-xs text-muted">Rates from the issuer's public page, checked {formData.ratesChecked}.</p>}

          <div className="grid grid-cols-2 gap-3 items-end">
            <label className={smallLabel}>Minimum payment
              <input type="number" step="0.01" inputMode="decimal" placeholder="From the statement" value={formData.minimumPayment} onChange={(e) => setFormData({ ...formData, minimumPayment: e.target.value })} className={inputClass} />
            </label>
            <label className={smallLabel}>Annual fee
              <input type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={formData.annualFee} onChange={(e) => setFormData({ ...formData, annualFee: e.target.value })} className={inputClass} />
            </label>
            <label className={smallLabel}>Rewards %
              <input type="number" step="0.01" min="0" max="10" inputMode="decimal" placeholder="For example 2" value={formData.rewardPercent || ''} onChange={(e) => setFormData({ ...formData, rewardPercent: e.target.value })} className={inputClass} />
            </label>
            <label className={smallLabel}>Rewards on bill payments %
              <input type="number" step="0.01" min="0" max="10" inputMode="decimal" placeholder="If different" value={formData.rewardBillsPercent || ''} onChange={(e) => setFormData({ ...formData, rewardBillsPercent: e.target.value })} className={inputClass} />
            </label>
            {(() => { const p = cardProgram({ name: formData.name }); return p && p.note ? (
              <p className="col-span-full text-xs text-muted">Known for this card: {p.kind}. {p.note} Leave the rewards fields empty to use these, or type your own.</p>
            ) : null; })()}
            <div className="col-span-full space-y-2">
              {(formData.rewardRules || []).map((r, i) => {
                const setRule = (change) => setFormData({ ...formData, rewardRules: formData.rewardRules.map((x, j) => (j === i ? { ...x, ...change } : x)) });
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select aria-label={`Category with its own rewards rate ${i + 1}`} value={r.category_id} onChange={(e) => setRule({ category_id: e.target.value })} className={inputClass}>
                      <option value="">Category</option>
                      {spendCategories.filter((c) => !formData.rewardRules.some((x, j) => j !== i && String(x.category_id) === String(c.id))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input type="number" step="0.01" min="0" max="10" inputMode="decimal" placeholder="%" aria-label={`Rewards rate for category ${i + 1}, in percent`}
                      value={r.percent} onChange={(e) => setRule({ percent: e.target.value })} className={`${inputClass} max-w-[6rem]`} />
                    <button type="button" className="text-sm text-muted underline shrink-0" onClick={() => setFormData({ ...formData, rewardRules: formData.rewardRules.filter((_, j) => j !== i) })}>Remove</button>
                  </div>
                );
              })}
              {(formData.rewardRules || []).length < 6 && spendCategories.length > 0 && (
                <button type="button" className="text-sm font-medium text-accent" onClick={() => setFormData({ ...formData, rewardRules: [...(formData.rewardRules || []), { category_id: '', percent: '' }] })}>Add a rewards rate for one category</button>
              )}
            </div>
            <label className={smallLabel}>Cash advance rate %
              <input type="number" step="0.01" inputMode="decimal" placeholder="Optional" value={formData.cashRate} onChange={(e) => setFormData({ ...formData, cashRate: e.target.value })} className={inputClass} />
            </label>
            <label className={smallLabel}>Promo rate %
              <input type="number" step="0.01" inputMode="decimal" placeholder="0" value={formData.promoRate} onChange={(e) => setFormData({ ...formData, promoRate: e.target.value })} className={inputClass} />
            </label>
            {formData.promoRate !== '' && (
              <label className={smallLabel}>Promo ends
                <input type="date" value={formData.promoEnd} onChange={(e) => setFormData({ ...formData, promoEnd: e.target.value })} className={inputClass} />
              </label>
            )}
          </div>
        </>
      ) : (
        <GiftCardForm
          formData={formData}
          onFormDataChange={setFormData}
          bankAccounts={bankAccounts}
          creditCards={creditCards}
          recentGiftCards={recentGiftCards}
          onSelectGiftCard={onSelectGiftCard}
          giftCardNameInputRef={giftCardNameInputRef}
          editingItem={editingItem}
        />
      )}

      <div className={`flex gap-2${isEdit ? ' pt-2' : ''}`}>
        <ActionButton
          onClick={onSubmit}
          processing={submitting}
          variant="primary"
          processingText={'Saving...'}
          idleText={isEdit || editingItem ? 'Save' : 'Add card'}
          fullWidth
        />
        <ActionButton
          onClick={onCancel}
          variant="secondary"
          idleText="Cancel"
          fullWidth
        />
      </div>
    </>
  );
}
