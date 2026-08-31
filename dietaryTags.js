// Best-effort dietary tagging based on each recipe's three structured
// components (protein / carb / veg, or food1 / food2 for fixed items).
//
// IMPORTANT LIMITATION: this checks the *named* ingredients only — a method
// step mentioning "a dusting of flour" or "a spoon of cream" won't be
// caught if that ingredient isn't one of the recipe's structured fields.
// This is a genuinely useful filter for general gluten/dairy reduction,
// but it is NOT verified safe for coeliac disease or a diagnosed allergy —
// always check a recipe's full method for anyone with a medical need.

export const GLUTEN_INGREDIENTS = new Set([
  "Wholegrain bread", "Rye bread", "Wholewheat pasta (dry)", "Orzo pasta (dry)",
  "Wholemeal pitta", "Wholemeal tortilla wrap", "Bulgur wheat (dry)", "Couscous (dry)",
  "Egg noodles (dry)", "Naan bread", "Wholegrain crackers", "Protein bar (homemade)",
  "No-bake oat & protein slice (homemade, sugar-free)", "Protein biscuits (homemade, sugar-free)",
  "Digestive biscuit", "Custard cream biscuit", "Chocolate chip cookie", "Doughnut (glazed)",
  "Flapjack (shop-bought)", "Tortilla chips",
]);

export const DAIRY_INGREDIENTS = new Set([
  "Greek yoghurt (0%)", "Kefir (natural)", "Halloumi", "Feta cheese", "Cottage cheese (low-fat)",
  "Ricotta cheese", "Light mozzarella", "Labneh", "Quark (fat-free)", "Paneer",
  "Whole milk", "Semi-skimmed milk", "Latte (whole milk)", "Hot chocolate (made with milk)",
  "Tea with milk", "Coffee with whole milk (splash)", "Ice cream (dairy, vanilla)",
]);

export const GLUTEN_SUBS = {
  "Wholegrain bread": "gluten-free bread",
  "Rye bread": "gluten-free bread",
  "Wholewheat pasta (dry)": "gluten-free pasta, or extra basmati rice",
  "Orzo pasta (dry)": "gluten-free pasta, or basmati rice",
  "Wholemeal pitta": "corn tortillas or a gluten-free wrap",
  "Wholemeal tortilla wrap": "corn tortillas",
  "Bulgur wheat (dry)": "quinoa",
  "Couscous (dry)": "quinoa or basmati rice",
  "Egg noodles (dry)": "rice noodles",
  "Naan bread": "corn tortillas or a gluten-free flatbread",
  "Wholegrain crackers": "gluten-free crackers or rice cakes",
};

export const DAIRY_SUBS = {
  "Greek yoghurt (0%)": "a dairy-free yoghurt alternative",
  "Kefir (natural)": "a dairy-free kefir or coconut yoghurt",
  "Halloumi": "extra-firm tofu, pan-fried until golden",
  "Feta cheese": "a dairy-free feta alternative, or extra olives for saltiness",
  "Cottage cheese (low-fat)": "blended silken tofu",
  "Ricotta cheese": "blended silken tofu with a squeeze of lemon",
  "Light mozzarella": "a dairy-free mozzarella alternative",
  "Labneh": "strained coconut yoghurt",
  "Quark (fat-free)": "a dairy-free yoghurt alternative",
  "Paneer": "extra-firm tofu",
};

function componentsOf(item, isFixed) {
  if (isFixed) return [item.food1, item.food2].filter(Boolean);
  return [item.proteinFood, item.carbFood, item.vegFood].filter(Boolean);
}

export function isGlutenFree(item, isFixed) {
  return componentsOf(item, isFixed).every((f) => !GLUTEN_INGREDIENTS.has(f));
}

export function isDairyFree(item, isFixed) {
  return componentsOf(item, isFixed).every((f) => !DAIRY_INGREDIENTS.has(f));
}

export function dietarySwaps(item, isFixed) {
  const swaps = [];
  componentsOf(item, isFixed).forEach((food) => {
    if (GLUTEN_SUBS[food]) swaps.push({ type: "Gluten-free swap", from: food, to: GLUTEN_SUBS[food] });
    if (DAIRY_SUBS[food]) swaps.push({ type: "Dairy-free swap", from: food, to: DAIRY_SUBS[food] });
  });
  return swaps;
}
