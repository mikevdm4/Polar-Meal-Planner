// Everyday serving sizes, so you can log "2 medium bananas" instead of working out grams.
// Weights are typical edible weights (peeled / cooked-off-the-bone / as sold in the UK) — good enough for
// tracking, and the unit dropdown always keeps plain grams available for when you've weighed something.
//
// Labels deliberately don't include a number ("medium", not "1 medium") because the quantity box supplies it:
// 2 × medium banana. Keys must exactly match a name in FOOD_LIST — tests/tally.mjs enforces that.

const s = (label, grams) => ({ label, grams });

const MILK_GLASS = [s("glass (250ml)", 258), s("splash (30ml)", 31)];
const PLANT_MILK = [s("glass (250ml)", 250), s("splash (30ml)", 30)];
const JUICE = [s("glass (200ml)", 208), s("small carton (150ml)", 156)];
const PROTEIN_SCOOP = [s("scoop", 30)];
const NUTS_HANDFUL = [s("handful (30g)", 30)];
const CRISP_BAG = [s("small bag (25g)", 25), s("grab bag (40g)", 40)];
const DRY_CARB = (g) => [s("serving (dry)", g)];
const TIN_PULSES = [s("½ tin (drained)", 120), s("full tin (drained)", 240)];
const MUG = [s("mug (250ml)", 250)];
const CAN_FIZZY = [s("can (330ml)", 330), s("bottle (500ml)", 500)];
const TBSP = (g) => [s("tbsp", g)];

export const SERVINGS = {
  // ── Fruit ──
  "Apple": [s("small", 130), s("medium", 182), s("large", 220)],
  "Banana": [s("small", 101), s("medium", 118), s("large", 136)],
  "Pear": [s("medium", 178)],
  "Peach": [s("medium", 150)],
  "Plum": [s("medium", 66)],
  "Kiwi": [s("medium", 69)],
  "Apricot": [s("medium", 35)],
  "Clementine/satsuma": [s("medium", 74)],
  "Cherries": [s("handful (~10)", 68)],
  "Fig (fresh)": [s("medium", 50)],
  "Passionfruit": [s("fruit", 18)],
  "Grapes": [s("handful (~15)", 80), s("cup", 151)],
  "Strawberries": [s("medium berry", 18), s("cup (sliced)", 166)],
  "Blueberries": [s("handful", 50), s("cup", 148)],
  "Mixed berries": [s("handful", 60), s("cup", 145)],
  "Watermelon": [s("cup (diced)", 152), s("wedge", 286)],
  "Pineapple": [s("slice", 84), s("cup (chunks)", 165)],
  "Mango (fresh)": [s("cup (diced)", 165), s("whole mango", 336)],
  "Medjool dates": [s("date", 24)],
  "Raisins": [s("small handful", 30), s("tbsp", 10)],
  "Sultanas": [s("small handful", 30), s("tbsp", 10)],
  "Dried apricots": [s("apricot", 8)],
  "Dried mango": [s("handful", 30)],
  "Pomegranate seeds": [s("½ cup", 87)],

  // ── Veg ──
  "Avocado": [s("½ avocado", 100), s("whole avocado", 200)],
  "Fresh tomato": [s("medium", 123)],
  "Cherry tomatoes": [s("tomato", 17), s("handful (~6)", 100)],
  "Cucumber": [s("⅓ cucumber", 100)],
  "Cucumber (side)": [s("⅓ cucumber", 100)],
  "Carrot": [s("medium", 61)],
  "Onion": [s("medium", 110)],
  "Red onion": [s("medium", 110)],
  "Mushrooms": [s("medium mushroom", 18), s("handful (~5)", 90)],
  "Broccoli": [s("cup (florets)", 91)],
  "Cauliflower florets": [s("cup", 107)],
  "Spinach": [s("handful", 30)],
  "Salad leaves / rocket": [s("handful", 30), s("side bowl", 60)],
  "Courgette": [s("medium", 196)],
  "Mixed peppers": [s("pepper", 119)],
  "Sweetcorn": [s("½ cup", 82)],
  "Peas (frozen)": [s("portion (80g)", 80)],
  "Asparagus": [s("spear", 16), s("small bunch (5)", 80)],
  "Sweet potato (raw)": [s("medium", 130)],
  "Beetroot, cooked": [s("medium", 82)],
  "Olives": [s("olive", 4), s("small handful (~10)", 40)],

  // ── Eggs & dairy ──
  "Whole eggs": [s("large egg", 50), s("medium egg", 44)],
  "Egg whites": [s("large egg white", 33)],
  "Whole milk": MILK_GLASS,
  "Semi-skimmed milk": MILK_GLASS,
  "Almond milk, unsweetened": PLANT_MILK,
  "Oat milk": PLANT_MILK,
  "Soy milk, unsweetened": PLANT_MILK,
  "Kefir (natural)": [s("glass (200ml)", 206)],
  "Greek yoghurt (0%)": [s("pot (170g)", 170), s("tbsp", 20)],
  "Cottage cheese (low-fat)": [s("½ cup", 113)],
  "Ricotta cheese": [s("¼ cup", 62)],
  "Cheddar cheese": [s("slice", 20), s("matchbox (30g)", 30)],
  "Feta cheese": [s("portion (30g)", 30)],
  "Halloumi": [s("slice", 30)],
  "Parmesan": [s("tbsp (grated)", 5)],
  "Brie": [s("portion (30g)", 30)],
  "Stilton": [s("portion (30g)", 30)],
  "Light mozzarella": [s("½ ball", 62), s("ball (125g)", 125)],
  "Full-fat cream cheese": TBSP(15),
  "Light cream cheese": TBSP(15),
  "Double cream": TBSP(15),
  "Butter": [s("tsp", 5), s("tbsp", 14)],

  // ── Protein foods ──
  "Vanilla protein powder (whey)": PROTEIN_SCOOP,
  "Chocolate protein powder (whey)": PROTEIN_SCOOP,
  "Strawberry protein powder (whey)": PROTEIN_SCOOP,
  "Unflavoured protein powder (whey)": PROTEIN_SCOOP,
  "Vegan protein powder (pea/rice blend)": PROTEIN_SCOOP,
  "Chicken breast (raw)": [s("medium fillet", 150)],
  "Chicken thigh, skinless (raw)": [s("thigh", 100)],
  "Beef steak, lean (raw)": [s("steak (6oz)", 170)],
  "Extra-lean beef mince (raw)": [s("portion", 125)],
  "Salmon fillet (raw)": [s("fillet", 125)],
  "Sea bass fillet (raw)": [s("fillet", 100)],
  "White fish e.g. cod (raw)": [s("fillet", 140)],
  "Haddock (raw)": [s("fillet", 140)],
  "Smoked salmon": [s("slice", 25), s("pack (100g)", 100)],
  "Tuna, canned in water": [s("tin (drained)", 112)],
  "Sardines, canned in oil (drained)": [s("tin (drained)", 90)],
  "Bacon (back, grilled)": [s("rasher", 25)],
  "Falafel (baked)": [s("falafel", 30)],
  "Beef jerky": [s("small bag", 25)],
  "Chickpeas, canned (drained)": TIN_PULSES,
  "Kidney beans, canned (drained)": TIN_PULSES,
  "Black beans, canned (drained)": TIN_PULSES,
  "Butter beans, canned (drained)": TIN_PULSES,
  "Mixed beans, canned (drained)": TIN_PULSES,
  "Lentils, cooked": [s("½ cup", 99)],

  // ── Bread, grains & cereals ──
  "Wholegrain bread": [s("slice", 38)],
  "Sourdough bread": [s("slice", 50)],
  "Rye bread": [s("slice", 32)],
  "Bagel (plain)": [s("bagel", 100)],
  "Crumpet": [s("crumpet", 55)],
  "Naan bread": [s("naan", 130)],
  "Wholemeal pitta": [s("pitta", 60)],
  "Wholemeal tortilla wrap": [s("wrap", 62)],
  "Corn tortillas": [s("tortilla", 26)],
  "Oats (dry)": [s("serving (40g)", 40), s("tbsp", 10)],
  "Basmati rice (dry)": DRY_CARB(75),
  "White rice (dry)": DRY_CARB(75),
  "Brown rice (dry)": DRY_CARB(75),
  "Jasmine rice (dry)": DRY_CARB(75),
  "Couscous (dry)": DRY_CARB(75),
  "Quinoa (dry)": DRY_CARB(60),
  "Bulgur wheat (dry)": DRY_CARB(60),
  "Wholewheat pasta (dry)": DRY_CARB(75),
  "Orzo pasta (dry)": DRY_CARB(75),
  "Granola": [s("serving (45g)", 45)],
  "Muesli (dry)": [s("serving (45g)", 45)],
  "Cornflakes-style cereal": [s("bowl (30g)", 30)],
  "Wheat biscuit cereal": [s("biscuit", 19)],
  "Puffed rice cereal (unsweetened)": [s("bowl (30g)", 30)],

  // ── Spreads, oils, condiments ──
  "Peanut butter (natural)": TBSP(16),
  "Almond butter": TBSP(16),
  "Tahini": TBSP(15),
  "Hummus": [s("tbsp", 15), s("serving (50g)", 50)],
  "Honey": [s("tsp", 7), s("tbsp", 21)],
  "Sugar (granulated)": [s("tsp", 4)],
  "Olive oil": [s("tsp", 4.5), s("tbsp", 13.5)],
  "Mayonnaise (full-fat)": TBSP(14),
  "Light mayonnaise": TBSP(14),
  "Ketchup": TBSP(17),
  "Soy sauce": TBSP(16),
  "Pesto": TBSP(16),
  "Salad dressing (vinaigrette-style)": TBSP(15),
  "Chia seeds": TBSP(12),
  "Flaxseed, ground": TBSP(7),

  // ── Nuts & seeds ──
  "Almonds": NUTS_HANDFUL,
  "Mixed nuts": NUTS_HANDFUL,
  "Cashews": NUTS_HANDFUL,
  "Pistachios": NUTS_HANDFUL,
  "Walnuts": NUTS_HANDFUL,
  "Peanuts": NUTS_HANDFUL,
  "Brazil nuts": [s("nut", 5)],
  "Pumpkin seeds": TBSP(9),
  "Sunflower seeds": TBSP(9),

  // ── Snacks & treats ──
  "Chocolate bar (milk)": [s("standard bar (45g)", 45)],
  "Dark chocolate (70%)": [s("square", 10)],
  "Chocolate bar (dark, 70%+)": [s("square", 10)],
  "Crisps (cheese & onion)": CRISP_BAG,
  "Crisps (salt & vinegar)": CRISP_BAG,
  "Crisps (lightly salted, baked)": CRISP_BAG,
  "Crisps (ready salted)": CRISP_BAG,
  "Tortilla chips": [s("handful (30g)", 30)],
  "Tortilla chips (lime & chilli)": [s("handful (30g)", 30)],
  "Digestive biscuit": [s("biscuit", 15)],
  "Custard cream biscuit": [s("biscuit", 13)],
  "Chocolate chip cookie": [s("cookie", 30)],
  "Donut (glazed)": [s("donut", 60)],
  "Doughnut (glazed)": [s("doughnut", 60)],
  "Ice cream (dairy, vanilla)": [s("scoop", 60)],
  "Scotch egg": [s("scotch egg", 115)],
  "Sushi (mixed rolls, per piece average)": [s("piece", 30)],
  "Takeaway pizza (margherita, per slice)": [s("slice", 110)],
  "Takeaway pizza (pepperoni, per slice)": [s("slice", 110)],
  "Trail mix": [s("handful (40g)", 40)],

  // ── Drinks ──
  "Orange juice": JUICE,
  "Apple juice": JUICE,
  "Grapefruit juice": JUICE,
  "Pineapple juice": JUICE,
  "Cranberry juice": JUICE,
  "Cola (regular)": CAN_FIZZY,
  "Cola (diet/zero)": CAN_FIZZY,
  "Lemonade (regular)": CAN_FIZZY,
  "Lemonade": CAN_FIZZY,
  "Orange soda": CAN_FIZZY,
  "Energy drink": [s("can (250ml)", 250), s("large can (500ml)", 500)],
  "Energy drink (regular)": [s("can (250ml)", 250), s("large can (500ml)", 500)],
  "Energy drink (sugar-free)": [s("can (250ml)", 250), s("large can (500ml)", 500)],
  "Sports drink (isotonic)": [s("bottle (500ml)", 500)],
  "Squash, diluted (no added sugar)": [s("glass (250ml)", 250)],
  "Coconut water": [s("carton (330ml)", 330)],
  "Tea with milk": MUG,
  "Coffee with whole milk (splash)": MUG,
  "Coffee, black": MUG,
  "Hot chocolate (made with milk)": MUG,
  "Beer, lager (4-5%)": [s("pint (568ml)", 568), s("bottle (330ml)", 330)],
  "Beer, craft/IPA (~6%)": [s("pint (568ml)", 568), s("bottle (330ml)", 330)],
  "Beer, low/no alcohol (<0.5%)": [s("bottle (330ml)", 330)],
  "Cider": [s("pint (568ml)", 568), s("bottle (500ml)", 500)],
  "Wine, red": [s("small glass (125ml)", 125), s("medium glass (175ml)", 175), s("large glass (250ml)", 250)],
  "Wine, white (dry)": [s("small glass (125ml)", 125), s("medium glass (175ml)", 175), s("large glass (250ml)", 250)],
  "Prosecco / Champagne": [s("flute (125ml)", 125)],
  "Spirits, neat (vodka/gin/whisky, 40%)": [s("single (25ml)", 24), s("double (50ml)", 47)],
};

// A scanned / searched packaged product can carry its own serving size (from the barcode database).
// `food.servingG` is that weight in grams; it's offered first in the unit list when present.
export function servingsFor(food) {
  if (!food) return [];
  const base = SERVINGS[food.name] || [];
  const g = Number(food.servingG);
  if (g > 0 && g <= 2000) return [{ label: "serving", grams: g }, ...base.filter((x) => x.label !== "serving")];
  return base;
}

// qty × unit → grams. Unknown/blank unit (or plain "g") means the quantity already IS grams.
export function gramsFrom(qty, unitLabel, servings) {
  const n = Number(qty);
  if (!(n > 0)) return 0;
  if (!unitLabel || unitLabel === "g") return n;
  const u = (servings || []).find((x) => x.label === unitLabel);
  return u ? n * u.grams : n;
}

// How a logged amount reads in the list: "2 × medium (236g)" or just "150g".
export function formatAmount(entry) {
  const grams = Math.round(entry.grams * 10) / 10;
  if (entry.unitLabel && entry.unitLabel !== "g" && entry.qty > 0) {
    const q = Math.round(entry.qty * 100) / 100;
    return `${q} × ${entry.unitLabel} (${grams}g)`;
  }
  return `${grams}g`;
}
