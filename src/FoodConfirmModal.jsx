import React from "react";
import { FoodQuantity } from "./QuantityInput.jsx";
import { Portal } from "./Portal.jsx";

// The single confirmation step every "food was found" path (typed search, barcode scan, packaged-product
// search, or a photographed nutrition label) ends at: check the amount, the time, and which meal it was —
// then either Add to log or Cancel. Making it an actual popup (rather than a form appearing inline on the
// page) means finding the food and confirming it are two visibly separate steps, not one blurred-together one.
export function FoodConfirmModal({
  title, subtitle, food, qty, unit, onQty, onUnit,
  time, onTime, mealType, onMealType, mealOptions,
  onConfirm, onCancel, confirmLabel = "Add to log", note, children,
}) {
  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(20,64,62,0.35)" }}
      onClick={onCancel}
      data-testid="food-confirm-modal"
    >
      <div
        className="pe-fadein w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5"
        style={{ background: "#fff", maxHeight: "88vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <div className="pe-display text-base font-semibold pr-4" style={{ color: "#14403E" }}>{title}</div>
          <button className="text-2xl leading-none shrink-0" style={{ color: "#948A78" }} onClick={onCancel} aria-label="Cancel">×</button>
        </div>
        {subtitle && <div className="text-xs mb-4" style={{ color: "#948A78" }}>{subtitle}</div>}

        <div className="mb-3">
          <FoodQuantity food={food} qty={qty} unit={unit} onQty={onQty} onUnit={onUnit} />
        </div>

        <div className="flex gap-2 mb-4">
          <div className="flex-1 min-w-0">
            <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Time eaten</label>
            <input type="time" className="pe-input w-full px-2 py-2 text-sm" value={time} onChange={(e) => onTime(e.target.value)} />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-[10px] font-medium mb-1" style={{ color: "#948A78" }}>Meal</label>
            <select className="pe-input w-full px-2 py-2 text-sm" value={mealType} onChange={(e) => onMealType(e.target.value)}>
              {mealOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {children}

        <button className="pe-btn-primary w-full py-2.5 rounded-full text-sm font-semibold" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="w-full text-xs font-medium mt-2 py-1" style={{ color: "#948A78" }} onClick={onCancel}>
          Cancel
        </button>
        {note}
      </div>
    </div>
    </Portal>
  );
}
